import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../../../../../lib/test-fake-db";
import { gateUser } from "../../../../../lib/gate";
import { resolveMatter } from "../../../../../lib/matter";
import { firmMatterReleased } from "../../../../../lib/firm-release";
import { DEFAULT_STATUSES } from "../../../../../lib/statuses";
const lead = "file", pending = "pending", released = "released";
function harness(role = "firm") {
  const db = new FakeDb({
    app_users: [{ id: "user", role, active: true, firm_id: "firm" }],
    leads: [{ id: lead, firm_id: "firm", archived_at: null, claimant_name: "Synthetic client" }],
    claims: [
      { id: pending, lead_id: lead, firm_id: "firm", campaign_id: null, status: "signed_qa", answers: { story: "PRIVATE PENDING" }, created_at: "2026-10-01" },
      { id: released, lead_id: lead, firm_id: "firm", campaign_id: null, status: "delivered", answers: { story: "RELEASED" }, created_at: "2026-10-02" },
    ],
    statuses: DEFAULT_STATUSES.map(s => ({ ...s })),
    audit_log: [pending, released, null].map((claim_id, i) => ({ id: i, lead_id: lead, firm_id: "firm", claim_id, description: String(claim_id) })),
    call_logs: [pending, released, null].map((claim_id, i) => ({ id: i, lead_id: lead, firm_id: "firm", claim_id })),
  });
  const selected: { table: string; columns: string }[] = [];
  const originalFrom = db.from.bind(db);
  db.from = (table: string) => {
    const q = originalFrom(table), select = q.select.bind(q);
    q.select = (columns?: string, opts?: any) => { selected.push({ table, columns: columns || "*" }); return select(columns, opts); };
    return q;
  };
  const sb = Object.assign(db, { auth: { getUser: async () => ({ data: { user: { id: "user" } } }) } });
  const jsx = (type: any, props: any, key?: string) => ({ type, props, key });
  const modules: Record<string, any> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/supabase-server": { supabaseServer: async () => sb, supabaseAdmin: () => db },
    "@/components/FirmCaseWorkbench": { default: "Workbench" },
    "@/lib/gate": { gateUser }, "@/lib/matter": { resolveMatter }, "@/lib/firm-release": { firmMatterReleased },
  };
  const source = fs.readFileSync(path.join(__dirname, "page.tsx"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exp: any = {};
  new Function("require", "exports", js)((name: string) => { assert.ok(name in modules, name); return modules[name]; }, exp);
  return { db, selected, page: (claimId?: string) => exp.default({ params: Promise.resolve({ id: lead }), searchParams: Promise.resolve({ claim: claimId }) }) };
}
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
test("a newer released claim never unlocks the requested pending sibling", async () => {
  const h = harness(), page = await h.page(pending);
  assert.equal(page.props.locked, true); assert.deepEqual(page.props.claims, []);
  assert.deepEqual(page.props.callLogs, []); assert.deepEqual(page.props.activity, []);
  assert.ok(!JSON.stringify(page).includes("PRIVATE PENDING"));
});
test("released page contains only that claim, calls and activity", async () => {
  const h = harness(), page = await h.page(released);
  assert.equal(page.props.claims.length, 1); assert.equal(page.props.claims[0].id, released);
  assert.equal(page.props.callLogs.length, 1); assert.equal(page.props.callLogs[0].claim_id, released);
  assert.equal(page.props.activity.length, 1); assert.equal(page.props.activity[0].claim_id, released);
  assert.ok(!JSON.stringify(page).includes("PRIVATE PENDING"));
  assert.ok(h.selected.filter(x => x.table === "leads").every(x => !x.columns.includes("*") && !x.columns.includes("answers") && !x.columns.includes("vendor_fields")));
});
test("multi-matter file without explicit claim presents a choice instead of guessing", async () => {
  const h = harness(), page = await h.page();
  assert.equal(page.type, "div"); assert.ok(JSON.stringify(page).includes("Choose the matter"));
  assert.ok(!JSON.stringify(page).includes("PRIVATE PENDING")); assert.ok(!JSON.stringify(page).includes('"story"'));
});
test("sole released matter remains reachable from existing file links", async () => {
  const h = harness(); h.db.tables.claims = h.db.tables.claims.filter(c => c.id === released);
  assert.equal((await h.page()).props.claims[0].id, released);
});
test("foreign firm, archived file, inactive user and wrong role are denied", async () => {
  for (const change of [
    (h: ReturnType<typeof harness>) => { h.db.tables.leads[0].firm_id = "foreign"; },
    (h: ReturnType<typeof harness>) => { h.db.tables.leads[0].archived_at = "2026-10-01"; },
    (h: ReturnType<typeof harness>) => { h.db.tables.app_users[0].active = false; },
    (h: ReturnType<typeof harness>) => { h.db.tables.app_users[0].role = "agent"; },
  ]) { const h = harness(); change(h); await assert.rejects(h.page(released), /NOT_FOUND/); }
});
test("claim belonging to another file or firm is denied", async () => {
  for (const field of ["lead_id", "firm_id"]) { const h = harness(); h.db.tables.claims[1][field] = "other"; await assert.rejects(h.page(released), /NOT_FOUND/); }
});
test("failed or missing status catalog keeps the file locked", async () => {
  for (const failure of [false, true]) { const h = harness();
    if (failure) h.db.failOn = op => op.table === "statuses" ? "offline" : null; else h.db.tables.statuses = [];
    assert.equal((await h.page(released)).props.locked, true);
  }
});
test("query failures are not rendered as a complete but empty file", async () => {
  for (const table of ["leads", "audit_log", "call_logs"]) { const h = harness(); h.db.failOn = op => op.table === table ? "offline" : null; await assert.rejects(h.page(released), /Could not load/); }
});
(async () => { for (const [name, fn] of tests) { await fn(); console.log(`PASS ${name}`); } console.log(`${tests.length} firm page tests passed`); })().catch(e => { console.error(e); process.exitCode = 1; });
