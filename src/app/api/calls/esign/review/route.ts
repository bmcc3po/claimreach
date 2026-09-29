import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { getMatterAgreement, resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { ensureClientSignedSnapshot } from "@/lib/mva-call/client-signed";
import { recordAudit } from "@/lib/audit";

export const runtime = "edge";

/** An explicit human review of the current client's signed PDF. Viewing a
 * status badge or opening a preview does not count as review. */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  const agreementId = String(b?.agreement_id || "");
  if (!agreementId) return NextResponse.json({ error: "Choose the client-signed agreement to review." }, { status: 400 });
  const context = await resolveSigningMatter(sb, leadId, { claimId: b?.claim_id || null });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const selected = await getMatterAgreement(sb, context.lead, context.matter, agreementId);
  if (!selected.ok) return NextResponse.json({ error: selected.error }, { status: selected.status });
  const row = selected.row;
  if (!row || row.status !== "signed" || row.voided_at || !row.signed_at) {
    return NextResponse.json({ error: "Only the current client-signed agreement can be reviewed. Refresh its status first." }, { status: 409 });
  }
  if (row.replacement_requested_at) return NextResponse.json({ error: "This signed original is under supervisor review. Review the corrected agreement instead." }, { status: 409 });
  if (row.agent_reviewed_at) return NextResponse.json({ ok: true, already: true, reviewed_at: row.agent_reviewed_at });
  const admin = supabaseAdmin();
  const snapshot = await ensureClientSignedSnapshot(admin, row);
  if (!snapshot.ok) return NextResponse.json({ error: `The client-signed preview is not available yet: ${snapshot.error}. Nothing was marked reviewed.` }, { status: 503 });
  const reviewedAt = new Date().toISOString();
  const { data: saved, error } = await admin.from("esign_submissions")
    .update({ agent_reviewed_at: reviewedAt, agent_reviewed_by: me.id, updated_at: reviewedAt })
    .eq("id", row.id).eq("status", "signed").is("voided_at", null).is("agent_reviewed_at", null)
    .select("id").maybeSingle();
  if (error || !saved) return NextResponse.json({ error: "The agreement changed while you reviewed it. Refresh; review was not recorded." }, { status: 409 });
  await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
    description: "Inspected the current client-signed agreement preview before office completion or a corrected send.",
    meta: { claim_id: context.matter.claim.id, agreement_id: row.id, client_signed_snapshot: snapshot.path, reviewed_at: reviewedAt } });
  return NextResponse.json({ ok: true, reviewed_at: reviewedAt });
}
