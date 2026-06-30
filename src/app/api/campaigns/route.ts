import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

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
  const { data } = await sb.from("campaigns")
    .select("*, firms(name)").order("name");
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!["owner", "admin"].includes(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!b.case_type?.trim()) return NextResponse.json({ error: "case type required" }, { status: 400 });
  const row: any = {
    name: b.name.trim(), firm_id: b.firm_id || null, case_type: b.case_type.trim().toLowerCase(),
    intake_template: b.intake_template || b.case_type.trim().toLowerCase(),
    retainer_template_id: b.retainer_template_id || null,
    esign_required: b.esign_required !== false,
    retainer_packet: Array.isArray(b.retainer_packet) ? b.retainer_packet : [],
    tier: b.tier || null, bill_rate: Number.isFinite(b.bill_rate) ? b.bill_rate : null,
    active: b.active !== false, updated_at: new Date().toISOString(),
  };
  if (b.id) {
    const { error } = await supabaseAdmin().from("campaigns").update(row).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: b.id });
  }
  const { data, error } = await supabaseAdmin().from("campaigns").insert(row).select("id").single();
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
  // Soft-delete: deactivate so historical leads keep their campaign link.
  const { error } = await supabaseAdmin().from("campaigns").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
