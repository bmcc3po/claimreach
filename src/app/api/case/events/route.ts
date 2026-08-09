import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lead_id = new URL(req.url).searchParams.get("lead_id");
  const { data } = await sb.from("case_events").select("*").eq("lead_id", lead_id).order("event_at");
  return NextResponse.json({ events: data ?? [] });
}
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (b.op === "delete") { await sb.from("case_events").delete().eq("id", b.id); return NextResponse.json({ ok: true }); }
  const { data, error } = await sb.from("case_events").insert({ lead_id: b.lead_id, title: b.title, event_at: b.event_at, notes: b.notes ?? null, created_by: auth.user.id }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
