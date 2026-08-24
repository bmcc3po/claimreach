import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { applyM6LeadFilters, assertM6Write, getTmpFirmId, requireM6Session } from "@/lib/m6-scope";
import { isInternalRole } from "@/lib/permissions";
import {
  PFS_FORM_KEY, addPfsQuestion, buildPfsAnswersCsv, fieldsFromPfsCsv, mergePfsAnswers,
  mergePfsFields, movePfsQuestion, pfsAnswersOnly, pfsAskable, removePfsQuestion,
  updatePfsQuestion,
} from "@/lib/pfs";
import type { Field } from "@/lib/questionnaire";
export const runtime = "edge";

async function loadLatestForm(sb: any): Promise<{
  id: string; name: string; fields: Field[]; updated_at: string | null; status: string;
} | null> {
  const { data } = await sb.from("intake_forms")
    .select("id, name, fields, updated_at, status, version")
    .eq("claim_type", PFS_FORM_KEY)
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

function formJson(form: { id: string; name: string; fields: Field[]; updated_at: string | null } | null) {
  if (!form) return null;
  return {
    id: form.id,
    name: form.name,
    fields: form.fields,
    updated_at: form.updated_at,
    question_count: pfsAskable(form.fields).length,
  };
}

function canEditSheet(role: string): boolean {
  return isInternalRole(role) && ["owner", "admin", "manager"].includes(role);
}

async function persistFields(
  sb: any,
  session: { user: { id: string } },
  fields: Field[],
  description: string,
  name?: string,
): Promise<{ id: string } | { error: string }> {
  const tmpFirmId = await getTmpFirmId(sb);
  const existing = await loadLatestForm(sb);
  const sheetName = (name || "").trim() || existing?.name || "Plaintiff fact sheet";
  if (existing?.id) {
    const { error } = await sb.from("intake_forms").update({
      name: sheetName, fields, status: "published", description,
    }).eq("id", existing.id);
    if (error) return { error: error.message };
    return { id: existing.id };
  }
  const { data, error } = await sb.from("intake_forms").insert({
    firm_id: tmpFirmId, claim_type: PFS_FORM_KEY, name: sheetName,
    description, fields, status: "published", version: 1, created_by: session.user.id,
  }).select("id").single();
  if (error) return { error: error.message };
  return { id: data.id };
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
  const form = await loadLatestForm(sb);
  const published = form?.status === "published" || (form && pfsAskable(form.fields).length > 0)
    ? form
    : null;

  if (exp) {
    if (!published) return NextResponse.json({ error: "No fact sheet has been imported yet." }, { status: 404 });
    if (leadId) {
      const gate = await assertM6Write(sb, leadId, "id, firm_id, campaign, case_type, archived_at, lead_no, claimant_name");
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
      const { data: claim } = await sb.from("claims").select("answers").eq("lead_id", leadId).order("created_at").limit(1).maybeSingle();
      const stamp = new Date().toISOString().slice(0, 10);
      const safe = String(gate.lead.lead_no || "file").replace(/[^a-z0-9]+/gi, "_");
      return csvResponse(`${safe}_fact_sheet_${stamp}.csv`, buildPfsAnswersCsv(published.fields, [{
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
    return csvResponse(`motel6_fact_sheet_${stamp}.csv`, buildPfsAnswersCsv(published.fields, (leads ?? []).map((l: any) => ({
      lead_no: l.lead_no, claimant_name: l.claimant_name, answers: answersByLead[l.id],
    }))));
  }

  if (!leadId) {
    return NextResponse.json({ form: formJson(published) });
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
    form: formJson(published),
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
    if (!canEditSheet(session.user.role)) {
      return NextResponse.json({ error: "Ask an admin to import the fact sheet." }, { status: 403 });
    }
    const parsed = fieldsFromPfsCsv(String(p.csv || ""));
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 200 });
    const existing = await loadLatestForm(sb);
    const fields = existing?.fields?.length
      ? mergePfsFields(existing.fields, parsed.fields)
      : parsed.fields;
    const saved = await persistFields(
      sb, session, fields,
      "Motel 6 plaintiff fact sheet. Same answers table as intake.",
      (p.name || "").trim() || undefined,
    );
    if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
    return NextResponse.json({ ok: true, id: saved.id, count: pfsAskable(fields).length, fields });
  }

  if (p.op === "add") {
    if (!canEditSheet(session.user.role)) {
      return NextResponse.json({ error: "Ask an admin to add a question." }, { status: 403 });
    }
    const existing = await loadLatestForm(sb);
    const added = addPfsQuestion(existing?.fields ?? [], {
      label: String(p.label || ""),
      kind: String(p.kind || "longtext"),
      section: p.section != null ? String(p.section) : "",
      options: Array.isArray(p.options) ? p.options.map(String) : undefined,
    });
    if (added.error) return NextResponse.json({ error: added.error }, { status: 200 });
    const saved = await persistFields(
      sb, session, added.fields,
      "Motel 6 plaintiff fact sheet. Same answers table as intake.",
    );
    if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
    return NextResponse.json({ ok: true, id: saved.id, field_id: added.id, count: pfsAskable(added.fields).length, fields: added.fields });
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

export async function PATCH(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  if (!canEditSheet(session.user.role)) {
    return NextResponse.json({ error: "Ask an admin to edit a question." }, { status: 403 });
  }
  const p = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(p.id || "");
  if (!id) return NextResponse.json({ error: "Missing the question." }, { status: 400 });
  const existing = await loadLatestForm(sb);
  if (!existing) return NextResponse.json({ error: "No fact sheet yet." }, { status: 404 });

  const dir = p.dir === 1 || p.dir === -1 ? p.dir as 1 | -1 : null;
  const next = dir
    ? movePfsQuestion(existing.fields, id, dir)
    : updatePfsQuestion(existing.fields, id, {
      label: p.label != null ? String(p.label) : undefined,
      kind: p.kind != null ? String(p.kind) : undefined,
      section: p.section != null ? String(p.section) : undefined,
      options: Array.isArray(p.options) ? p.options.map(String) : undefined,
    });
  if (next.error) return NextResponse.json({ error: next.error }, { status: 200 });
  const saved = await persistFields(
    sb, session, next.fields,
    "Motel 6 plaintiff fact sheet. Same answers table as intake.",
  );
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: saved.id, count: pfsAskable(next.fields).length, fields: next.fields });
}

export async function DELETE(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  if (!canEditSheet(session.user.role)) {
    return NextResponse.json({ error: "Ask an admin to delete a question." }, { status: 403 });
  }
  const url = new URL(req.url);
  let id = url.searchParams.get("id") || "";
  if (!id) {
    const p = await req.json().catch(() => ({} as Record<string, unknown>));
    id = String(p.id || "");
  }
  if (!id) return NextResponse.json({ error: "Missing the question." }, { status: 400 });
  const existing = await loadLatestForm(sb);
  if (!existing) return NextResponse.json({ error: "No fact sheet yet." }, { status: 404 });
  const next = removePfsQuestion(existing.fields, id);
  if (next.error) return NextResponse.json({ error: next.error }, { status: 200 });
  const saved = await persistFields(
    sb, session, next.fields,
    "Motel 6 plaintiff fact sheet. Same answers table as intake.",
  );
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: saved.id, count: pfsAskable(next.fields).length, fields: next.fields });
}
