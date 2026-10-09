import * as archiveControl from './archive-control';
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "./test-fake-db";
import * as ontake from "./netfly-ontake";
import * as deliverySettings from "./netfly-delivery-settings";
import { assertHandoffFirm } from "./netfly-handoff-save";
import * as handoff from "./netfly-handoff";

const FIRM = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const CLAIM = "33333333-3333-4333-8333-333333333333";
const db = new FakeDb({
  firms: [{ id: FIRM, name: "Example, Second & Third", slug: "est" }],
  leads: [{ id: LEAD, firm_id: FIRM, campaign_id: "netfly", archived_at: null, lead_no: "TMP-1", claimant_name: "Synthetic Person", created_at: "2026-10-01T00:00:00.000Z" }],
  claims: [{ id: CLAIM, lead_id: LEAD, firm_id: FIRM, campaign_id: "netfly", answers: {}, updated_at: "2026-10-01T00:00:00.000Z" },
    { id: "44444444-4444-4444-8444-444444444444", lead_id: LEAD, firm_id: FIRM, campaign_id: "other", answers: { private_other_campaign: true } }],
  case_documents: [],
});
let actor = { id: "agent-a", name: "Agent A", can: () => true };
const ctx = () => ({ actor, db, campaign: { id: "netfly", firm_id: FIRM } });
const code = fs.readFileSync(path.resolve(__dirname, "../app/api/netfly/route.ts"), "utf8");
const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modules: Record<string, any> = {
  "@/lib/archive-control": archiveControl,
    "next/server": { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) } },
  "@/lib/netfly-server": { netflyContext: async () => ctx(), netflyMatter: async (_ctx: any, key: string) => key === LEAD ? { lead: { id: LEAD }, claim: db.tables.claims[0] } : null },
  "@/lib/netfly-ontake": ontake,
  "@/lib/netfly-delivery-settings": deliverySettings,
  "@/lib/netfly-handoff": handoff,
  "@/lib/netfly-handoff-save": { assertHandoffFirm, saveNetflyHandoff: async () => { throw new Error('Not used by presence tests'); } },
  "@/lib/mva-call/server": { parseDob: () => null },
  "@/lib/us-address": { mailColumnsFrom: () => ({}) },
  "@/lib/mva-call/esign": { packetShort: async () => false },
  "@/lib/comms": { normPhone: (value: string) => value.replace(/\D/g, "") },
};
const route: any = {};
new Function("require", "exports", compiled)((name: string) => {
  if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
  return modules[name];
}, route);
const post = async (action: string) => route.POST({ json: async () => ({ op: "call_presence", file: LEAD, action }) });

async function main() {
  const wrongFirm = await route.POST({ json: async () => ({ op: "create", name: "Synthetic Wrong Firm",
    source_note: "Accident Intake Note – Other Law FL\nClient: Synthetic Wrong Firm" }) });
  assert.equal(wrongFirm.status, 409);
  assert.match(wrongFirm.body.error, /different or unrecognized/);
  assert.equal(db.tables.leads.length, 1, "manual paste cannot create a file for another firm");
  const started = await post("start");
  assert.equal(started.status, 200);
  assert.equal(started.body.live_call.by_name, "Agent A");
  actor = { id: "agent-b", name: "Agent B", can: () => true };
  assert.equal((await post("start")).status, 409);
  assert.equal((await post("end")).status, 409);
  actor = { id: "agent-a", name: "Agent A", can: () => true };
  assert.equal((await post("refresh")).status, 200);
  assert.equal((await post("end")).body.live_call, null);
  actor = { id: "agent-b", name: "Agent B", can: () => true };
  assert.equal((await post("start")).body.live_call.by_name, "Agent B");
  assert.equal(ontake.activeNetflyCall({ by: "x", by_name: "Expired", expires_at: "2026-01-01T00:00:00Z" }), null);
  const listed = await route.GET({ url: "https://synthetic.invalid/api/netfly" });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.files.length, 1);
  assert.equal(listed.body.files[0].claims.length, 1);
  assert.equal(listed.body.files[0].claims[0].id, CLAIM);
  assert.deepEqual(listed.body.files[0].missing_source, ["handoff_note", "signed_retainer_pdf"]);
  const answer = (field: string, value: string) => route.POST({ json: async () => ({ op: "answer", file: LEAD, field, value }) });
  assert.equal((await answer("first_visit_unavailable", "Not available yet")).status, 200);
  assert.equal(db.tables.claims[0].answers.netfly_secondary.fields.first_visit_unavailable, "Not available yet");
  assert.equal(db.tables.claims[0].answers.netfly_secondary.fields.first_visit, undefined, "unavailable must not create a fake date");
  assert.equal((await answer("first_visit", "2026-09-28")).status, 200);
  assert.equal(db.tables.claims[0].answers.netfly_secondary.fields.first_visit, "2026-09-28");
  assert.equal(db.tables.claims[0].answers.netfly_secondary.fields.first_visit_unavailable, "", "a real answer clears its follow-up marker");
  assert.equal((await answer("confirmed_phone_unavailable", "Not available yet")).status, 200);
  assert.equal(db.tables.leads[0].phone, undefined, "unavailable is not a replacement phone number");
  assert.deepEqual(db.tables.claims[1].answers, { private_other_campaign: true }, "answers must stay on the NETFLY matter");
  db.tables.claims[0].answers = { netfly_secondary: {
    handoffs: [{ note: "Synthetic original note", source_id: "42" }],
    source_field_revisions: [{ fields: { "Case number": "SYN-1" } }],
    handoff_verification: { source_revision: 1, source_field_revision: 0 },
    call_close: { source_revision: 1, source_field_revision: 0 },
  } };
  const staleVerification = await route.POST({ json: async () => ({ op: "review", status: "ready_for_review", file: LEAD }) });
  assert.equal(staleVerification.status, 400);
  assert.match(staleVerification.body.error, /latest NETFLY handoff/);
  (db.tables.claims[0].answers as any).netfly_secondary.handoff_verification.source_field_revision = 1;
  const staleCall = await route.POST({ json: async () => ({ op: "review", status: "ready_for_review", file: LEAD }) });
  assert.equal(staleCall.status, 400);
  assert.match(staleCall.body.error, /call outcome/);
  console.log("NETFLY call presence ownership and expiry checks passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

