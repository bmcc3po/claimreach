import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { NextRequest } from "next/server";
import { FakeDb } from "./test-fake-db";

const db: any = new FakeDb({
  app_users: [{ id: "owner", role: "owner", active: true }],
  leads: [{ id: "test", firm_id: "firm", archived_at: null }],
  claims: [{ id: "matter", lead_id: "test", status: "delivered" }],
  firm_deliveries: [{ id: "receipt", lead_id: "test", ok: true, created_at: "2026-10-01T12:00:00Z" }],
});
db.auth = { getUser: async () => ({ data: { user: { id: "owner" } } }) };
let refreshes = 0, invalidations = 0;
const modules: any = {
  "next/server": require("next/server"), "next/cache": { revalidatePath: () => { refreshes++; } },
  "@/lib/supabase-server": { supabaseServer: async () => db },
  "@/lib/permissions": { isInternalRole: (role: string) => ["owner", "admin", "agent"].includes(role) },
  "@/lib/claim-status": {}, "@/lib/audit": {}, "@/lib/statuses": {},
  "@/lib/alerts": { invalidateAlertCache: () => { invalidations++; } },
};
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../app/api/leads/bulk/route.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const route: any = {};
new Function("require", "exports", code)((key: string) => { assert.ok(key in modules, key); return modules[key]; }, route);
function req(op: string, ids = ["test"]) {
  return new NextRequest("https://claimreach.test/api/leads/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ids, reason: "Synthetic cleanup" }) });
}
(async () => {
  const evidence = JSON.stringify([db.tables.claims, db.tables.firm_deliveries]);
  assert.equal((await route.POST(req("archive", ["not-visible"]))).status, 403);
  db.tables.app_users[0].role = "agent";
  assert.equal((await route.POST(req("archive"))).status, 403);
  db.tables.app_users[0].role = "owner";
  const archived = await route.POST(req("archive", ["test", "test"]));
  assert.equal(archived.status, 200);
  assert.equal((await archived.json()).count, 1);
  assert.ok(db.tables.leads[0].archived_at);
  assert.equal(db.tables.leads[0].archived_by, "owner");
  assert.equal(db.tables.leads[0].archive_reason, "Synthetic cleanup");
  assert.equal((await route.POST(req("restore"))).status, 200);
  assert.equal(db.tables.leads[0].archived_at, null);
  assert.equal(refreshes, 2);
  assert.equal(invalidations, 2);
  assert.equal(JSON.stringify([db.tables.claims, db.tables.firm_deliveries]), evidence, "Signing/delivery state and clocks stay intact");
  db.failOn = (op: any) => op.kind === "update" ? "Synthetic database failure" : null;
  assert.equal((await route.POST(req("archive"))).status, 500);
  assert.equal(db.tables.leads[0].archived_at, null);
  assert.equal(refreshes, 2);
  db.failOn = (op: any) => { if (op.kind === "update") db.tables.leads = []; return null; };
  const noRows = await route.POST(req("archive"));
  assert.equal(noRows.status, 409, "A zero-row write must not report success");
  assert.equal((await noRows.json()).ok, undefined);
  console.log("Archive API: scope, permission, exact write count, restore, cache refresh, failure and evidence preservation passed.");
})().catch(e => { console.error(e); process.exitCode = 1; });
