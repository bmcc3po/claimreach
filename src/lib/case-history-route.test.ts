// Source routes with synthetic session rows and no network/provider access.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "./test-fake-db";
import * as signing from "./mva-call/signing-matter";
import * as matter from "./matter";
import * as notes from "./file-notes";
import * as sendAttempt from "./mva-call/send-attempt";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import LawRulerSyncSummary from "../components/LawRulerSyncSummary";

globalThis.fetch = async () => { throw Error("Network forbidden"); };
(globalThis as any).React = React;
const L = "10000000-0000-4000-8000-000000000001", A = "20000000-0000-4000-8000-000000000001", B = "20000000-0000-4000-8000-000000000002";
function world() {
  const db: any = new FakeDb({
    leads: [{ id: L, firm_id: "firm", campaign_id: "ca", claimant_name: "Synthetic PNC", archived_at: null }],
    claims: [A, B].map((id, i) => ({ id, lead_id: L, firm_id: "firm", campaign_id: i ? "cb" : "ca", claim_type: "mva", status: i ? "contacting" : "new" })),
    esign_submissions: [{ id: "sign-a", lead_id: L, claim_id: A }, { id: "sign-b", lead_id: L, claim_id: B }],
    notes: [{ id: "note-a", lead_id: L, claim_id: A }, { id: "note-b", lead_id: L, claim_id: B }, { id: "shared-note", lead_id: L, claim_id: null }],
    case_documents: [{ id: "doc-a", lead_id: L, claim_id: A }, { id: "doc-b", lead_id: L, claim_id: B }, { id: "shared-doc", lead_id: L, claim_id: null }],
    audit_log: [{ id: "audit-a", lead_id: L, meta: { claim_id: A } }, { id: "audit-b", lead_id: L, meta: { claim_id: B } }],
    retainers: [{ id: "ret-a", lead_id: L, claim_id: A }, { id: "ret-b", lead_id: L, claim_id: B }, { id: "ret-old", lead_id: L, claim_id: null }],
    signable_documents: [{ id: "legacy", lead_id: L, status: "signed" }, { id: "em-a", lead_id: L, audit: { emergency: { claim_id: A } } }, { id: "em-b", lead_id: L, audit: { emergency: { claim_id: B } } }],
  });
  db.auth = { getUser: async () => ({ data: { user: { id: "agent" } } }) };
  db.storage = { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "/synthetic-url" } }) }) };
  db.rpc = async () => ({ data: null, error: null });
  return db;
}
function route(file: string, db: any) {
  const mods: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, o: any = {}) => ({ body, status: o.status ?? 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => db },
    "@/lib/mva-call/server": { requireStaff: async () => ({ id: "agent", role: "agent" }) },
    "@/lib/mva-call/signing-matter": { ...signing, resolveSigningMatter: (session: any, leadId: string, opts: any) => signing.resolveSigningMatter(session, leadId, { ...opts, authoritativeDb: db }) }, "@/lib/matter": matter, "@/lib/file-notes": notes,
    "@/lib/mva-call/agreement-names": { agreementName: () => "Synthetic agreement" },
    "@/lib/mva-call/send-attempt": sendAttempt,
    "@/lib/claim-status": { loadStatuses: async () => [] },
    "@/lib/statuses": { resolveStatus: (status: string) => ({ label: status, tone: "neutral" }) },
    "@/lib/lawruler-recovery": { loadLawRulerProvenance: async () => null },
    "@/lib/retainer-tokens": {}, "@/lib/audit": { recordAudit: async () => {} },
    "@/lib/gate": { gateUser: async () => ({ id: "agent", role: "agent", can: () => true }) },
    "@/lib/permissions": { isInternalRole: () => true },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api", file, "route.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {};
  new Function("require", "exports", code)((id: string) => { if (!(id in mods)) throw Error(`Unstubbed ${id}`); return mods[id]; }, exp);
  return exp;
}
const req = (claim = B) => ({ url: `https://synthetic.invalid/api/history?lead_id=${L}&claim_id=${claim}` });
const auditRows = () => [
  { id: "own-column", lead_id: L, claim_id: B, meta: null },
  { id: "sibling-column", lead_id: L, claim_id: A, meta: null },
  { id: "own-column-overrides-meta", lead_id: L, claim_id: B, meta: { claim_id: A } },
  { id: "sibling-column-overrides-meta", lead_id: L, claim_id: A, meta: { claim_id: B } },
  { id: "own-legacy", lead_id: L, claim_id: null, meta: { claim_id: B } },
  { id: "sibling-legacy", lead_id: L, claim_id: null, meta: { claim_id: A } },
  { id: "shared", lead_id: L, claim_id: null, meta: null },
];
const expectedHistory = ["own-column", "own-column-overrides-meta", "own-legacy", "shared"];

// Evaluate the actual client selector rather than a second implementation.
function sourceNode(file: string, pred: (n: ts.Node) => boolean): ts.Node {
  const source = ts.createSourceFile(file, fs.readFileSync(path.resolve(__dirname, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => { if (pred(n)) found = n; else ts.forEachChild(n, visit); };
  visit(source); assert.ok(found, `Missing test boundary in ${file}`); return found;
}
function clientHistory(audit: any[], activeClaimId: string | null) {
  const node = sourceNode("../components/LeadWorkspace.tsx", (n) => ts.isVariableDeclaration(n) && n.name.getText() === "matterAudit") as ts.VariableDeclaration;
  const source = `exports.select = (audit, activeClaimId) => ${node.initializer!.getText()};`;
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {}; new Function("exports", code)(exp); return exp.select(audit, activeClaimId);
}
function renderedFileText(data: any) {
  const component = sourceNode("../components/calls/DeskPanel.tsx", (n) => ts.isFunctionDeclaration(n) && n.name?.text === "FileTab");
  const code = ts.transpileModule(`${component.getText()}\nexports.render = FileTab;`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let hook = 0;
  const useState = (initial: any) => [hook++ === 0 ? data : initial, () => {}];
  const exp: any = {};
  new Function("require", "exports", "useState", "useEffect", "useRef", "fmtWhen", "ContactCard", "LeadCard", "LawRulerSyncSummary", "FileStatusControl", code)(
    (id: string) => { assert.equal(id, "react/jsx-runtime"); return jsxRuntime; },
    exp, useState, () => {}, (initial: any) => ({ current: initial }), () => "", () => null, () => null, LawRulerSyncSummary, () => null,
  );
  return renderToStaticMarkup(exp.render({ leadId: L, claimId: B, lead: null,
    noteDraft: { body: "", scope: "call", saving: false, error: "" }, updateNoteDraft: () => {},
    sendHoldNotice: "", reconcileActions: [], reconcileBusy: false, reconcileMessage: "", onCorrect: () => {},
  }));
}
let count = 0;
async function check(name: string, fn: () => Promise<void>) { await fn(); count++; console.log("ok", name); }
async function main() {
  await check("File API returns selected status/agreement/notes/documents; labels shared documents", async () => {
    const r = await route("calls/file", world()).GET(req()); assert.equal(r.status, 200);
    assert.equal(r.body.claim_id, B); assert.equal(r.body.status.key, "contacting");
    assert.deepEqual(r.body.agreements.map((x: any) => x.id), ["sign-b"]);
    assert.deepEqual(r.body.notes.map((x: any) => x.id).sort(), ["note-b", "shared-note"]);
    assert.deepEqual(r.body.docs.map((x: any) => x.id), ["doc-b", "shared-doc"]);
    assert.equal(r.body.docs[1].scope, "Shared file document"); assert.deepEqual(r.body.history.map((x: any) => x.id), ["audit-b"]);
  });
  await check("File API foreign named matter refuses before document signing", async () => {
    assert.equal((await route("calls/file", world()).GET(req("90000000-0000-4000-8000-000000000001"))).status, 404);
  });
  await check("File review remains readable during a send hold or unavailable send check without exposing saved context", async () => {
    for (const unavailable of [false, true]) {
      const db = world();
      db.rpc = async () => unavailable ? { data: null, error: { code: "08006" } } : { data: {
        id: "attempt", state: "uncertain", created_at: "2026-09-29T19:00:00Z", send_context: { secret: "never in API" },
      }, error: null };
      const r = await route("calls/file", db).GET(req()); assert.equal(r.status, 200);
      assert.equal(r.body.agreements[0].id, "sign-b"); assert.equal(r.body.docs.length, 2);
      assert.equal(!!r.body.send_check_error, unavailable); assert.equal(r.body.send_attempt?.id ?? null, unavailable ? null : "attempt");
      assert.ok(!JSON.stringify(r.body).includes("never in API"));
    }
  });
  await check("File API exposes the resolved archived state without mutating the file", async () => {
    for (const archived_at of [null, "2026-09-28T12:00:00Z"]) {
      const db = world(); db.tables.leads[0].archived_at = archived_at;
      const r = await route("calls/file", db).GET(req()); assert.equal(r.status, 200);
      assert.equal(r.body.lead.archived, !!archived_at); assert.ok(db.ops.every((o: any) => o.kind === "select"));
    }
  });
  await check("File history prefers claim_id, falls back to legacy metadata, and includes only truly shared rows", async () => {
    const db = world(); db.tables.audit_log = auditRows();
    const r = await route("calls/file", db).GET(req()); assert.equal(r.status, 200);
    assert.deepEqual(r.body.history.map((x: any) => x.id), expectedHistory);
  });
  await check("CRM timeline uses the same column-first history association on both matter selections", async () => {
    assert.deepEqual(clientHistory(auditRows(), B).map((x: any) => x.id), expectedHistory);
    assert.deepEqual(clientHistory(auditRows(), A).map((x: any) => x.id), ["sibling-column", "sibling-column-overrides-meta", "sibling-legacy", "shared"]);
    assert.deepEqual(clientHistory(auditRows(), null).map((x: any) => x.id), ["shared"]);
  });
  await check("CRM server loader actually selects the audit claim column needed by its client filter", async () => {
    const file = "../app/(internal)/leads/[id]/page.tsx";
    const fromAudit = sourceNode(file, (n) => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "from" && n.arguments[0]?.getText() === '"audit_log"');
    const select = fromAudit.parent.parent as ts.CallExpression;
    assert.ok(ts.isCallExpression(select) && ts.isPropertyAccessExpression(select.expression) && select.expression.name.text === "select");
    assert.ok((select.arguments[0] as ts.StringLiteral).text.split(",").map((s) => s.trim()).includes("claim_id"));
  });
  await check("File documents render the API's shared and selected-matter scope labels", async () => {
    const r = await route("calls/file", world()).GET(req()); assert.equal(r.status, 200);
    const rendered = renderedFileText(r.body);
    assert.match(rendered, /Shared file document/); assert.match(rendered, /This matter/);
  });
  await check("actual File tab mounts the real import summary and exposes failed structured recovery safely", async () => {
    const r = await route("calls/file", world()).GET(req());
    const rendered = renderedFileText({ ...r.body, imported: {
      sourceStatus: "<script>unsafe source</script>",
      lastSync: { intake_result: { outcome: "failed", error: "Synthetic recovery needs retry" } },
    } });
    assert.match(rendered, /aria-label="LawRuler import"/); assert.match(rendered, /Synthetic recovery needs retry/);
    assert.match(rendered, /&lt;script&gt;/); assert.ok(!rendered.includes("<script>"));
  });
  await check("Retainer API returns only selected matter; null legacy is not assigned to sibling", async () => {
    const r = await route("retainer", world()).GET(req()); assert.equal(r.status, 200); assert.deepEqual(r.body.retainers.map((x: any) => x.id), ["ret-b"]);
  });
  await check("Retainer history preserves sole-matter legacy association", async () => {
    const db = world(); db.tables.claims = db.tables.claims.filter((c: any) => c.id === B);
    const r = await route("retainer", db).GET(req()); assert.equal(r.status, 200); assert.deepEqual(r.body.retainers.map((x: any) => x.id), ["ret-b", "ret-old"]);
  });
  await check("Legacy retainer generation/status/delete refuse without changing evidence", async () => {
    for (const op of ["generate", "set_status", "delete"]) {
      const db = world(), r = await route("retainer", db).POST({ json: async () => ({ op, id: "ret-b", lead_id: L, claim_id: B }) });
      assert.equal(r.status, 409); assert.ok(db.ops.every((x: any) => x.kind === "select"));
    }
  });
  await check("Signable history distinguishes selected emergency from unassociated legacy documents", async () => {
    const r = await route("signable", world()).GET(req()); assert.equal(r.status, 200);
    assert.deepEqual(r.body.docs.map((x: any) => x.id), ["em-b"]); assert.deepEqual(r.body.legacy_docs.map((x: any) => x.id), ["legacy"]);
  });
  console.log(`${count} passed`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
