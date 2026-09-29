// Actual save route, with an in-memory query builder and no live services.
// Run: npx tsx src/app/api/leads/route.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../../../lib/test-fake-db";
import { nullifyEmpty } from "../../../lib/coerce";

function harness(role = "agent") {
  const db = new FakeDb({
    app_users: [{ id: "operator", role, firm_id: "firm", full_name: "Offline Tester" }],
    leads: [{ id: "lead", first_name: "Old", last_name: "Tester", claimant_name: "Old Tester", phone: "2025550110", stage: "referral_received" }],
  });
  const audit: any[] = [];
  const session = Object.assign(db, { auth: { getUser: async () => ({ data: { user: { id: "operator" } } }) } });
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => session },
    "@/lib/questionnaire": { FIRM_WRITABLE_STAGES: [] },
    "@/lib/audit": { recordAudit: async (entry: any) => { audit.push(entry); } },
    "@/lib/claim-status": { setClaimStatusForLeads: () => { throw new Error("Unexpected workflow side effect"); } },
    "@/lib/coerce": { nullifyEmpty },
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
  return { db, audit, save, row: () => db.tables.leads[0], writes: () => db.ops.filter((o) => o.kind !== "select") };
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

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log("ok", name); }
  console.log(`${tests.length} lead name route scenarios passed`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
