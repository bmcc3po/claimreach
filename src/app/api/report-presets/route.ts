import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await sb.from("report_presets").select("*").eq("owner", auth.user.id).order("created_at", { ascending: false });
  return NextResponse.json({ presets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("firm_id").eq("id", auth.user.id).maybeSingle();
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const { data, error } = await sb.from("report_presets")
    .insert({ owner: auth.user.id, firm_id: me?.firm_id ?? null, name: b.name.trim(), config: b.config ?? {} })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await sb.from("report_presets").delete().eq("id", id).eq("owner", auth.user.id);
  return NextResponse.json({ ok: true });
}
