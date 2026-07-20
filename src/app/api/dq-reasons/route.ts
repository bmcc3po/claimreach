import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "edge";

// DQ reasons: controlled vocabulary. Agents PICK from these; only owner/admin
// add or edit. Retire with active=false to keep history queryable.
async function gate(sb: any) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return { error: "unauthorized", status: 401 as const };
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  return { user: auth.user, role: me?.role };
}

export async function GET() {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { data } = await sb.from("dq_reasons").select("*").order("sort");
  return NextResponse.json({ reasons: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!["owner", "admin"].includes(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const key = String(b.key || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  if (!b.label?.trim()) return NextResponse.json({ error: "label required" }, { status: 400 });
  const row = {
    key, label: String(b.label).trim(), category: b.category ?? "Other",
    sort: Number.isFinite(b.sort) ? b.sort : 100, active: b.active !== false,
  };
  const { error } = await supabaseAdmin().from("dq_reasons").upsert(row, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, key });
}

export async function DELETE(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!["owner", "admin"].includes(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  // Retire rather than hard-delete so historical DQs stay queryable.
  const { error } = await supabaseAdmin().from("dq_reasons").update({ active: false }).eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, retired: true });
}
