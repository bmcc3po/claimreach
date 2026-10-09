import * as fileAgents from './file-agents';
import * as archiveControl from './archive-control';
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "./test-fake-db";
import * as ontake from "./netfly-ontake";
import * as deliverySettings from "./netfly-delivery-settings";
import * as handoff from "./netfly-handoff";
import { assertHandoffFirm } from "./netfly-handoff-save";
import { mailColumnsFrom } from "./us-address";

const FIRM = "11111111-1111-4111-8111-111111111111";
class CreateDb extends FakeDb {
  async rpc(name: string, args: any) {
    assert.equal(name, "mint_lead_no");
    assert.deepEqual(args, { p_firm: FIRM });
    return { data: "TEST-100", error: null };
  }
}
const freshDb = () => new CreateDb({
  firms: [{ id: FIRM, name: "Example, Second & Third", slug: "est" }],
  leads: [], claims: [],
});
let db = freshDb();
const actor = { id: "test-agent", name: "Test Agent", can: () => true };
const code = fs.readFileSync(path.resolve(__dirname, "../app/api/netfly/route.ts"), "utf8");
const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modules: Record<string, any> = {
    "@/lib/file-agents": fileAgents,
  "@/lib/archive-control": archiveControl,
    "next/server": { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) } },
  "@/lib/netfly-server": { netflyContext: async () => ({ actor, db, campaign: { id: "netfly", firm_id: FIRM } }) },
  "@/lib/netfly-ontake": ontake,
  "@/lib/netfly-delivery-settings": deliverySettings,
  "@/lib/netfly-handoff": handoff,
  "@/lib/netfly-handoff-save": { assertHandoffFirm },
  "@/lib/mva-call/server": {},
  "@/lib/us-address": { mailColumnsFrom },
  "@/lib/mva-call/esign": {},
  "@/lib/comms": { normPhone: (value: string) => value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "") },
};
const route: any = {};
new Function("require", "exports", compiled)((name: string) => {
  if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
  return modules[name];
}, route);
const post = (body: any) => route.POST({ json: async () => ({ op: "create", ...body }) });
const sample = [
  "Hi Team Example,",
  "Accident Intake Note – Example Law",
  "Client/Driver: TEST Avery Client",
  "Accident Date: 09/04/2026",
  "Location: Kansas City, Missouri – Highway 70",
  "Case #: TEST-24054284",
  "Passengers: None",
  "Client Address: 100 Test Street, Kansas City, MO 64106",
  "Date of Birth: 05/14/1991",
  "Accident Summary: Stopped with hazards on; another driver rear-ended the car.",
  "Injuries & Treatment: Reports back pain. Treatment details still needed.",
  "Representation: Has not retained an attorney.",
  "From: Test Sender <sender@netflydigital.com>",
  "Subject: New Signing! TEST Avery Client",
  "Contact Information:",
  "TEST Avery Client",
  "test-client@example.test",
  "+12025550146",
  "The Signed Agreement:",
  "https://go.easyclaimcenter.com/documents/v1/00000000-0000-4000-8000-000000000001?locale=en-US",
  "Accident Details:",
  "State: , City: Kansas City",
  "Office: 202-555-0188",
  "sender@netflydigital.com",
].join("\n");

async function main() {
  const result = await post({ source_note: sample });
  assert.equal(result.status, 200);
  const lead = db.tables.leads[0], claim = db.tables.claims[0];
  assert.equal(lead.claimant_name, "TEST Avery Client");
  assert.equal(lead.phone, "2025550146");
  assert.equal(lead.email, "test-client@example.test");
  assert.equal(lead.dob, "1991-05-14");
  assert.equal(lead.mail_city, "Kansas City");
  assert.equal(lead.mail_state, "MO");
  assert.equal(lead.mail_zip, "64106");
  assert.equal(lead.firm_id, FIRM);
  assert.equal(claim.firm_id, FIRM);
  assert.equal(claim.lead_id, lead.id);
  const saved = claim.answers.netfly_secondary;
  for (const candidate of handoff.extractNetflyEmail(sample).candidates) {
    assert(ontake.NETFLY_FIELD_IDS.has(candidate.id), `canonical field: ${candidate.id}`);
    assert.equal(saved.fields[candidate.id], candidate.value);
    assert.equal(saved.imported_fields[candidate.id].confirmed, false);
    assert.equal(saved.imported_fields[candidate.id].by, actor.id);
  }
  assert.equal(saved.fields.accident_date, "2026-09-04");
  assert.equal(saved.fields.accident_state, "MO");
  assert.equal(saved.fields.road, "Highway 70");
  assert.equal(saved.fields.passengers, "No");
  assert.equal(saved.fields.seen_doctor, undefined, "do not guess medical answers from prose");
  assert.equal(saved.handoffs[0].note, sample, "retain the entire original note");
  assert.equal(saved.review.status, "in_progress");
  assert.equal(claim.status, "new");
  assert.equal(saved.call_close, undefined);
  assert.deepEqual([lead.perm_call, lead.perm_text, lead.perm_email], [false, false, false]);
  assert.equal(db.tables.case_documents, undefined, "a viewer URL is not an uploaded signed packet");
  assert(db.ops.every(op => ["firms", "leads", "claims"].includes(op.table)), "creation must not trigger outreach or signing");

  db = freshDb();
  assert.equal((await post({ source_note: sample, name: "TEST Avery Corrected", phone: "", email: "", city: "Corrected city" })).status, 200);
  const edited = db.tables.claims[0].answers.netfly_secondary;
  assert.equal(db.tables.leads[0].claimant_name, "TEST Avery Corrected");
  assert.equal(db.tables.leads[0].phone, null);
  assert.equal(db.tables.leads[0].email, null);
  assert.equal(edited.fields.confirmed_phone, "");
  assert.equal(edited.fields.confirmed_email, "");
  assert.equal(edited.fields.accident_city, "Corrected city");
  for (const field of ["confirmed_name", "confirmed_phone", "confirmed_email", "accident_city"]) assert.equal(edited.imported_fields[field], undefined);
  assert.equal(edited.fields.accident_state, "MO");

  db = freshDb();
  assert.equal((await post({ name: "TEST Partial Client" })).status, 200);
  assert.deepEqual(db.tables.claims[0].answers.netfly_secondary.handoffs, []);
  assert.equal(db.tables.leads[0].phone, null);
  db = freshDb();
  assert.equal((await post({ source_note: sample, name: "" })).status, 400, "do not undo an explicitly cleared name");
  assert.equal((await post({ name: "TEST Client", source_note: "x".repeat(20001) })).status, 400);
  assert.equal((await post({ source_note: sample.replace("Example Law", "Other Firm") })).status, 409);
  assert.equal((await post({ op: "start_call", name: "TEST Client", source_note: sample })).status, 400);
  assert.equal(db.tables.leads.length, 0, "invalid requests cannot create partial records");
  assert.equal((await post({ op: "start_call", name: "TEST Live Transfer", phone: "2025550143" })).status, 200);
  assert.equal(db.tables.leads[0].phone, "2025550143");

  db = freshDb();
  db.failOn = op => op.table === "claims" && op.kind === "insert" ? "simulated failure" : null;
  const failed = await post({ source_note: sample });
  assert.equal(failed.status, 503, "never report success without the matter");
  assert(db.tables.leads[0].archived_at, "keep failed partial leads recoverable");
  console.log("NETFLY paste-first creation, source preservation, edits, partial files and failure checks passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

