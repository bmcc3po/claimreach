import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
export const runtime = "edge";

async function gate(sb: any) {
  const actor = await gateUser(sb);
  if (!actor) return { error: "unauthorized", status: 401 as const };
  return { actor, role: actor.role };
}

export async function GET() {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { data, error } = await sb.from("campaigns")
    .select("*, firms(name)").order("name");
  if (error) return NextResponse.json({ error: "Could not load campaigns." }, { status: 503 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!["owner", "admin"].includes(g.role) || !g.actor.can('settings.manage')) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
    // Firm delivery config.
    firm_email: b.firm_email?.trim() || null,
    firm_cc: b.firm_cc?.trim() || null,
    firm_reply_to: b.firm_reply_to?.trim() || null,
    firm_subject_tpl: b.firm_subject_tpl?.trim() || null,
    firm_body_tpl: b.firm_body_tpl?.trim() || null,
    attach_intake_pdf: b.attach_intake_pdf !== false,
    attach_intake_csv: b.attach_intake_csv === true,
    attach_retainer: b.attach_retainer !== false,
    attach_certificate: b.attach_certificate !== false,
    firm_delivery_on: b.firm_delivery_on === true,
  };
  // Use the signed-in client's RLS for every campaign mutation. The previous
  // service-role write trusted any campaign ID supplied by an admin browser.
  if (row.firm_id) {
    const firm = await sb.from('firms').select('id').eq('id', row.firm_id).maybeSingle();
    if (firm.error || !firm.data) return NextResponse.json({ error: 'Firm not available to this account.' }, { status: 403 });
  }
  if (b.id) {
    const existing = await sb.from('campaigns').select('id, firm_id').eq('id', b.id).maybeSingle();
    if (existing.error || !existing.data) return NextResponse.json({ error: 'Campaign not available to this account.' }, { status: 403 });
    if (existing.data.firm_id !== row.firm_id) return NextResponse.json({ error: 'Create a separate campaign for a different firm.' }, { status: 409 });
    let update = sb.from("campaigns").update(row).eq("id", b.id);
    update = row.firm_id ? update.eq('firm_id', row.firm_id) : update.is('firm_id', null);
    const { data, error } = await update.select('id').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Campaign was not saved. Check your access and retry.' }, { status: 403 });
    return NextResponse.json({ ok: true, id: b.id });
  }
  const { data, error } = await sb.from("campaigns").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!["owner", "admin"].includes(g.role) || !g.actor.can('settings.manage')) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Soft-delete: deactivate so historical leads keep their campaign link.
  const existing = await sb.from('campaigns').select('id, firm_id').eq('id', id).maybeSingle();
  if (existing.error || !existing.data) return NextResponse.json({ error: 'Campaign not available to this account.' }, { status: 403 });
  let update = sb.from("campaigns").update({ active: false }).eq("id", id);
  update = existing.data.firm_id ? update.eq('firm_id', existing.data.firm_id) : update.is('firm_id', null);
  const { data, error } = await update.select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Campaign was not changed. Check your access and retry.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
