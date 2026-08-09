import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// GET — my progress (or ?all=1 for managers: everyone's records).
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const all = new URL(req.url).searchParams.get("all");
  if (all) {
    // RLS lets internal staff read all rows; firm users only see their own.
    const { data } = await sb.from("training_progress").select("*").order("completed_at", { ascending: false });
    return NextResponse.json({ records: data ?? [] });
  }
  const { data } = await sb.from("training_progress").select("*").eq("user_id", auth.user.id);
  return NextResponse.json({ progress: data ?? [] });
}

// POST { module_id, status, quiz_score?, quiz_total? } — upsert my progress.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  const b = await req.json();
  const row: Record<string, any> = {
    firm_id: me?.firm_id, user_id: auth.user.id, user_name: me?.full_name ?? "User",
    module_id: b.module_id, status: b.status ?? "started",
  };
  if (b.quiz_score !== undefined) { row.quiz_score = b.quiz_score; row.quiz_total = b.quiz_total; }
  if (b.status === "completed") row.completed_at = new Date().toISOString();
  const { error } = await sb.from("training_progress").upsert(row, { onConflict: "user_id,module_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
