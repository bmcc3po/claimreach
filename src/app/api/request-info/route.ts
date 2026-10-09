import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
export const runtime = "edge";

// Firm -> Innovative request for more info. Creates a staff-facing notification,
// a case note, and an audit entry. The two-way collaboration loop.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload.lead_id !== "string" || typeof payload.body !== "string" || !payload.body.trim()) return NextResponse.json({ error: "File and message required." }, { status: 400 });
  if (payload.claim_id != null && typeof payload.claim_id !== "string") return NextResponse.json({ error: "Choose a case first." }, { status: 400 });
  const { lead_id, body } = payload;
  const context = await resolveSigningMatter(sb, lead_id, { claimId: payload.claim_id });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const claim_id = context.matter.claim.id;

  // Notification (broadcast to internal team).
  const notified = await sb.from("notifications").insert({
    firm_id: context.lead.firm_id, sender: auth.user.id, sender_name: me.full_name ?? "Firm",
    recipient: null, lead_id, body: `Info requested: ${body}`,
  });
  if (notified.error) return NextResponse.json({ error: "The request could not be sent. Your draft is still here." }, { status: 500 });
  // Case note (scope request_info).
  const noted = await sb.from("notes").insert({
    firm_id: context.lead.firm_id, lead_id, claim_id,
    author: auth.user.id, author_name: me.full_name ?? "Firm",
    scope: "request_info", body,
  });
  if (noted.error) {
    await recordAudit({ firm_id: context.lead.firm_id, lead_id, claim_id, actor: auth.user.id, actor_name: me.full_name ?? "Firm", category: "message", description: "Info request notification sent; case note failed to save. Review before retrying." });
    return NextResponse.json({ error: "The request notification was sent, but its case note did not save. Check history before retrying." }, { status: 503 });
  }
  await recordAudit({
    firm_id: context.lead.firm_id, lead_id, claim_id,
    actor: auth.user.id, actor_name: me.full_name ?? "Firm",
    category: "message", description: `Requested more info: ${body.slice(0, 80)}`,
  });
  return NextResponse.json({ ok: true });
}
