import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { retainerTokens, fillTemplate } from "@/lib/retainer-tokens";
import { recordAudit } from "@/lib/audit";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lead_id = new URL(req.url).searchParams.get("lead_id");
  const claimId = new URL(req.url).searchParams.get("claim_id");
  const context = await resolveSigningMatter(sb, lead_id || "", { claimId, allowArchived: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data: templates } = await sb.from("retainer_templates").select("id, name, case_type, is_default").order("name");
  const { data: retainers, error } = await sb.from("retainers").select("*").eq("lead_id", lead_id)
    .or(context.matter.sole ? `claim_id.eq.${context.matter.claim.id},claim_id.is.null` : `claim_id.eq.${context.matter.claim.id}`).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: lead } = await sb.from("leads").select("id, first_name, last_name, claimant_name, email, phone, case_type").eq("id", lead_id).maybeSingle();
  return NextResponse.json({ templates: templates ?? [], retainers: retainers ?? [], lead: lead ?? null });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const me = await gateUser(sb);
  if (!me || !isInternalRole(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (["generate", "set_status", "delete"].includes(b.op)) return NextResponse.json({ error: "Legacy retainers are preserved as history. Use the matter's DocuSeal agreement or emergency packet; signed evidence cannot be manually changed or deleted here." }, { status: 409 });
  if (["save_template", "delete_template"].includes(b.op) && !me.can("settings.manage")) return NextResponse.json({ error: "Template setup requires settings permission." }, { status: 403 });

  if (b.op === "generate") {
    const { data: lead } = await sb.from("leads").select("*").eq("id", b.lead_id).single();
    const { data: claim } = await sb.from("claims").select("answers").eq("lead_id", b.lead_id).limit(1).maybeSingle();
    const { data: tpl } = await sb.from("retainer_templates").select("*").eq("id", b.template_id).single();
    if (!tpl) return NextResponse.json({ error: "template not found" }, { status: 404 });
    const rendered = fillTemplate(tpl.body, retainerTokens(lead, claim?.answers ?? {}));
    const { data, error } = await sb.from("retainers").insert({ lead_id: b.lead_id, template_id: b.template_id, status: "draft", rendered_body: rendered, created_by: auth.user.id }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await recordAudit({ firm_id: lead?.firm_id, lead_id: b.lead_id, actor: auth.user.id, category: "retainer", description: `Generated retainer "${tpl.name}".` });
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
    const caseType = b.case_type && b.case_type !== "any" ? b.case_type : null;
    // If marking default, clear other defaults for the same case_type scope first.
    if (b.is_default) {
      const q = sb.from("retainer_templates").update({ is_default: false });
      if (caseType) await q.eq("case_type", caseType);
      else await q.is("case_type", null);
    }
    if (b.id) {
      await sb.from("retainer_templates").update({ name: b.name, body: b.body, case_type: caseType, is_default: !!b.is_default }).eq("id", b.id);
      return NextResponse.json({ ok: true, id: b.id });
    }
    const { data, error } = await sb.from("retainer_templates").insert({ name: b.name, body: b.body, case_type: caseType, is_default: !!b.is_default }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }
  if (b.op === "delete") {
    // Delete a single retainer instance on a file.
    const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
    if (!me || !["owner", "admin", "manager"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { error } = await sb.from("retainers").delete().eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (b.lead_id) await recordAudit({ lead_id: b.lead_id, actor: auth.user.id, category: "retainer", description: "Deleted a retainer from the file." });
    return NextResponse.json({ ok: true });
  }
  if (b.op === "delete_template") {
    // Delete a reusable retainer template (global).
    const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
    if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { error } = await sb.from("retainer_templates").delete().eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
