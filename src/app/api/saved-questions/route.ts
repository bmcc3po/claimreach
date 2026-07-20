import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await sb.from("saved_questions").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ questions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  if (b.op === "delete") {
    await sb.from("saved_questions").delete().eq("id", b.id);
    return NextResponse.json({ ok: true });
  }
  const { data, error } = await sb.from("saved_questions").insert({
    firm_id: me.firm_id, label: b.label, field: b.field, tags: b.tags ?? [], created_by: auth.user.id,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}
