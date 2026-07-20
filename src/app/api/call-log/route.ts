import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  const b = await req.json();
  const { data, error } = await sb.from("call_logs").insert({
    firm_id: me?.firm_id, lead_id: b.lead_id, claim_id: b.claim_id ?? null,
    author: auth.user.id, author_name: me?.full_name ?? "Staff",
    direction: b.direction ?? "outbound", outcome: b.outcome ?? null,
    duration_min: b.duration_min ?? null, notes: b.notes ?? null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data });
}
