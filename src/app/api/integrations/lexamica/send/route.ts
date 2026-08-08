import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { buildLexamicaPayload, type SummaryField, type LexamicaPayload } from "@/lib/lexamica";
export const runtime = "edge";

// ============================================================================
// SEND A LEAD TO THE LEXAMICA NETWORK
//
// Agent initiated, for a file that qualifies on the merits but is not one this
// firm signs: outside their criteria, or outside their venue.
//
// THIS IS A DIRECT CALL, NOT A QUEUED JOB, and that is deliberate.
// /api/cron/automations and /api/cron/drips call drainQueue(), but nothing is
// scheduled that ever hits them, so anything enqueued sits forever. We would
// find out when Lexamica said they had received nothing. Firm delivery works
// today precisely because it is inline in the status-change path. This follows
// that pattern.
//
// Every send is logged with the exact payload and the exact response. The first
// time a firm asks "we sent you 40, why did 37 land", that table is the only
// thing that can answer it.
// ============================================================================

const ENDPOINT = process.env.LEXAMICA_URL ?? "";
const KEY = process.env.LEXAMICA_KEY ?? "";

export async function postToLexamica(payload: LexamicaPayload) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* not json, keep the raw text */ }
  return { status: res.status, ok: res.ok, text, parsed };
}

/** Their id can come back under a few plausible names. Look, do not assume. */
export function extractLexamicaId(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  for (const k of ["LexamicaId", "lexamicaId", "id", "caseId", "CaseId", "_id"]) {
    const v = body[k];
    if (typeof v === "string" && v) return v;
  }
  if (body.data) return extractLexamicaId(body.data);
  return null;
}

export async function POST(req: NextRequest) {
  if (!ENDPOINT || !KEY) {
    return NextResponse.json({ error: "LEXAMICA_URL and LEXAMICA_KEY must be set in the environment" }, { status: 500 });
  }

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const leadId: string = body.lead_id ?? "";
  const force: boolean = body.force === true;
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: lead } = await admin.from("leads")
    .select("id, lead_no, firm_id, case_type, claimant_name, first_name, phone, email, lexamica_id")
    .eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  // Agents double click. Without this they post the same claimant into someone
  // else's referral network twice and it looks like two cases.
  if (lead.lexamica_id && !force) {
    return NextResponse.json({
      error: "already sent",
      lexamica_id: lead.lexamica_id,
      hint: "send again with force: true only if you mean to duplicate it",
    }, { status: 409 });
  }

  const { data: claim } = await admin.from("claims")
    .select("id, claim_type, answers")
    .eq("lead_id", lead.id).order("created_at", { ascending: true }).limit(1).maybeSingle();

  const caseType = claim?.claim_type ?? lead.case_type ?? "";
  const answers = (claim?.answers ?? {}) as Record<string, unknown>;

  // ONE form lookup, resolved here and passed down. A second independent lookup
  // inside the builder is exactly what printed the Motel 6 exports with every
  // question and no answers.
  const { data: form } = await admin.from("intake_forms")
    .select("fields")
    .eq("claim_type", caseType).is("firm_id", null).is("campaign_id", null)
    .order("version", { ascending: false }).limit(1).maybeSingle();

  const fields = (form?.fields ?? []) as SummaryField[];

  // leads carries claimant_name as one string; Lexamica wants it split.
  const whole = String(lead.claimant_name ?? "").trim();
  const firstName = String(lead.first_name ?? "").trim() || whole.split(/\s+/)[0] || "";
  const lastName = whole.split(/\s+/).slice(1).join(" ") || "";

  const { payload, missing } = buildLexamicaPayload({
    firstName, lastName,
    phone: lead.phone, email: lead.email,
    caseType, leadId: lead.lead_no ?? lead.id,
    answers, fields,
  });

  // Better to block the agent than to post a half file into a referral network
  // that another firm is going to work.
  if (missing.length) {
    return NextResponse.json({
      error: "incomplete", missing,
      hint: "these are required by Lexamica and came back empty on this file",
    }, { status: 422 });
  }

  const sent = await postToLexamica(payload);
  const lexId = sent.ok ? extractLexamicaId(sent.parsed) : null;

  await admin.from("lexamica_submissions").insert({
    lead_id: lead.id,
    payload,
    http_status: sent.status,
    response_body: sent.text?.slice(0, 8000) ?? null,
    lexamica_id: lexId,
    sent_by: auth.user.id,
  });

  if (sent.ok) {
    await admin.from("leads").update({ lexamica_id: lexId ?? "sent" }).eq("id", lead.id);
  }

  // The agent sees the real outcome. A silent failure here means a file nobody
  // follows up on, in a lane nobody is watching.
  return NextResponse.json({
    ok: sent.ok,
    http_status: sent.status,
    lexamica_id: lexId,
    response: sent.parsed ?? sent.text,
    payload,
  }, { status: sent.ok ? 200 : 502 });
}
