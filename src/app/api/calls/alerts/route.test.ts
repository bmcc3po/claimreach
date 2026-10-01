import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { NextResponse } from "next/server";
import { isInternalRole } from "../../../../lib/permissions";
import { callAlertsFromQueues } from "../../../../lib/call-alerts";

const queues = { new: [{ id: "synthetic", claimId: "matter", href: "/app/synthetic?claim=matter", name: "PRIVATE", phone: "2025550100" }], calling: [], callbacks: [], sent: [], signed: [], wip: [] };
let actor: any = null, ready = true, reads = 0, crashes = false;
const session = { kind: "session" };
const modules: Record<string, any> = {
  "next/server": { NextResponse }, "@/lib/supabase-server": { supabaseServer: async () => session },
  "@/lib/gate": { gateUser: async (sb: any) => { assert.equal(sb, session); return actor; } },
  "@/lib/permissions": { isInternalRole }, "@/lib/call-alerts": { callAlertsFromQueues },
  "@/lib/mva-call/desk-data": { loadDeskWork: async (sb: any, role: string) => { assert.equal(sb, session); assert.equal(role, actor.role); reads++; if (crashes) throw new Error("private database error"); return { ready, queues }; } },
};
const source = fs.readFileSync(path.join(__dirname, "route.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exp: any = {};
new Function("require", "exports", code)((name: string) => { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name]; }, exp);
(async () => {
  assert.equal((await exp.GET()).status, 401);
  actor = { id: "firm-user", role: "firm", can: () => true }; assert.equal((await exp.GET()).status, 403);
  actor = { id: "restricted", role: "agent", can: (key: string) => key !== "leads.view" }; assert.equal((await exp.GET()).status, 403);
  actor = { id: "restricted", role: "agent", can: (key: string) => key !== "calls.log" }; assert.equal((await exp.GET()).status, 403);
  assert.equal(reads, 0, "denied actors never read queues");
  actor = { id: "operator", role: "agent", can: () => true };
  ready = false; let response = await exp.GET(); assert.equal(response.status, 503); assert.equal((await response.json()).alerts, undefined);
  ready = true; response = await exp.GET(); assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private, no-store/);
  const data = await response.json(); assert.equal(data.viewer, "operator"); assert.equal(data.alerts.length, 1);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE|2025550100/);
  crashes = true; response = await exp.GET(); assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /private database error/);
  console.log("ok actual call alert route: session-only reads, firm/capability denial, failure visibility, no cache or claimant PII");
})().catch(error => { console.error(error); process.exitCode = 1; });
