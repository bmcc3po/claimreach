import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { applyM6LeadFilters, assertM6Write, getTmpFirmId, requireM6Session } from "@/lib/m6-scope";
import { isInternalRole } from "@/lib/permissions";
import {
  PFS_FORM_KEY, buildPfsAnswersCsv, fieldsFromPfsCsv, mergePfsAnswers,
  pfsAnswersOnly, pfsAskable,
} from "@/lib/pfs";
import type { Field } from "@/lib/questionnaire";
export const runtime = "edge";

async function loadPublishedForm(sb: any): Promise<{
  id: string; name: string; fields: Field[]; updated_at: string | null; status: string;
} | null> {
  const { data } = await sb.from("intake_forms")
    .select("id, name, fields, updated_at, status, version")
    .eq("claim_type", PFS_FORM_KEY)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.fields || !Array.isArray(data.fields)) return null;
  return {
    id: data.id,
    name: data.name,
    fields: data.fields as Field[],
    updated_at: data.updated_at ?? null,
    status: data.status,
  };
}

function csvResponse(name: string, body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });

  const url = new URL(req.url);
  const leadId = url.searchParams.get("lead_id") || "";
  const exp = url.searchParams.get("export");
  const form = await loadPublishedForm(sb);

  if (exp) {
    if (!form) return NextResponse.json({ error: "No fact sheet has been imported yet." }, { status: 404 });
    if (leadId) {
      const gate = await assertM6Write(sb, leadId, "id, firm_id, campaign, case_type, archived_at, lead_no, claimant_name");
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
      const { data: claim } = await sb.from("claims").select("answers").eq("lead_id", leadId).order("created_at").limit(1).maybeSingle();
      const stamp = new Date().toISOString().slice(0, 10);
      const safe = String(gate.lead.lead_no || "file").replace(/[^a-z0-9]+/gi, "_");
      return csvResponse(`${safe}_fact_sheet_${stamp}.csv`, buildPfsAnswersCsv(form.fields, [{
        lead_no: gate.lead.lead_no, claimant_name: gate.lead.claimant_name, answers: claim?.answers ?? {},
      }]));
    }
    const tmpFirmId = session.tmpFirmId;
    const { data: leads } = await applyM6LeadFilters(
      sb.from("leads").select("id, lead_no, claimant_name"),
      tmpFirmId,
    ).order("lead_no");
    const ids = (leads ?? []).map((l: any) => l.id);
    const answersByLead: Record<string, any> = {};
    if (ids.length) {
      const { data: claims } = await sb.from("claims").select("lead_id, answers").in("lead_id", ids);
      for (const c of claims ?? []) answersByLead[c.lead_id] = c.answers ?? {};
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return csvResponse(`motel6_fact_sheet_${stamp}.csv`, buildPfsAnswersCsv(form.fields, (leads ?? []).map((l: any) => ({
      lead_no: l.lead_no, claimant_name: l.claimant_name, answers: answersByLead[l.id],
    }))));
  }

  if (!leadId) {
    return NextResponse.json({
      form: form ? { id: form.id, name: form.name, updated_at: form.updated_at, question_count: pfsAskable(form.fields).length } : null,
    });
  }

  const gate = await assertM6Write(sb, leadId, "id, firm_id, campaign, case_type, archived_at, lead_no, claimant_name");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data: claim } = await sb.from("claims")
    .select("id, answers")
    .eq("lead_id", leadId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return NextResponse.json({
    form: form ? { id: form.id, name: form.name, fields: form.fields, updated_at: form.updated_at } : null,
    answers: pfsAnswersOnly(claim?.answers ?? {}),
    claim_id: claim?.id ?? null,
    lead: { id: gate.lead.id, lead_no: gate.lead.lead_no, name: gate.lead.claimant_name },
  });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const p = await req.json();

  if (p.op === "import") {
    if (!isInternalRole(session.user.role) || !["owner", "admin", "manager"].includes(session.user.role)) {
      return NextResponse.json({ error: "Ask an admin to import the fact sheet." }, { status: 403 });
    }
    const parsed = fieldsFromPfsCsv(String(p.csv || ""));
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 200 });
    const tmpFirmId = await getTmpFirmId(sb);
    const name = (p.name || "").trim() || "Plaintiff fact sheet";
    const { data: existing } = await sb.from("intake_forms")
      .select("id, version")
      .eq("claim_type", PFS_FORM_KEY)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await sb.from("intake_forms").update({
        name, fields: parsed.fields, status: "published", description: "Motel 6 plaintiff fact sheet. Imported CSV.",
      }).eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: existing.id, count: pfsAskable(parsed.fields).length });
    }
    const { data, error } = await sb.from("intake_forms").insert({
      firm_id: tmpFirmId, claim_type: PFS_FORM_KEY, name,
      description: "Motel 6 plaintiff fact sheet. Imported CSV.",
      fields: parsed.fields, status: "published", version: 1, created_by: session.user.id,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id, count: pfsAskable(parsed.fields).length });
  }

  if (p.op === "save") {
    const leadId = String(p.lead_id || "");
    if (!leadId) return NextResponse.json({ error: "Missing the file." }, { status: 400 });
    const gate = await assertM6Write(sb, leadId);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const { data: claim } = await sb.from("claims")
      .select("id, answers")
      .eq("lead_id", leadId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!claim) return NextResponse.json({ error: "This file has no claim yet. Open Case Questions first." }, { status: 200 });
    const next = mergePfsAnswers(claim.answers, p.answers);
    const { error } = await sb.from("claims").update({ answers: next }).eq("id", claim.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, answers: pfsAnswersOnly(next) });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
