// Actual save route, with an in-memory query builder and no live services.
// Run: npx tsx src/app/api/leads/route.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../../../lib/test-fake-db";
import { nullifyEmpty } from "../../../lib/coerce";
import { resolveSigningMatter } from "../../../lib/mva-call/signing-matter";
import { isInternalRole } from "../../../lib/permissions";
import { setClaimStatusForLeads } from "../../../lib/claim-status";
import { DEFAULT_STATUSES, manualIntakeStatusAllowed } from "../../../lib/statuses";

function harness(role = "agent") {
  const db = new FakeDb({
    app_users: [{ id: "operator", role, active: true, firm_id: "firm", full_name: "Offline Tester" }],
    leads: [{ id: "lead", firm_id: "firm", campaign_id: "campaign", case_type: "mva", archived_at: null, first_name: "Old", last_name: "Tester", claimant_name: "Old Tester", phone: "2025550110", stage: "referral_received" }],
    claims: [{ id: "claim", lead_id: "lead", firm_id: "firm", campaign_id: "campaign", claim_type: "mva", status: "new" }],
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
  const aggregateDb = new FakeDb({});
  Object.defineProperty(aggregateDb.tables, "claims", { get: () => [...db.tables.claims, ...hiddenClaims] });
  aggregateDb.failOn = (op) => {
    assert.equal(op.table, "claims", "privileged queue read must stay on claims");
    assert.equal(op.kind, "select", "privileged queue DB must never mutate");
    assert.ok(db.ops.some((write) => write.table === "claims" && write.kind === "update"), "queue aggregate is read only after the session target mutation");
    return null;
  };
  const session = Object.assign(db, { auth: { getUser: async () => ({ data: { user: { id: "operator" } } }) } });
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => session, supabaseAdmin: () => aggregateDb },
    "@/lib/questionnaire": { FIRM_WRITABLE_STAGES: [] },
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
    "@/lib/permissions": { isInternalRole },
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
  const status = (extra: any = {}) => exp.POST({ json: async () => ({ op: "status", lead_id: "lead", claim_id: "claim", status: "contacting", ...extra }) });
  return { db, aggregateDb, hiddenClaims, audit, save, status, transitions, row: () => db.tables.leads[0], writes: () => db.ops.filter((o) => o.kind !== "select") };
}

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

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
  assert.equal((await failed.save({ first_name: "New" })).status, 500); assert.equal(failed.writes().length, 0);
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

test("hidden lead and mismatched claim never reach the status writer", async () => {
  const hidden = harness(); hidden.db.tables.leads=[];
  assert.equal((await hidden.status()).status,404);assert.equal(hidden.transitions.length,0);assert.equal(hidden.writes().length,0);
  const mismatch=harness();mismatch.db.tables.claims[0].lead_id="another-lead";
  assert.equal((await mismatch.status()).status,400);assert.equal(mismatch.transitions.length,0);assert.equal(mismatch.writes().length,0);
});

test("non-owner status rejects non-INNO, ambiguous campaign, and wrong matter scope even before RLS rollout", async () => {
  for(const mutate of [
    (h:any)=>h.db.tables.campaigns[0].name="Motel 6",
    (h:any)=>h.db.tables.campaigns[0].active=false,
    (h:any)=>h.db.tables.firms[0].slug="tmt",
    (h:any)=>h.db.tables.claims[0].campaign_id="foreign-campaign",
    (h:any)=>h.row().case_type="motel_trafficking",
    (h:any)=>h.db.tables.campaigns.push({...h.db.tables.campaigns[0],id:"duplicate-campaign"}),
  ]){
    const h=harness();mutate(h);const r=await h.status();
    assert.equal(r.status,403);assert.equal(h.transitions.length,0);assert.equal(h.writes().length,0);
  }
});

test("active INNO agent changes only resolved claim using the session database and preserves DQ validation", async () => {
  const h=harness();h.db.tables.claims.push({...h.db.tables.claims[0],id:"sibling",status:"new"});
  assert.equal((await h.status()).status,200);assert.equal(h.db.tables.claims[0].status,"contacting");
  assert.equal(h.db.tables.claims[1].status,"new");assert.deepEqual(h.transitions[0].claimIds,["claim"]);
  assert.equal((await h.status({status:"dq"})).status,400);assert.equal(h.db.tables.claims[0].status,"contacting");
  assert.equal((await h.status({status:"dq",dq_reason_key:"criteria"})).status,200);assert.equal(h.db.tables.claims[0].status,"dq");
});

test("status keeps owner access and denies inactive staff or external roles", async () => {
  const owner=harness("owner");owner.db.tables.campaigns[0].name="Other campaign";
  assert.equal((await owner.status()).status,200);
  for(const role of ["firm","partner"]){const h=harness(role);assert.equal((await h.status()).status,403);assert.equal(h.transitions.length,0);}
  const inactive=harness();inactive.db.tables.app_users[0].active=false;
  assert.equal((await inactive.status()).status,401);assert.equal(inactive.transitions.length,0);
});

test("status retains hidden sibling QA and WIP without returning or mutating that matter", async () => {
  for (const siblingStatus of ["signed_grievous", "signed_wip"]) {
    const h = harness();
    h.hiddenClaims.push({ id: "hidden-matter", lead_id: "lead", campaign_id: "other-campaign", status: siblingStatus });
    const r = await h.status({ status: "dq", dq_reason_key: "criteria" });
    assert.equal(r.status, 200);
    assert.equal(h.row().qa_pending, siblingStatus === "signed_grievous");
    assert.equal(h.row().wip_pending, siblingStatus === "signed_wip");
    assert.equal(h.db.tables.claims[0].status, "dq");
    assert.equal(h.hiddenClaims[0].status, siblingStatus);
    assert.deepEqual(r.body, { ok: true });
    assert.ok(!JSON.stringify(h.audit).includes("hidden-matter"));
    assert.equal(h.aggregateDb.ops.length, 1);
    assert.deepEqual(h.aggregateDb.ops[0].filters, [["eq", "lead_id", "lead"]]);
  }
});

test("failed sibling aggregate preserves prior queue flags and reports an incomplete update", async () => {
  const h = harness();Object.assign(h.row(), { qa_pending: true, wip_pending: true });
  h.aggregateDb.failOn = () => "Queue read unavailable";
  const r = await h.status();
  assert.equal(r.status, 400);
  assert.equal(h.db.tables.claims[0].status, "contacting");
  assert.equal(h.row().qa_pending, true);assert.equal(h.row().wip_pending, true);
});

test("manual status cannot fabricate signatures, QA, WIP, approval, or delivery even for the owner", async () => {
  for (const role of ["agent", "owner"]) for (const status of ["esign_sent", "signed_grievous", "signed_qa", "signed_wip", "signed_approved", "signed_dropped", "grievous", "qa", "wip", "approved", "delivered", "retained"]) {
    const h = harness(role);const r = await h.status({ status, dq_reason_key: "criteria" });
    assert.equal(r.status, 409, `${role} ${status}`);assert.equal(h.transitions.length, 0);assert.equal(h.writes().length, 0);
  }
  const custom = harness();custom.db.tables.statuses.push({ ...DEFAULT_STATUSES[0], key: "custom_complete", requires_esign: true });
  assert.equal((await custom.status({ status: "custom_complete" })).status, 409);
});

test("manual contact and callback changes work; unknown, inactive, or unreadable catalog fails closed", async () => {
  const callback = harness();callback.db.tables.statuses.push({ ...DEFAULT_STATUSES[0], key: "callback", label: "Call back" });
  assert.equal((await callback.status({ status: "callback" })).status, 200);
  assert.equal((await callback.status({ status: "new" })).status, 200);
  const unknown = harness();assert.equal((await unknown.status({ status: "invented" })).status, 400);assert.equal(unknown.writes().length, 0);
  const inactive = harness();inactive.db.tables.statuses.find((item) => item.key === "contacting")!.active = false;
  assert.equal((await inactive.status()).status, 400);assert.equal(inactive.writes().length, 0);
  const failed = harness();failed.db.failOn = (op) => op.table === "statuses" ? "Read unavailable" : null;
  assert.equal((await failed.status()).status, 503);assert.equal(failed.writes().length, 0);
});

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log("ok", name); }
  console.log(`${tests.length} lead name route scenarios passed`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
