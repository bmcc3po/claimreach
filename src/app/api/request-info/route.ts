import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
export const runtime = "edge";

// Firm -> Innovative request for more info. Creates a staff-facing notification,
// a case note, and an audit entry. The two-way collaboration loop.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { lead_id, claim_id, body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "body required" }, { status: 400 });

  // Notification (broadcast to internal team).
  await sb.from("notifications").insert({
    firm_id: me.firm_id, sender: auth.user.id, sender_name: me.full_name ?? "Firm",
    recipient: null, lead_id, body: `Info requested: ${body}`,
  });
  // Case note (scope request_info).
  await sb.from("notes").insert({
    firm_id: me.firm_id, lead_id, claim_id: claim_id ?? null,
    author: auth.user.id, author_name: me.full_name ?? "Firm",
    scope: "request_info", body,
  });
  await recordAudit({
    firm_id: me.firm_id, lead_id, claim_id,
    actor: auth.user.id, actor_name: me.full_name ?? "Firm",
    category: "message", description: `Requested more info: ${body.slice(0, 80)}`,
  });
  return NextResponse.json({ ok: true });
}
