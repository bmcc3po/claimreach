import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "edge";

// Statuses are an owner-editable controlled vocabulary. Everyone reads; only
// owner/admin write. System-locked rows can be edited but not deleted.
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
  const { data } = await sb.from("statuses").select("*").order("sort");
  return NextResponse.json({ statuses: data ?? [] });
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
    key,
    label: String(b.label).trim(),
    track: b.track ?? "none",
    phase: b.phase ?? "pre_qa",
    tone: b.tone ?? "neut",
    side: b.side ?? "agent",
    qualify: b.qualify ?? "undetermined",
    requires_esign: !!b.requires_esign,
    billable: !!b.billable,
    unlocks_firm: !!b.unlocks_firm,
    is_final: !!b.is_final,
    lawruler_group: b.lawruler_group ?? null,
    sort: Number.isFinite(b.sort) ? b.sort : 100,
    active: b.active !== false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin().from("statuses").upsert(row, { onConflict: "key" });
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
  const { data: row } = await supabaseAdmin().from("statuses").select("system_locked").eq("key", key).maybeSingle();
  if (row?.system_locked) return NextResponse.json({ error: "this is a core status and cannot be deleted; set it inactive instead" }, { status: 400 });
  const { error } = await supabaseAdmin().from("statuses").delete().eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
