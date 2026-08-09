import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lead = new URL(req.url).searchParams.get("lead");
  const { data } = await sb.from("notes").select("id, author_name, body, created_at")
    .eq("lead_id", lead).eq("scope", "message").order("created_at", { ascending: true }).limit(200);
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("full_name, firm_id, role").eq("id", auth.user.id).maybeSingle();
  const { lead_id, claim_id, body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "body required" }, { status: 400 });
  const { error } = await sb.from("notes").insert({
    firm_id: me?.firm_id, lead_id, claim_id: claim_id ?? null,
    author: auth.user.id, author_name: me?.full_name ?? "User", scope: "message", body,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Notify the other side.
  try {
    await sb.from("notifications").insert({
      firm_id: me?.firm_id, sender: auth.user.id, sender_name: me?.full_name ?? "User",
      recipient: null, lead_id, body: `New case message: ${body.slice(0, 60)}`,
    });
  } catch {}
  return NextResponse.json({ ok: true });
}
