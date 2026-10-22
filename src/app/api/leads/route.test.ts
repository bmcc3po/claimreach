// Actual save route, with an in-memory query builder and no live services.
// Run: npx tsx src/app/api/leads/route.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../../../lib/test-fake-db";
import { INTAKE, STAGES } from "../../../lib/questionnaire";
import { nullifyEmpty } from "../../../lib/coerce";
import { resolveSigningMatter } from "../../../lib/mva-call/signing-matter";
import { can, isInternalRole } from "../../../lib/permissions";
import { setClaimStatusForLeads } from "../../../lib/claim-status";
import { DEFAULT_STATUSES, manualIntakeStatusAllowed } from "../../../lib/statuses";
import { intakeStatusTransitionBlock } from "../../../lib/intake-status-guard";
import * as mailTimeZone from "../../../lib/mail-time-zone";
import { intakeFirmScope } from "../../../lib/intake-firm-scope";

function harness(role = "agent") {
  const db = new FakeDb({
    app_users: [{ id: "operator", role, active: true, firm_id: "firm", full_name: "Offline Tester" }],
    leads: [{ id: "lead", firm_id: "firm", campaign_id: "campaign", case_type: "mva", archived_at: null, first_name: "Old", last_name: "Tester", claimant_name: "Old Tester", phone: "2025550110", stage: "referral_received" }],
    claims: [{ id: "claim", lead_id: "lead", firm_id: "firm", campaign_id: "campaign", claim_type: "mva", status: "new", updated_at: "2026-09-29T10:00:00Z" }],
    campaigns: [{ id: "campaign", firm_id: "firm", name: "INNO MVA", case_type: "mva", active: true }],
    firms: [{ id: "firm", slug: "tmp" }],
    statuses: DEFAULT_STATUSES.map((item) => ({ ...item })),
    dq_reasons: [{ key: "criteria", label: "Outside criteria" }],
  });
  const audit: any[] = [];
  const transitions: any[] = [];
  const hiddenClaims: any[] = [];
  const cardinalityDb = new FakeDb({});
  Object.defineProperty(cardinalityDb.tables, "claims", { get: () => [...db.tables.claims, ...hiddenClaims] });
  cardinalityDb.failOn = (op) => { assert.equal(op.table, "claims");assert.equal(op.kind, "select");return null; };
  const aggregateDb = new FakeDb({ esign_submissions: [], signable_documents: [], firms: [] });
  Object.defineProperty(aggregateDb.tables, "claims", { get: () => [...db.tables.claims, ...hiddenClaims] });
  aggregateDb.failOn = (op) => {
    assert.equal(op.kind, "select", "privileged DB must never mutate");
    if (op.table === "firms") {
      assert.deepEqual(op.filters, [["eq", "id", db.tables.app_users[0].firm_id]], "configuration lookup is only the authenticated staff organization");
      assert.ok(db.ops.some(read => read.table === "leads" && read.kind === "select"), "authorize the file through RLS first");
    } else if (op.table === "claims") {
      assert.ok(db.ops.some(write => write.table === "claims" && write.kind === "update"), "queue aggregate read occurs only after the session mutation");
    } else {
      assert.ok(["esign_submissions", "signable_documents"].includes(op.table), "privileged read stays on signature evidence");
      assert.ok(db.ops.some(read => read.table === "claims" && read.kind === "select" && read.filters.some(([, col, value]) => col === "id" && value === "claim")), "authorize exact claim through RLS before evidence read");
      assert.ok(op.filters.some(([, col, value]) => col === "lead_id" && value === "lead"));
    }
    return null;
  };
  const session = Object.assign(db, { auth: { getUser: async () => ({ data: { user: { id: "operator" } } }) } });
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => session, supabaseAdmin: () => aggregateDb },
    "@/lib/questionnaire": { FIRM_WRITABLE_STAGES: [], INTAKE, STAGES },
    "@/lib/audit": { recordAudit: async (entry: any) => { audit.push(entry); } },
    "@/lib/claim-status": { setClaimStatusForLeads: async (options: any, deps: any) => {
      assert.equal(deps?.db, session, "status mutations must keep the user's RLS session");
      assert.equal(deps?.queueReadDb, aggregateDb);
      transitions.push(options);
      return setClaimStatusForLeads(options, { ...deps, audit: async (entry: any) => { audit.push(entry); }, automation: async () => {}, webhook: async () => {}, deliver: async () => {} });
    } },
    "@/lib/coerce": { nullifyEmpty },
    "@/lib/mva-call/signing-matter": { resolveSigningMatter: (sessionDb: any, leadId: string, opts: any) => resolveSigningMatter(sessionDb, leadId, { ...opts, authoritativeDb: cardinalityDb }) },
    "@/lib/statuses": { manualIntakeStatusAllowed },
    "@/lib/intake-status-guard": { intakeStatusTransitionBlock },
    "@/lib/permissions": { can, isInternalRole },
    "@/lib/mail-time-zone": mailTimeZone,
    "@/lib/intake-firm-scope": { intakeFirmScope },
    "@/lib/claim-properties": { coercePropCol: () => { throw new Error("Unexpected property write"); } },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "route.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exp: any = {};
  new Function("require", "exports", js)((id: string) => {
    if (!(id in modules)) throw new Error(`Unstubbed module ${id}`);
    return modules[id];
  }, exp);
  const save = (lead: any, lead_id = "lead") => exp.POST({ json: async () => ({ op: "save", lead_id, lead }) });
  const stage = (next: string) => exp.POST({ json: async () => ({ op: "stage", lead_id: "lead", stage: next }) });
  const create = (firm_id: string) => exp.POST({ json: async () => ({ op: "create", firm_id, campaign_id: "campaign", case_type: "mva" }) });
  const status = (extra: any = {}) => exp.POST({ json: async () => ({ op: "status", lead_id: "lead", claim_id: "claim", status: "contacting", ...extra }) });
  return { db, aggregateDb, hiddenClaims, audit, save, stage, create, status, transitions, row: () => db.tables.leads[0], writes: () => db.ops.filter((o) => o.kind !== "select") };
}

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

test("Innovative agent saves TMP contacts while status uses the shared endpoint when pilot RLS hides the staff organization", async () => {
  const h = harness();
  h.db.tables.app_users[0].firm_id = "intake-team";
  h.aggregateDb.tables.firms.push({ id: "intake-team", slug: "inno" });
  assert.equal(h.db.tables.firms.some(row => row.id === "intake-team"), false);
  const patch = { phone: "2025550199", email: "test@example.invalid", mail_addr1: "1 Test Rd", mail_city: "Test City", mail_state: "CA", mail_zip: "94043" };
  assert.equal((await h.save(patch)).status, 200);
  for (const [key, value] of Object.entries(patch)) assert.equal(h.row()[key], value);
  assert.equal(h.audit[0].firm_id, "firm", "contact audit follows the matter, not the staff organization");
  assert.equal((await h.status()).status, 409);
  assert.equal(h.db.tables.claims[0].status, "new");
});

test("intake organization exception never admits a different team, firm, campaign or archived file", async () => {
  for (const change of [
    (h: any) => h.aggregateDb.tables.firms[0].slug = "other-team",
    (h: any) => h.db.tables.firms[0].slug = "tmt",
    (h: any) => h.db.tables.campaigns[0].name = "NETFLY ONTAKE",
    (h: any) => h.db.tables.campaigns[0].active = false,
    (h: any) => h.db.tables.campaigns[0].firm_id = "foreign-firm",
    (h: any) => h.row().archived_at = "2026-10-04T00:00:00Z",
  ]) {
    const h = harness(); h.db.tables.app_users[0].firm_id = "intake-team";
    h.aggregateDb.tables.firms.push({ id: "intake-team", slug: "inno" }); change(h);
    assert.ok([403, 409].includes((await h.save({ phone: "2025550199" })).status));
    assert.equal(h.writes().length, 0);
  }
});

test("missing or unreadable authoritative organization fails closed without losing contact data", async () => {
  for (const fail of [false, true]) {
    const h = harness(); h.db.tables.app_users[0].firm_id = "intake-team";
    if (fail) h.aggregateDb.failOn = op => op.table === "firms" ? "Organization lookup failed" : null;
    assert.equal((await h.save({ phone: "2025550199" })).status, fail ? 503 : 403);
    assert.equal(h.writes().length, 0); assert.equal(h.row().phone, "2025550110");
  }
});

test("a hidden recipient or hidden file never reaches organization configuration or writes", async () => {
  for (const hide of ["recipient", "file"]) {
    const h = harness(); h.db.tables.app_users[0].firm_id = "intake-team";
    h.aggregateDb.tables.firms.push({ id: "intake-team", slug: "inno" });
    h.db.tables[hide === "recipient" ? "firms" : "leads"] = [];
    assert.equal((await h.save({ phone: "2025550199" })).status, hide === "recipient" ? 403 : 404);
    assert.equal(h.aggregateDb.ops.length, 0); assert.equal(h.writes().length, 0);
  }
});

test("contact and stage mutations reject another firm and another campaign before writing", async () => {
  for (const mutate of [(h: any) => { h.row().firm_id = "other"; }, (h: any) => {
    h.row().campaign_id = "other";
    h.db.tables.campaigns.push({ id: "other", firm_id: "firm", name: "Motel 6", case_type: "mva", active: true });
  }]) {
    const h = harness(); mutate(h);
    assert.equal((await h.save({ phone: "2025550101" })).status, 403);
    assert.equal((await h.stage(STAGES[0])).status, 403);
    assert.equal(h.writes().length, 0);
  }
});

test("staff cannot create a file in another firm", async () => {
  const h = harness();
  assert.equal((await h.create("other")).status, 403);
  assert.equal(h.writes().length, 0);
});

test("first-name-only correction derives canonical name and preserves other contact fields", async () => {
  const h = harness(); const r = await h.save({ first_name: "  New  " });
  assert.equal(r.status, 200); assert.equal(h.row().first_name, "New");
  assert.equal(h.row().last_name, "Tester"); assert.equal(h.row().claimant_name, "New Tester");
  assert.equal(h.row().phone, "2025550110"); assert.equal(r.body.contact.claimant_name, "New Tester");
  assert.equal(h.audit.length, 1);
});

test("last-name correction overrides a stale display name carried in the same payload", async () => {
  const h = harness(); const r = await h.save({ last_name: "Newlast", claimant_name: "STALE DISPLAY" });
  assert.equal(r.status, 200); assert.equal(h.row().claimant_name, "Old Newlast");
});

test("both split names and canonical name change in one conditional update", async () => {
  const h = harness(); const r = await h.save({ first_name: "First", last_name: "Last" });
  assert.equal(r.status, 200);
  assert.deepEqual(h.writes()[0].patch, { first_name: "First", last_name: "Last", claimant_name: "First Last" });
  assert.ok(h.writes()[0].filters.some(([op, col, value]) => op === "eq" && col === "first_name" && value === "Old"));
  assert.ok(h.writes()[0].filters.some(([op, col, value]) => op === "eq" && col === "last_name" && value === "Tester"));
});

test("null split-name values use SQL IS NULL compare-and-set", async () => {
  const h = harness(); Object.assign(h.row(), { first_name: null, claimant_name: "Tester" });
  const r = await h.save({ first_name: "New" }); assert.equal(r.status, 200);
  assert.ok(h.writes()[0].filters.some(([op, col, value]) => op === "is" && col === "first_name" && value === null));
  assert.equal(h.row().claimant_name, "New Tester");
});

test("clearing one split name retains the other as the canonical name", async () => {
  const h = harness(); const r = await h.save({ last_name: "   " });
  assert.equal(r.status, 200); assert.equal(h.row().last_name, null); assert.equal(h.row().claimant_name, "Old");
});

test("empty identity is rejected before any update or audit", async () => {
  const h = harness(); const r = await h.save({ first_name: "", last_name: null });
  assert.equal(r.status, 400); assert.equal(h.writes().length, 0); assert.equal(h.audit.length, 0);
  assert.equal(h.row().claimant_name, "Old Tester");
});

test("non-text split names fail without writing other submitted contact changes", async () => {
  for (const invalid of [123, [], { name: "bad" }]) {
    const h = harness(); const r = await h.save({ first_name: invalid, phone: "2025550199" });
    assert.equal(r.status, 400); assert.equal(h.writes().length, 0); assert.equal(h.row().phone, "2025550110");
  }
});

test("read failure and missing lead never proceed to a rename update", async () => {
  const missing = harness(); assert.equal((await missing.save({ first_name: "New" }, "missing")).status, 404);
  assert.equal(missing.writes().length, 0);
  const failed = harness(); failed.db.failOn = (o) => o.table === "leads" && o.kind === "select" ? "Read unavailable" : null;
  assert.equal((await failed.save({ first_name: "New" })).status, 503); assert.equal(failed.writes().length, 0);
});

test("another screen changing either split name rejects the whole stale update", async () => {
  for (const key of ["first_name", "last_name"]) {
    const h = harness();
    h.db.failOn = (o) => {
      if (o.table === "leads" && o.kind === "update") Object.assign(h.row(), { [key]: "Concurrent", claimant_name: key === "first_name" ? "Concurrent Tester" : "Old Concurrent" });
      return null;
    };
    const r = await h.save({ first_name: "Stale", phone: "2025550199" });
    assert.equal(r.status, 409); assert.match(r.body.error, /another screen/);
    assert.equal(h.row()[key], "Concurrent"); assert.equal(h.row().phone, "2025550110"); assert.equal(h.audit.length, 0);
  }
});

test("ordinary contact save returns identity without rewriting it or accepting workflow fields", async () => {
  const h = harness(); const r = await h.save({ email: "new@example.invalid", stage: "signed", firm_id: "other", campaign_id: "other" });
  assert.equal(r.status, 200); assert.equal(r.body.contact.claimant_name, "Old Tester");
  assert.deepEqual(h.writes()[0].patch, { email: "new@example.invalid" });
  assert.equal(h.row().stage, "referral_received");
});

test("database update failure is not acknowledged or audited as a saved name", async () => {
  const h = harness(); h.db.failOn = (o) => o.kind === "update" ? "Write unavailable" : null;
  const r = await h.save({ first_name: "New" });
  assert.equal(r.status, 400); assert.equal(h.row().claimant_name, "Old Tester"); assert.equal(h.audit.length, 0);
});

test("firm role still cannot rename contacts through the staff save route", async () => {
  const h = harness("firm"); const r = await h.save({ first_name: "New" });
  assert.equal(r.status, 403); assert.equal(h.writes().length, 0);
});

test("legacy status endpoint cannot bypass shared reasons, notes, permissions or optimistic locking", async () => {
  for(const role of ["agent","owner","firm"])for(const status of ["new","dq","dnc","delivered","signed_grievous"]){
    const h=harness(role),r=await h.status({status});assert.ok([403,409].includes(r.status));
    assert.equal(h.transitions.length,0);assert.equal(h.writes().length,0);
  }
});

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log("ok", name); }
  console.log(`${tests.length} lead name route scenarios passed`);
})().catch((e) => { console.error(e); process.exitCode = 1; });

