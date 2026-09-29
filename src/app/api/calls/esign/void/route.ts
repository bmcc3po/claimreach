import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { archiveSubmission } from "@/lib/docuseal";
import { recordAudit } from "@/lib/audit";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { isSignedStatus } from "@/lib/statuses";
import { agreementName } from "@/lib/mva-call/agreement-names";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided } from "@/lib/mva-call/signing-matter";
import { matterRowsFilter } from "@/lib/matter";
import { paxParentId } from "@/lib/linked-files";

export const runtime = "edge";

// POST /api/calls/esign/void
//   { id }                                  one agreement row, or
//   { lead_id, claim_id?, pax_index? }      the matter's newest agreement
//   + reason (required)
//
// Brett, Sep 28: "I need the ability to void a sent retainer, and to delete
// one if the PNC signed it incorrectly and we had to resend."
//   Not signed yet  : any staff member. The DocuSeal link is archived first;
//                     if DocuSeal will not archive it, nothing changes (the
//                     PNC could still sign a link we called void).
//   Signed/complete : owner or admin only. The row and its stored PDFs are
//                     kept as evidence, marked voided with who, when and why.
// Either way the matter goes back to Contacting when this was its only live
// agreement, and the send opens again on every screen.
const UNSIGNED = ["sent", "opened", "sending", "failed", "declined", "expired"];
const SIGNED = ["signed", "completed"];

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const reason = String(b?.reason || "").trim().slice(0, 300);
  if (reason.length < 3) return NextResponse.json({ error: "Say why it is being voided (for example: wrong agreement, sent to the wrong number)." }, { status: 400 });
  const admin = supabaseAdmin();
  // History may name an exact envelope. Resolve its own file/matter through
  // the session before the admin update; a supplied different identity fails.
  let leadId = String(b?.lead_id || "");
  let claimId = b?.claim_id || null;
  const agreementId = b?.agreement_id || b?.id || null;
  if (agreementId) {
    const { data: named, error: readError } = await sb.from("esign_submissions").select("lead_id, claim_id").eq("id", agreementId).maybeSingle();
    if (readError) return NextResponse.json({ error: `Could not read the agreement: ${readError.message}` }, { status: 500 });
    if (!named) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
    if (leadId && leadId !== named.lead_id) return NextResponse.json({ error: "That agreement belongs to another file." }, { status: 409 });
    leadId = named.lead_id;
    claimId = claimId || named.claim_id;
  }
  const context = await resolveSigningMatter(sb, leadId, { claimId });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const selected = await getMatterAgreement(sb, context.lead, context.matter, agreementId, { allowHistorical: true });
  if (!selected.ok) return NextResponse.json({ error: selected.error }, { status: selected.status });
  const row = selected.row;
  if (!row) return NextResponse.json({ error: "There is no agreement to void on this file." }, { status: 404 });
  if (agreementIsVoided(row)) return NextResponse.json({ ok: true, already: true });

  const signed = SIGNED.includes(row.status);
  if (!signed && !UNSIGNED.includes(row.status)) return NextResponse.json({ error: `This agreement is ${row.status}; it cannot be voided.` }, { status: 409 });
  if (signed && !["owner", "admin"].includes(me.role)) {
    return NextResponse.json({ error: "The PNC already signed this one. Only an owner or admin can void a signed agreement." }, { status: 403 });
  }

  // Kill the link. An unsigned agreement whose link DocuSeal will not archive
  // stays as it is: calling it void while the PNC can still sign it would
  // bring the wrong agreement back as signed.
  let dsNote = "";
  if (row.submission_id) {
    const a = await archiveSubmission(row.submission_id);
    if (!a.ok && a.status !== 404) {
      if (!signed) {
        return NextResponse.json({ error: `DocuSeal did not cancel the signing link (${a.error}). Nothing changed. Try again in a minute; if it keeps failing, archive it in DocuSeal and try again.` }, { status: 502 });
      }
      dsNote = ` DocuSeal did not archive it (${a.error}); the signed copy stays on the file either way.`;
    }
  }

  const now = new Date().toISOString();
  const { data: moved, error } = await admin.from("esign_submissions").update({
    status: "voided", voided_at: now, voided_by: me.id, void_reason: reason, updated_at: now,
  }).eq("id", row.id).eq("status", row.status).select("id").maybeSingle();
  if (error || !moved) {
    const message = `DocuSeal cancellation was attempted, but the local void did not save${error ? ` (${error.message})` : " because the agreement changed"}. Refresh and have an owner or admin reconcile this agreement before sending a replacement.`;
    await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
      description: message, meta: { submission_row: row.id, submission_id: row.submission_id, claim_id: context.matter.claim.id, reason, needs_reconciliation: true } });
    return NextResponse.json({ error: message, needs_reconciliation: true, agreement_id: row.id }, { status: error ? 500 : 409 });
  }

  // The matter this agreement belongs to goes back to Contacting when no
  // other live agreement is out on it.
  let statusNote = "";
  claimId = context.matter.claim.id;
  {
    let liveQuery = admin.from("esign_submissions").select("id").eq("lead_id", row.lead_id).is("voided_at", null)
      .in("status", ["sent", "opened", "signed", "completed"]).or(matterRowsFilter(context.matter));
    if (!paxParentId(context.lead.external_id)) liveQuery = liveQuery.is("pax_index", null);
    const { data: live, error: liveError } = await liveQuery.limit(1);
    const { data: claim, error: claimError } = await admin.from("claims").select("status").eq("id", claimId).maybeSingle();
    const cur = String(claim?.status || "");
    // Delivered/Retained files are not rolled back here: the firm already
    // has them, and that is a conversation, not a button.
    if (liveError || claimError || !claim) statusNote = " The agreement is voided, but the file status could not be checked. Refresh and review its status.";
    else if (!(live ?? []).length && (cur === "esign_sent" || (isSignedStatus(cur) && cur.startsWith("signed")))) {
      const res = await setClaimStatusForLeads({ leadIds: [row.lead_id], claimIds: [claimId], status: "contacting", expectedStatus: claim.status, actorId: me.id, actorName: me.name ?? "Agent" });
      statusNote = res.ok ? " The file is back to Contacting until the new one goes out." : ` The status did not change: ${res.error}`;
    }
  }

  await recordAudit({
    firm_id: row.firm_id, lead_id: row.lead_id, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
    description: `Voided the ${signed ? "SIGNED " : ""}${agreementName(row.template_key) || "agreement"}${row.pax_index != null ? " (passenger)" : ""}: ${reason}.${dsNote}${statusNote}`.slice(0, 600),
    meta: { submission_row: row.id, submission_id: row.submission_id, previous_status: row.status, claim_id: claimId, reason },
  });

  return NextResponse.json({ ok: true, voided: row.id, was: row.status, note: (dsNote + statusNote).trim() });
}
