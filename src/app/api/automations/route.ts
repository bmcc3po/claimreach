import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// Automation rules CRUD. Read for staff; write for owner/admin.
async function gate(sb: any) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return { error: "unauthorized", status: 401 as const };
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  return { user: auth.user, role: me?.role, firm_id: me?.firm_id };
}

export async function GET() {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { data } = await sb.from("automations").select("*").order("updated_at", { ascending: false });
  return NextResponse.json({ automations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!["owner", "admin"].includes(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!b.trigger_type) return NextResponse.json({ error: "trigger required" }, { status: 400 });
  const row: any = {
    firm_id: b.firm_id ?? g.firm_id ?? null,
    name: String(b.name).trim(),
    active: !!b.active,
    trigger_type: b.trigger_type,
    trigger_config: b.trigger_config ?? {},
    conditions: b.conditions ?? {},
    steps: b.steps ?? [],
    stop_conditions: b.stop_conditions ?? [],
    send_window: b.send_window ?? {},
    retrigger: !!b.retrigger,
    updated_at: new Date().toISOString(),
  };
  if (b.id) {
    const { error } = await supabaseAdmin().from("automations").update(row).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: b.id });
  }
  row.created_by = g.user.id;
  const { data, error } = await supabaseAdmin().from("automations").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!["owner", "admin"].includes(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabaseAdmin().from("automations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
