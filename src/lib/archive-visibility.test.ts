import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { NextRequest } from "next/server";
import { isActiveFile, isTestFile } from "./file-visibility";
import { linkedCallActivity } from "./call-activity";

const active = { id: "active", lead_no: "TMP-ACTIVE", claimant_name: "Active Client", archived_at: null, campaign: "INNO MVA", case_type: "mva" };
const archived = { ...active, id: "archived", lead_no: "TMP-ARCHIVED", claimant_name: "TEST Archived Client", archived_at: "2026-10-05T00:00:00Z" };
const tables: Record<string, any[]> = {
  leads: [archived, active].map(l => ({ ...l, qa_pending: true, assigned_agent: "owner", signed_at: "2026-10-01T00:00:00Z", claims: [{ status: "signed_qa" }] })),
  claims: [archived, active].map(l => ({ id: l.id + "-claim", lead_id: l.id, leads: l, status: "signed_qa", created_at: "2026-10-01T00:00:00Z" })),
  app_users: [{ id: "owner", role: "owner", active: true }], statuses: [],
};
const queries: any[] = [];
const db: any = { auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from(table: string) {
  let rows = [...(tables[table] || [])], limit = Infinity;
  const state = { table, inner: false, filters: [] as string[] }; queries.push(state);
  const field = (r: any, col: string) => col.split(".").reduce((v, k) => v?.[k], r);
  const q: any = {
    select(cols = "") { state.inner = cols.includes("leads!inner("); return q; },
    eq(col: string, v: any) { rows = rows.filter(r => field(r, col) === v); return q; },
    is(col: string, v: any) { state.filters.push(col); rows = rows.filter(r => v === null ? field(r, col) == null : field(r, col) === v); return q; },
    in(col: string, v: any[]) { rows = rows.filter(r => v.includes(field(r, col))); return q; },
    ilike() { return q; }, not() { return q; }, or() { return q; }, order() { return q; },
    limit(n: number) { limit = n; return q; }, maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
    then(resolve: any, reject: any) { return Promise.resolve({ data: rows.slice(0, limit), error: null }).then(resolve, reject); },
  }; return q;
} };
function load(file: string) {
  const source = fs.readFileSync(path.resolve(__dirname, "../app", file), "utf8");
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const modules: Record<string, any> = {
    "react/jsx-runtime": require("react/jsx-runtime"), "next/server": require("next/server"),
    "next/navigation": { redirect() { throw new Error("redirect"); } },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => db },
    "@/lib/auth-user": { authUser: () => db.auth.getUser() },
    "@/lib/gate": { gateUser: async () => ({ id: "owner", role: "owner" }), requirePerm: async () => ({ ok: true, user: { role: "owner" } }) },
    "@/lib/mva-call/server": { requireStaff: async () => ({ id: "owner", role: "owner" }) },
    "@/lib/comms": { normPhone: () => "" },
    "@/lib/mva-call/search-status": { searchStatusLabel: () => "" },
    "@/lib/permissions": { isInternalRole: () => true },
    "@/lib/claim-status": { loadStatuses: async () => [] },
    "@/lib/statuses": { needsQaReview: () => true, resolveStatus: () => ({ label: "Signed" }) },
    "@/lib/mva-call/desk-queue": { readDeskRows: async (f: any) => await f() },
    "@/lib/sla-clocks": { DEFAULT_THRESHOLDS: {}, clocksFor: () => [{ kind: "delivery", hoursLeft: 5 }] },
    "@/lib/forms": { resolveIntakeFields: async () => [{ id: "name", scope: "lead", label: "Name" }] },
    "@/lib/file-visibility": { isTestFile },
    "@/lib/signature-report-loader": { reportPages: async (f: any) => (await f()).data },
  };
  const result: any = {};
  new Function("require", "exports", out)((key: string) => {
    if (modules[key]) return modules[key];
    if (key.startsWith("@/components/") || key === "next/link") return { __esModule: true, default: "test-component" };
    throw new Error("Unexpected import: " + key);
  }, result);
  return result;
}
(async () => {
  assert.equal(isTestFile({ claimant_name: "Testerfield" }), false);
  assert.equal(isTestFile(archived), true);
  assert.equal(isTestFile({ claimant_name: "Example", vendor_fields: { signing_rehearsal: {} } }), true);
  assert.equal(isActiveFile(archived), false);
  assert.equal(isActiveFile(active), true);
  const cleanup = load("(internal)/leads/archive/page.tsx");
  assert.deepEqual((await cleanup.default()).props.rows.map((r: any) => r.id), ["archived"], "Cleanup omits ordinary active clients");
  tables.app_users[0].role = "agent";
  await assert.rejects(() => cleanup.default(), /redirect/, "Cleanup requires existing owner access");
  tables.app_users[0].role = "owner";
  for (const file of ["(internal)/reports/page.tsx", "(internal)/reports/status/page.tsx", "(firm)/portal/reports/page.tsx", "(firm)/portal/cases/page.tsx"]) {
    queries.length = 0;
    const result = await load(file).default();
    assert.ok(!JSON.stringify(result).includes("TMP-ARCHIVED"), file);
    assert.ok(queries.find(q => q.table === "leads")?.filters.includes("archived_at"), file);
    console.log("PASS", file);
  }
  const qa = await load("(internal)/qa/page.tsx").default();
  assert.ok(!JSON.stringify(qa).includes("TMP-ARCHIVED"));
  assert.ok(JSON.stringify(qa).includes("TMP-ACTIVE"));
  assert.ok(queries.some(q => q.table === "claims" && q.inner && q.filters.includes("leads.archived_at")));
  for (const file of ["api/calls/search/route.ts", "api/person-search/route.ts", "api/sla-clocks/route.ts", "api/export/route.ts", "api/export/answers-csv/route.ts"]) {
    const res = await load(file).GET(new NextRequest("https://claimreach.test/api?q=Client&case_type=mva"));
    const body = await res.text();
    assert.equal(res.status, 200, file + ": " + body);
    assert.ok(!body.includes("TMP-ARCHIVED"), file);
    assert.ok(body.includes("TMP-ACTIVE"), file);
    console.log("PASS", file);
  }
  const calls = [active, archived].map(l => ({ id: l.id, lead_id: l.id, channel: "call", direction: "outbound", occurred_at: "2026-10-01T12:00:00Z" }));
  assert.deepEqual(linkedCallActivity(calls, [active, archived], "2026-09-28").map(r => r.leadId), ["active"]);
  assert.deepEqual(linkedCallActivity(calls, [active, { ...archived, archived_at: null }], "2026-09-28").map(r => r.leadId), ["active", "archived"]);
  console.log("Archive filters: pages, QA inner join, search, delivery counts, exports, call activity and restore passed.");
})().catch(e => { console.error(e); process.exitCode = 1; });
