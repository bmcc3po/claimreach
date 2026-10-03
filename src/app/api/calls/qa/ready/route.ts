import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { resolveMatter } from "@/lib/matter";
import { POST as submitQa } from "@/app/api/qa/route";
export const runtime = "edge";

/** One narrow Desk action. The pilot must not expose the legacy QA handler's
 * unrelated draft/thread/admin operations merely to let agents send their file. */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer(), user = await gateUser(sb);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isInternalRole(user.role) || !user.can("claims.status")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || body.op !== "submit" || body.decision !== "approve"
    || typeof body.lead_id !== "string" || typeof body.claim_id !== "string" || !body.lead_id || !body.claim_id)
    return NextResponse.json({ error: "Use the final file review to approve this matter." }, { status: 400 });
  const { data: lead, error } = await sb.from("leads").select("id,firm_id,archived_at").eq("id", body.lead_id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not verify file access. Please retry." }, { status: 503 });
  if (!lead) return NextResponse.json({ error: "File not found." }, { status: 404 });
  if (lead.archived_at) return NextResponse.json({ error: "Restore this archived file before reviewing it." }, { status: 409 });
  const matter = await resolveMatter(sb, lead.id, { claimId: body.claim_id, authoritativeDb: supabaseAdmin() });
  if (!matter.ok) return NextResponse.json({ error: matter.error }, { status: matter.status });
  if (matter.claim.firm_id !== lead.firm_id) return NextResponse.json({ error: "This matter does not belong to the selected firm." }, { status: 409 });
  // Existing QA checks still require the agent's own signed disposition,
  // completed packet, signature review, complete answers and three attestations.
  return submitQa(new NextRequest(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({
    op: "submit", decision: "approve", lead_id: lead.id, claim_id: matter.claim.id, agent_ready: user.role === "agent",
    g_qa_pass: body.g_qa_pass, g_esign: body.g_esign, g_criteria: body.g_criteria,
    confirm_intake: body.confirm_intake, confirm_signed_packet: body.confirm_signed_packet, confirm_criteria: body.confirm_criteria,
    qa_note: typeof body.qa_note === "string" ? body.qa_note.slice(0, 2000) : "",
  }) }));
}
