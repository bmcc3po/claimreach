import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { buildLexamicaPayload, postToLexamica, extractLexamicaId, type SummaryField } from "@/lib/lexamica";
export const runtime = "edge";

// ============================================================================
// LEXAMICA SANDBOX TEST
//
// Fires a complete, realistic payload at the sandbox with NO dependency on a
// lead, a claim, a form, or the console picker. That decoupling is the point:
// the sandbox handshake is on Lexamica's clock, and it should not be blocked by
// anything still being wired on our side.
//
// Open it in a browser while signed in:
//   /api/integrations/lexamica/test
//
// It returns the exact request and the exact response, which is precisely what
// Lexamica asks for to confirm the case landed. Screenshot it or copy the JSON.
//
// The sample deliberately exercises the two things most likely to be wrong:
// a boolean answer (must read Yes, not true) and a stored choice key (must read
// "Under $10,000", not "under_10k").
// ============================================================================

const SAMPLE_FIELDS: SummaryField[] = [
  { id: "what_happened", script: "Tell me, to the best of your ability, a brief description of what happened.", kind: "longtext" },
  { id: "date", script: "What was the exact date of the accident?", kind: "date" },
  { id: "incident_city_state", script: "And where did this happen? City and state.", kind: "text" },
  { id: "injured", script: "Were you hurt in the accident?", kind: "select",
    choices: [{ value: "yes", label: "Yes, injured" }, { value: "no", label: "No injuries at all" }] },
  { id: "injuries", script: "Tell me about your injuries. What is hurting?", kind: "multiselect",
    choices: [
      { value: "neck_back", label: "Neck or back pain" },
      { value: "whiplash", label: "Whiplash" },
      { value: "broken", label: "Broken bones" },
    ] },
  { id: "treatment", script: "Where are you at with treatment?", kind: "select",
    choices: [
      { value: "still", label: "Still treating" },
      { value: "finished", label: "Finished treatment" },
      { value: "never", label: "Has not seen a doctor yet" },
    ] },
  { id: "bills", script: "Do you have a rough idea what your medical bills are so far?", kind: "select",
    choices: [
      { value: "under_10k", label: "Under $10,000" },
      { value: "10k_50k", label: "$10,000 to $50,000" },
    ] },
  { id: "attorney", script: "Are you already working with an attorney on this accident?", kind: "select",
    choices: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
  { id: "settled", script: "Have you already settled this, or signed a release with any insurance company?", kind: "bool" },
  { id: "fault", script: "Do you believe you or the other party was at fault?", kind: "select",
    choices: [
      { value: "other", label: "The other driver" },
      { value: "shared", label: "Shared or not sure" },
    ] },
];

const SAMPLE_ANSWERS: Record<string, unknown> = {
  what_happened: "Rear ended at a red light on Charlotte Pike. The other driver did not brake.",
  date: "2026-06-14",
  incident_city_state: "Nashville, TN",
  injured: "yes",
  injuries: ["neck_back", "whiplash"],
  treatment: "still",
  bills: "under_10k",
  attorney: "no",
  settled: false,                 // must render as "No", never as "false"
  fault: "other",
  case_manager_notes: "",         // empty, must be skipped entirely
};

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(_req: NextRequest) {
  const url = process.env.LEXAMICA_URL ?? "";
  const key = process.env.LEXAMICA_KEY ?? "";
  if (!url || !key) {
    return NextResponse.json({
      error: "not configured",
      detail: "Set LEXAMICA_URL and LEXAMICA_KEY in the Cloudflare environment, then reload.",
      url_set: !!url, key_set: !!key,
    }, { status: 500 });
  }

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { payload, missing } = buildLexamicaPayload({
    firstName: "Jane", lastName: "Sample",
    phone: "555-123-4567", email: "jane.sample@example.com",
    caseType: "mva",
    leadId: `claimreach-test-${Date.now()}`,
    answers: SAMPLE_ANSWERS,
    fields: SAMPLE_FIELDS,
  });

  if (missing.length) {
    return NextResponse.json({ error: "sample is incomplete", missing }, { status: 500 });
  }

  const sent = await postToLexamica(payload, url, key);

  return NextResponse.json({
    ok: sent.ok,
    what_we_sent: { url, headers: { "Content-Type": "application/json", Authorization: "Key <redacted>" }, body: payload },
    what_came_back: { http_status: sent.status, body: sent.parsed ?? sent.text },
    lexamica_id: extractLexamicaId(sent.parsed),
  }, { status: sent.ok ? 200 : 502 });
}
