import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../test-fake-db";
import * as helper from "./story-assist";

const notes = "I went to TEST Urgent Care on 09/27/2026.";
const db = new FakeDb({
  leads: [{ id: "lead", firm_id: "firm", campaign_id: "inno", case_type: "mva" }],
  // Deliberately put another matter first: the helper must use the named one.
  claims: [
    { id: "older", lead_id: "lead", firm_id: "firm", campaign_id: "motel", claim_type: "motel", answers: { private: true } },
    { id: "claim", lead_id: "lead", firm_id: "firm", campaign_id: "inno", claim_type: "mva", answers: { mva_call: { story: { text: notes } } } },
  ],
  campaigns: [
    { id: "inno", firm_id: "firm", name: "INNO MVA", intake_template: "mva" },
    { id: "motel", firm_id: "firm", name: "Other campaign", intake_template: "beta_motel" },
  ],
});
function load(relative: string, modules: Record<string, any>) {
  const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  new Function("require", "exports", compiled)((id: string) => { assert.ok(modules[id], id); return modules[id]; }, out);
  return out;
}
const forms = load("../forms.ts", { "@/lib/questionnaire": { intakeForType: () => [] } });
let authenticated = true, allowed = true, form = "mva", reply = JSON.stringify({ suggestions: [
  { id: "seen", value: ["Urgent care"], evidence: "went to TEST Urgent Care" },
  { id: "firstAt", value: "2026-09-27", evidence: "on 09/27/2026" },
] });
let relayCalls = 0, matterCalls = 0;
const route = load("../../app/api/calls/story/route.ts", {
  "next/server": { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200, headers: opts.headers }) } },
  "@/lib/supabase-server": { supabaseServer: async () => db },
  "@/lib/mva-call/server": { requireStaff: async () => authenticated ? { can: () => allowed } : null },
  "@/lib/mva-call/signing-matter": { resolveSigningMatter: async (_: any, lead: string, opts: any) => {
    matterCalls++;
    if (lead !== "lead" || opts.claimId !== "claim") return { ok: false, error: "No accessible matter", status: 404 };
    return { ok: true, lead: db.tables.leads[0], campaignId: "inno", matter: { claim: db.tables.claims[1] } };
  } },
  "@/lib/forms": { resolveFormKey: async (...args: any[]) => form === "mva" ? forms.resolveFormKey(...args) : form },
  "@/lib/ai-relay": { askRelay: async (_: string, body: string) => {
    relayCalls++; const data = JSON.parse(body);
    assert.equal(data.notes, notes);
    assert.ok(data.fields.every((f: any) => !("path" in f)));
    assert.equal(Object.hasOwn(data, "answers"), false, "no other answer/identity payload sent to helper");
    return reply;
  } },
  "@/lib/mva-call/story-assist": helper,
});
const post = (extra: any = {}) => route.POST({ json: async () => ({ lead_id: "lead", claim_id: "claim", notes, ...extra }) });
async function main() {
  authenticated = false; assert.equal((await post()).status, 403); authenticated = true;
  allowed = false; assert.equal((await post()).status, 403); allowed = true;
  assert.equal(matterCalls, 0); assert.equal(relayCalls, 0);
  assert.equal((await post({ claim_id: "" })).status, 400);
  assert.equal((await post({ notes: "short" })).status, 400);
  assert.equal((await post({ lead_id: "foreign" })).status, 404);
  assert.equal((await post({ claim_id: "older" })).status, 404);
  assert.equal((await post({ notes: notes + " edited" })).status, 409);
  form = "netfly_ontake"; assert.equal((await post()).status, 404); form = "mva";
  db.tables.campaigns[0].firm_id = "foreign";
  assert.equal((await post()).status, 404);
  db.tables.campaigns[0].firm_id = "firm";
  assert.equal(relayCalls, 0);
  const before = JSON.stringify(db.tables);
  const result = await post();
  assert.equal(result.status, 200);
  assert.equal(result.body.suggestions.length, 2);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(JSON.stringify(db.tables), before, "suggestion route never writes");
  assert.equal(await forms.resolveFormKey(db, "lead", "missing"), null);
  assert.equal(await forms.resolveFormKey(db, "lead", "older"), "beta_motel");
  assert.equal(await forms.resolveFormKey(db, "lead", "claim"), "mva");
  reply = "not json"; assert.equal((await post()).status, 502);
  reply = ""; assert.equal((await post()).status, 503);
  reply = '{"suggestions":[{"id":"file.ssn","value":"123","evidence":"went to TEST Urgent Care"}]}';
  assert.deepEqual((await post()).body.suggestions, []);
  assert.ok(db.ops.every(op => op.kind === "select"));
  console.log("Story route: permission, named-matter/form isolation, stale notes, read-only behavior, helper failure and protected fields passed");
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
