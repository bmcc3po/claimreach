import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { pilotStaffApiAllowed } from "../inno-pilot-access";
const source = fs.readFileSync(path.resolve(__dirname, "../../app/api/calls/qa/ready/route.ts"), "utf8");
const body = { op: "submit", decision: "approve", lead_id: "test-lead", claim_id: "test-claim", g_qa_pass: "green", g_esign: "green", g_criteria: "green", confirm_intake: true, confirm_signed_packet: true, confirm_criteria: true };
function route(options: any = {}) {
  const calls: any[] = [];
  const lead = options.lead === undefined ? { id: body.lead_id, firm_id: "firm-a", archived_at: null } : options.lead;
  const sb = { from(table: string) { assert.equal(table, "leads"); return { select() { return this; }, eq(k: string, v: string) { assert.equal(k, "id"); assert.equal(v, body.lead_id); return this; }, maybeSingle: async () => ({ data: lead, error: options.dbError || null }) }; } };
  const mods: Record<string, any> = {
    "next/server": { NextRequest: Request, NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
    "@/lib/supabase-server": { supabaseServer: async () => sb, supabaseAdmin: () => ({ admin: true }) },
    "@/lib/gate": { gateUser: async () => options.user === null ? null : { role: options.role || "agent", can: () => options.allowed !== false } },
    "@/lib/permissions": { isInternalRole: (role: string) => ["owner", "admin", "manager", "qa", "agent"].includes(role) },
    "@/lib/matter": { resolveMatter: async (session: any, id: string, config: any) => { assert.equal(session, sb); assert.equal(id, body.lead_id); assert.equal(config.claimId, body.claim_id); return options.matter || { ok: true, claim: { id: body.claim_id, firm_id: "firm-a" } }; } },
    "@/app/api/qa/route": { POST: async (req: Request) => { calls.push(await req.json()); return Response.json({ ok: options.qaStatus ? false : true }, { status: options.qaStatus || 200 }); } },
  };
  const exp: any = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", code)((id: string) => { assert.ok(mods[id], id); return mods[id]; }, exp);
  return { calls, post: (b: any = body) => exp.POST(new Request("https://test.invalid/api/calls/qa/ready", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })) };
}
(async () => {
  assert.equal(pilotStaffApiAllowed("/api/calls/qa/ready", "POST"), true);
  assert.equal(pilotStaffApiAllowed("/api/qa", "POST"), false);
  for (const [options, status] of [[{ user: null }, 401], [{ role: "firm" }, 403], [{ allowed: false }, 403], [{ lead: null }, 404], [{ dbError: { message: "offline" } }, 503], [{ lead: { id: body.lead_id, firm_id: "firm-a", archived_at: "now" } }, 409], [{ matter: { ok: false, status: 404, error: "not visible" } }, 404], [{ matter: { ok: true, claim: { id: body.claim_id, firm_id: "other-firm" } } }, 409]] as const) {
    const r = route(options); assert.equal((await r.post()).status, status); assert.equal(r.calls.length, 0);
  }
  for (const patch of [{ op: "draft" }, { op: "thread" }, { op: "associate_evidence" }, { decision: "decline" }, { claim_id: null }, { lead_id: {} }]) {
    const r = route(); assert.equal((await r.post({ ...body, ...patch })).status, 400); assert.equal(r.calls.length, 0);
  }
  const r = route();
  assert.equal((await r.post({ ...body, agent_ready: false, actor_id: "someone-else", force: true, draft: {}, agent_note: "unrelated write", qa_note: "a".repeat(2500) })).status, 200);
  assert.equal(r.calls[0].agent_ready, true); assert.equal(r.calls[0].qa_note.length, 2000);
  for (const extra of ["actor_id", "force", "draft", "agent_note"]) assert.ok(!(extra in r.calls[0]));
  const owner = route({ role: "owner" }); await owner.post({ ...body, agent_ready: true }); assert.equal(owner.calls[0].agent_ready, false);
  const incomplete = route({ qaStatus: 409 }); assert.equal((await incomplete.post()).status, 409);
  console.log("18 agent-ready route checks passed: scoped access, narrow action, server actor and underlying QA refusal");
})().catch((error) => { console.error(error); process.exitCode = 1; });
