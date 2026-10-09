import * as fileAgents from '../file-agents';
import * as archiveControl from '../archive-control';
import { NextRequest } from 'next/server';
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../test-fake-db";
import * as statuses from "../statuses";
import * as matter from "../matter";
import * as passengerSigning from './passenger-signing';
import * as signedDecline from '../signed-decline';
import * as ownerConfirmation from '../owner-file-confirmation';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LEAD = id(1), CLAIM = id(2), FIRM = id(3), CAMP = id(4), REVIEW = id(5), AGENT = id(6), AGREEMENT = id(7), REQUEST = id(8), SIBLING = id(9);
const stamp = "2026-09-30T06:00:00.000Z";
function load(file: string, modules: Record<string, any>) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports: any = {};
  new Function("require", "exports", code)((name: string) => { assert.ok(name in modules, `Unstubbed ${name}`); return modules[name]; }, exports);
  return exports;
}
function fixture() {
  const db = new FakeDb({
    leads: [{ id: LEAD, firm_id: FIRM, campaign_id: CAMP, case_type: "mva", archived_at: null, wip_pending: true, qa_pending: false }],
    claims: [{ id: CLAIM, lead_id: LEAD, firm_id: FIRM, campaign_id: CAMP, claim_type: "mva", status: "signed_wip", updated_at: stamp }, { id: SIBLING, lead_id: LEAD, firm_id: FIRM, campaign_id: "other", claim_type: "mva", status: "wip", updated_at: stamp }],
    campaigns: [{ id: CAMP, firm_id: FIRM, name: "INNO MVA", case_type: "mva", active: true }], firms: [{ id: FIRM, slug: "tmp" }],
    qa_reviews: [{ id: REVIEW, lead_id: LEAD, claim_id: CLAIM, decision: "wip", created_at: stamp }],
    esign_submissions: [{ id: AGREEMENT, lead_id: LEAD, claim_id: CLAIM, firm_id: FIRM, campaign_id: CAMP, status: "signed", signed_at: stamp, agent_reviewed_at: stamp, pax_index: null, created_at: stamp }],
    statuses: statuses.DEFAULT_STATUSES, audit_log: [],
  });
  const state = { staff: { id: AGENT, name: "Agent", role: "agent" } as any, pending: null as any, pendingError: false, automation: 0, events: [] as string[], admin: 0 };
  const modules: Record<string, any> = {
    "@/lib/file-agents": fileAgents,
    "@/lib/archive-control": archiveControl,
    "next/server": { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => { state.admin++; return db; } },
    "@/lib/statuses": statuses,
    "@/lib/matter": matter,
    "./passenger-signing": passengerSigning,
    "./signed-decline": signedDecline,
    "@/lib/owner-file-confirmation": ownerConfirmation,
    "@/lib/linked-files": { paxParentId: () => null },
    "./server": { LEAD_CALL_COLS: "*" },
    "@/lib/mva-call/server": { requireStaff: async () => state.staff },
    "@/lib/mva-call/send-attempt": { readPendingSendAttempt: async () => state.pendingError ? { ok: false, status: 503, error: "Pending read failed" } : ({ ok: true, attempt: state.pending }) },
    "@/lib/automation-engine": { matchAndStart: async () => { state.automation++; } },
    "@/lib/webhook-deliver": { fireEvent: async (_firm: string, event: string) => { state.events.push(event); } },
    "@/lib/firm-delivery": { deliverLeadToFirm: async () => { throw Error("Resubmission cannot deliver"); } },
    "@/lib/mva-call/agreement-names": { agreementName: () => "Synthetic agreement" },
    "@/lib/file-notes": { loadFileNotes: async () => ({ notes: [], deskNotes: [] }), mergeFileNotes: () => [] },
    "@/lib/lawruler-recovery": { loadLawRulerProvenance: async () => null },
  };
  modules["@/lib/mva-call/signing-matter"] = load("lib/mva-call/signing-matter.ts", modules);
  modules["@/lib/claim-status"] = load("lib/claim-status.ts", modules);
  const route = load("app/api/calls/qa/resubmit/route.ts", modules);
  const file = load("app/api/calls/file/route.ts", modules);
  const post = (patch: any = {}) => route.POST({ json: async () => ({ lead_id: LEAD, claim_id: CLAIM, qa_review_id: REVIEW, request_id: REQUEST, ...patch }) });
  return { db, state, post, readFile: (claim = CLAIM) => file.GET(new NextRequest(`https://example.invalid/api/calls/file?lead_id=${LEAD}&claim_id=${claim}`)), claim: db.tables.claims[0], agreement: db.tables.esign_submissions[0] };
}
let count = 0;
async function test(name: string, run: () => Promise<void>) { await run(); count++; console.log("ok", name); }
const noWrite = (f: ReturnType<typeof fixture>) => assert.equal(f.db.ops.filter(op => op.kind !== "select").length, 0);

(async () => {
  await test("actual route and canonical setter resubmit only exact signed WIP matter, preserving signature and sibling", async () => {
    const f = fixture(), original = JSON.stringify(f.agreement), response = await f.post();
    assert.equal(response.status, 200); assert.equal(f.claim.status, "signed_qa");
    assert.equal(f.db.tables.claims[1].status, "wip"); assert.equal(JSON.stringify(f.agreement), original);
    assert.equal(f.db.tables.leads[0].qa_pending, true); assert.equal(f.db.tables.leads[0].wip_pending, true);
    assert.equal(f.db.tables.audit_log.length, 1); assert.equal(f.db.tables.audit_log[0].meta.agreement_id, AGREEMENT);
    assert.equal(f.db.tables.audit_log[0].claim_id, CLAIM); assert.equal(f.db.tables.audit_log[0].meta.completed, true);
    assert.equal(f.state.automation, 1); assert.deepEqual(f.state.events, ["lead.updated"]);
    const write = f.db.ops.find(op => op.table === "claims" && op.kind === "update")!;
    assert.ok(write.filters.some(([op, key, value]) => op === "eq" && key === "updated_at" && value === stamp));
  });
  await test("same request retry is idempotent and never repeats signing or transition side effects", async () => {
    const f = fixture(); assert.equal((await f.post()).status, 200); const reply = await f.post();
    assert.equal(reply.status, 200); assert.equal(reply.body.already, true); assert.equal(f.state.automation, 1); assert.equal(f.db.tables.audit_log.length, 1);
    assert.equal((await f.post({ request_id: id(99) })).status, 409);
  });
  await test("two concurrent different requests can perform only one transition", async () => {
    const f = fixture(); const responses = await Promise.all([f.post(), f.post({ request_id: id(99) })]);
    assert.equal(responses.filter(r => r.status === 200).length, 1); assert.equal(f.state.automation, 1); assert.equal(f.claim.status, "signed_qa");
  });
  await test("unchanged status with newer intake version fails the actual optimistic write", async () => {
    const f = fixture(); f.db.failOn = op => { if (op.table === "claims" && op.kind === "update") f.claim.updated_at = "2026-09-30T06:01:00.000Z"; return null; };
    assert.equal((await f.post()).status, 409); assert.equal(f.claim.status, "signed_wip"); assert.equal(f.state.automation, 0);
  });
  await test("newer QA decision cannot be overwritten", async () => {
    const f = fixture(); f.db.failOn = op => { if (op.table === "claims" && op.kind === "update") f.claim.status = "signed_ok"; return null; };
    assert.equal((await f.post()).status, 409); assert.equal(f.claim.status, "signed_ok"); assert.equal(f.state.automation, 0);
  });
  await test("audit request failure prevents all status writes", async () => {
    const f = fixture(); f.db.failOn = op => op.table === "audit_log" && op.kind === "insert" ? "audit unavailable" : null;
    assert.equal((await f.post()).status, 503); assert.equal(f.claim.status, "signed_wip"); assert.equal(f.state.automation, 0);
  });
  for (const table of ["leads", "audit_log"]) await test(`post-status ${table} write failure is truthful and same-key retry repairs without replay`, async () => {
    const f = fixture(); f.db.failOn = op => op.table === table && op.kind === "update" ? "temporarily unavailable" : null;
    assert.equal((await f.post()).status, 503); assert.equal(f.claim.status, "signed_qa");
    f.db.failOn = () => null; assert.equal((await f.post()).body.already, true);
    assert.equal(f.state.automation, 1); assert.equal(f.db.tables.audit_log[0].meta.completed, true);
    assert.equal(f.db.tables.audit_log[0].meta.agreement_id, AGREEMENT); assert.equal(f.db.tables.leads[0].qa_entered_at, f.claim.updated_at);
  });
  await test("missing, inactive or external gated user stops before any data access", async () => {
    const f = fixture(); f.state.staff = null; assert.equal((await f.post()).status, 401); noWrite(f); assert.equal(f.state.admin, 0);
  });
  for (const status of ["new", "wip", "dq", "signed", "signed_qa", "signed_ok", "delivered"]) await test(`non-returned status ${status} rejected`, async () => {
    const f = fixture(); f.claim.status = status; assert.equal((await f.post()).status, 409); noWrite(f);
  });
  for (const patch of [{ status: "opened" }, { signed_at: null }, { voided_at: stamp }, { status: "voided" }, { replacement_requested_at: stamp }, { agent_reviewed_at: null }]) await test(`unusable current signature ${JSON.stringify(patch)} rejected`, async () => {
    const f = fixture(); Object.assign(f.agreement, patch); assert.equal((await f.post()).status, 409); noWrite(f);
  });
  await test("an old signed packet cannot replace the newest unsigned correction", async () => {
    const f = fixture(); f.db.tables.esign_submissions.push({ ...f.agreement, id: id(20), status: "sent", signed_at: null, created_at: "2026-09-30T06:01:00.000Z" });
    assert.equal((await f.post()).status, 409); noWrite(f);
  });
  await test("other lead, hidden claim, sibling campaign and archived file reject before writes", async () => {
    for (const change of ["lead", "missing", "sibling", "archived"]) {
      const f = fixture();
      if (change === "lead") f.claim.lead_id = id(40);
      if (change === "archived") f.db.tables.leads[0].archived_at = stamp;
      assert.ok((await f.post(change === "missing" ? { claim_id: id(50) } : change === "sibling" ? { claim_id: SIBLING } : {})).status >= 400); noWrite(f);
    }
  });
  await test("foreign firm or retired/non-INNO campaign fails closed", async () => {
    for (const change of ["firm", "inactive", "name"]) {
      const f = fixture(); if (change === "firm") f.db.tables.firms[0].slug = "tmt";
      if (change === "inactive") f.db.tables.campaigns[0].active = false;
      if (change === "name") f.db.tables.campaigns[0].name = "Other";
      assert.equal((await f.post()).status, 403); noWrite(f);
    }
  });
  await test("missing exact identity, stale QA return, read failure and pending send cannot mutate", async () => {
    for (const change of ["claim", "review", "decision", "read", "pending", "pendingError"]) {
      const f = fixture(); if (change === "decision") f.db.tables.qa_reviews[0].decision = "approve";
      if (change === "read") f.db.failOn = op => op.table === "qa_reviews" ? "read failed" : null;
      if (change === "pending") f.state.pending = { id: "pending" }; if (change === "pendingError") f.state.pendingError = true;
      assert.ok((await f.post(change === "claim" ? { claim_id: null } : change === "review" ? { qa_review_id: id(60) } : {})).status >= 400); noWrite(f);
    }
  });
  await test("request-key reuse cannot cross actors or exact matters", async () => {
    const f = fixture(); await f.post(); f.state.staff.id = id(71); assert.equal((await f.post()).status, 409); assert.equal(f.state.automation, 1);
  });
  await test("reload after partial queue failure exposes durable same-actor same-matter retry and clears after recovery", async () => {
    const f = fixture(); f.db.failOn = op => op.table === "leads" && op.kind === "update" ? "queue failed" : null;
    assert.equal((await f.post()).status, 503); f.db.failOn = () => null;
    const reloaded = await f.readFile(); assert.equal(reloaded.status, 200);
    assert.equal(reloaded.body.qa_resubmit_retry.request_id, REQUEST); assert.equal(reloaded.body.qa_return.id, REVIEW);
    assert.equal((await f.readFile(SIBLING)).body.qa_resubmit_retry, null, 'retry cannot cross siblings');
    f.state.staff.id = id(70); assert.equal((await f.readFile()).body.qa_resubmit_retry, null, 'retry cannot impersonate another actor');
    f.state.staff.id = AGENT;
    assert.equal((await f.post({ request_id: reloaded.body.qa_resubmit_retry.request_id })).status, 200);
    assert.equal((await f.readFile()).body.qa_resubmit_retry, null); assert.equal(f.state.automation, 1);
  });
  await test("new QA return cannot reuse an older retry after reload", async () => {
    const f = fixture(); f.db.failOn = op => op.table === "audit_log" && op.kind === "update" ? "audit failed" : null;
    await f.post(); f.db.failOn = () => null;
    f.db.tables.qa_reviews.push({ id: id(88), lead_id: LEAD, claim_id: CLAIM, decision: 'wip', created_at: '2026-10-01T00:00:00Z' });
    assert.equal((await f.readFile()).body.qa_resubmit_retry, null); assert.equal((await f.post()).status, 409);
  });
  console.log(`${count} actual resubmit route checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });

