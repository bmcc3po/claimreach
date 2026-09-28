import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { archiveSubmission } from "@/lib/docuseal";
import { recordAudit } from "@/lib/audit";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { isSignedStatus } from "@/lib/statuses";
import { agreementName } from "@/lib/mva-call/agreement-names";

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
  const uuid = (x: any) => String(x || "").replace(/[^0-9a-f-]/gi, "");

  // Find the row through the caller's own session first, so a file the
  // agent cannot see cannot be voided by id.
  let row: any = null;
  if (b?.id) {
    const { data } = await sb.from("esign_submissions").select("*").eq("id", uuid(b.id)).maybeSingle();
    row = data;
  } else if (b?.lead_id) {
    let q = sb.from("esign_submissions").select("*").eq("lead_id", uuid(b.lead_id)).neq("status", "voided");
    q = b?.pax_index != null && b.pax_index !== "" ? q.eq("pax_index", Number(b.pax_index)) : q.is("pax_index", null);
    if (b?.claim_id) q = q.or(`claim_id.eq.${uuid(b.claim_id)},claim_id.is.null`);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    row = data;
  }
  if (!row) return NextResponse.json({ error: "There is no agreement to void on this file." }, { status: 404 });
  if (row.status === "voided") return NextResponse.json({ ok: true, already: true });

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!moved) return NextResponse.json({ error: "That agreement just changed (maybe the PNC signed it). Refresh and look again." }, { status: 409 });

  // The matter this agreement belongs to goes back to Contacting when no
  // other live agreement is out on it.
  let statusNote = "";
  let claimId: string | null = row.claim_id ?? null;
  if (!claimId) {
    const { data: cl } = await admin.from("claims").select("id, campaign_id").eq("lead_id", row.lead_id);
    const same = (cl ?? []).filter((c: any) => !row.campaign_id || c.campaign_id === row.campaign_id);
    if ((cl ?? []).length === 1) claimId = cl![0].id; else if (same.length === 1) claimId = same[0].id;
  }
  if (claimId && row.pax_index == null) {
    const { data: live } = await admin.from("esign_submissions").select("id").eq("lead_id", row.lead_id).is("pax_index", null)
      .in("status", ["sent", "opened", "signed", "completed"]).or(`claim_id.eq.${claimId},claim_id.is.null`).limit(1);
    const { data: claim } = await admin.from("claims").select("status").eq("id", claimId).maybeSingle();
    const cur = String(claim?.status || "");
    // Delivered/Retained files are not rolled back here: the firm already
    // has them, and that is a conversation, not a button.
    if (!(live ?? []).length && (cur === "esign_sent" || (isSignedStatus(cur) && cur.startsWith("signed")))) {
      const res = await setClaimStatusForLeads({ leadIds: [row.lead_id], claimIds: [claimId], status: "contacting", actorId: me.id, actorName: me.name ?? "Agent" });
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
