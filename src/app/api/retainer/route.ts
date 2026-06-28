import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { retainerTokens, fillTemplate } from "@/lib/retainer-tokens";
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lead_id = new URL(req.url).searchParams.get("lead_id");
  const { data: templates } = await sb.from("retainer_templates").select("id, name").order("name");
  const { data: retainers } = await sb.from("retainers").select("*").eq("lead_id", lead_id).order("created_at", { ascending: false });
  const { data: lead } = await sb.from("leads").select("id, first_name, last_name, claimant_name, email, phone").eq("id", lead_id).maybeSingle();
  return NextResponse.json({ templates: templates ?? [], retainers: retainers ?? [], lead: lead ?? null });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();

  if (b.op === "generate") {
    const { data: lead } = await sb.from("leads").select("*").eq("id", b.lead_id).single();
    const { data: claim } = await sb.from("claims").select("answers").eq("lead_id", b.lead_id).limit(1).maybeSingle();
    const { data: tpl } = await sb.from("retainer_templates").select("*").eq("id", b.template_id).single();
    if (!tpl) return NextResponse.json({ error: "template not found" }, { status: 404 });
    const rendered = fillTemplate(tpl.body, retainerTokens(lead, claim?.answers ?? {}));
    const { data, error } = await sb.from("retainers").insert({ lead_id: b.lead_id, template_id: b.template_id, status: "draft", rendered_body: rendered, created_by: auth.user.id }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ retainer: data });
  }
  if (b.op === "set_status") {
    const patch: any = { status: b.status };
    if (b.status === "sent") patch.sent_at = new Date().toISOString();
    if (b.status === "signed") patch.signed_at = new Date().toISOString();
    const { error } = await sb.from("retainers").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.op === "save_template") {
    if (b.id) { await sb.from("retainer_templates").update({ name: b.name, body: b.body }).eq("id", b.id); return NextResponse.json({ ok: true, id: b.id }); }
    const { data, error } = await sb.from("retainer_templates").insert({ name: b.name, body: b.body }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
