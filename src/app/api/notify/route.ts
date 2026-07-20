import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// GET — list my notifications (mine + broadcasts).
export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await sb.from("notifications")
    .select("id, sender_name, body, lead_id, read_at, created_at")
    .order("created_at", { ascending: false }).limit(30);
  return NextResponse.json({ notifications: data ?? [] });
}

// POST { body, recipient?, lead_id? } send; or { op:'read', id } mark read.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const p = await req.json();

  if (p.op === "read") {
    await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", p.id);
    return NextResponse.json({ ok: true });
  }

  if (!p.body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const { error } = await sb.from("notifications").insert({
    firm_id: me.firm_id, sender: auth.user.id, sender_name: me.full_name ?? "Staff",
    recipient: p.recipient ?? null, lead_id: p.lead_id ?? null, body: p.body,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
