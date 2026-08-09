import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// GET ?lead_id=  -> timeline for a file
// GET ?unmatched=1 -> the unmatched inbox
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("unmatched")) {
    const { data } = await sb.from("communications").select("*").is("lead_id", null).order("occurred_at", { ascending: false }).limit(100);
    return NextResponse.json({ comms: data ?? [] });
  }
  const lead_id = url.searchParams.get("lead_id");
  const { data } = await sb.from("communications").select("*").eq("lead_id", lead_id).order("occurred_at", { ascending: false });
  return NextResponse.json({ comms: data ?? [] });
}

// POST { op:'assign', id, lead_id } -> manually attach an unmatched comm to a file
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (b.op === "assign") {
    const { data: lead } = await sb.from("leads").select("firm_id").eq("id", b.lead_id).maybeSingle();
    const { error } = await sb.from("communications").update({ lead_id: b.lead_id, firm_id: lead?.firm_id ?? null }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
