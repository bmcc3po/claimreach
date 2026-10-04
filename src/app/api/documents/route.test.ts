// Actual route + permission/matter helpers; storage is offline and records calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../../../lib/test-fake-db";
import { gateUser } from "../../../lib/gate";
import { isInternalRole } from "../../../lib/permissions";
import { resolveMatter, rowBelongsToMatter } from "../../../lib/matter";
import { firmMatterReleased } from "../../../lib/firm-release";
import { DEFAULT_STATUSES } from "../../../lib/statuses";

const lead = "00000000-0000-4000-8000-000000000001";
const claim = "00000000-0000-4000-8000-000000000002";
const sibling = "00000000-0000-4000-8000-000000000003";
function harness(role = "firm") {
  const db = new FakeDb({
    app_users: [{ id: "user", role, active: true, full_name: "Test", firm_id: "firm" }],
    leads: [{ id: lead, firm_id: "firm", archived_at: null }],
    claims: [{ id: claim, lead_id: lead, firm_id: "firm", campaign_id: null, status: "delivered" }],
    statuses: DEFAULT_STATUSES.map(s => ({ ...s })),
    case_documents: [{ id: "document", firm_id: "firm", lead_id: lead, claim_id: claim, storage_path: `firm/${lead}/document.pdf` }],
  });
  const hidden: any[] = [];
  const counts = new FakeDb({});
  Object.defineProperty(counts.tables, "claims", { get: () => [...db.tables.claims, ...hidden] });
  const signed: string[] = [], uploaded: string[] = [], removed: string[][] = [];
  const storage = { from: (bucket: string) => {
    assert.equal(bucket, "case-docs");
    return {
      createSignedUrl: async (key: string) => { signed.push(key); return { data: { signedUrl: `https://storage.invalid/${key}` } }; },
      upload: async (key: string) => { uploaded.push(key); return { error: null }; },
      remove: async (keys: string[]) => { removed.push(keys); return { error: null }; },
    };
  } };
  const session = Object.assign(db, { auth: { getUser: async () => ({ data: { user: { id: "user" } } }) } });
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    "@/lib/supabase-server": { supabaseServer: async () => session, supabaseAdmin: () => Object.assign(counts, { storage }) },
    "@/lib/gate": { gateUser }, "@/lib/permissions": { isInternalRole },
    "@/lib/matter": { resolveMatter, rowBelongsToMatter }, "@/lib/firm-release": { firmMatterReleased },
  };
  const source = fs.readFileSync(path.join(__dirname, "route.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const route: any = {};
  new Function("require", "exports", js)((name: string) => { assert.ok(name in modules, name); return modules[name]; }, route);
  return { db, hidden, signed, uploaded, removed,
    get: (claimId: string | null = claim, leadId = lead) => route.GET({ url: `https://test.invalid/api/documents?lead=${leadId}${claimId ? `&claim=${claimId}` : ""}` }),
    post: (claimId: string | null = claim) => route.POST({ formData: async () => {
      const form = new FormData(); form.set("lead_id", lead); if (claimId) form.set("claim_id", claimId);
      form.set("file", new File(["NONBINDING TEST"], "test.pdf", { type: "application/pdf" })); return form;
    } }),
  };
}
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

test("released own-firm matter returns only its document and disables cache", async () => {
  const h = harness(); const r = await h.get();
  assert.equal(r.status, 200); assert.equal(r.body.claim_id, claim);
  assert.equal(r.body.docs.length, 1); assert.equal(h.signed.length, 1);
  assert.equal(r.headers["Cache-Control"], "no-store");
});
test("one released sibling cannot unlock an unreleased matter", async () => {
  const h = harness(); h.db.tables.claims.push({ ...h.db.tables.claims[0], id: sibling, status: "signed_qa" });
  h.db.tables.case_documents.push({ ...h.db.tables.case_documents[0], id: "sibling", claim_id: sibling });
  assert.equal((await h.get(sibling)).status, 403); assert.equal(h.signed.length, 0);
  assert.equal((await h.post(sibling)).status, 403); assert.equal(h.uploaded.length, 0);
});
test("explicit matter excludes sibling and unbound documents on multi-matter file", async () => {
  const h = harness(); h.db.tables.claims.push({ ...h.db.tables.claims[0], id: sibling });
  h.db.tables.case_documents.push({ ...h.db.tables.case_documents[0], id: "sibling", claim_id: sibling }, { ...h.db.tables.case_documents[0], id: "legacy", claim_id: null });
  assert.deepEqual((await h.get()).body.docs.map((d: any) => d.id), ["document"]);
  assert.equal((await h.get(null)).status, 409);
});
test("hidden sibling prevents legacy document inheritance", async () => {
  const h = harness(); h.hidden.push({ ...h.db.tables.claims[0], id: sibling });
  h.db.tables.case_documents.push({ ...h.db.tables.case_documents[0], id: "legacy", claim_id: null });
  assert.deepEqual((await h.get()).body.docs.map((d: any) => d.id), ["document"]);
});
test("sole matter retains canonical legacy document access", async () => {
  const h = harness(); h.db.tables.case_documents[0].claim_id = null;
  assert.equal((await h.get(null)).body.docs.length, 1);
});
test("cross-firm file, mismatched claim firm, archive and foreign lead all stop before storage", async () => {
  const changes = [
    (h: ReturnType<typeof harness>) => { h.db.tables.leads[0].firm_id = "other"; },
    (h: ReturnType<typeof harness>) => { h.db.tables.claims[0].firm_id = "other"; },
    (h: ReturnType<typeof harness>) => { h.db.tables.leads[0].archived_at = "2026-10-01"; },
    (h: ReturnType<typeof harness>) => { h.db.tables.claims[0].lead_id = sibling; },
  ];
  for (const change of changes) { const h = harness(); change(h); assert.ok((await h.get()).status >= 400); assert.ok((await h.post()).status >= 400); assert.equal(h.signed.length + h.uploaded.length, 0); }
});
test("inactive, missing and unknown roles do not sign documents", async () => {
  for (const mode of ["inactive", "missing", "unknown"]) {
    const h = harness(mode === "unknown" ? "vendor" : "firm");
    if (mode === "inactive") h.db.tables.app_users[0].active = false;
    if (mode === "missing") h.db.tables.app_users = [];
    assert.ok((await h.get()).status >= 400); assert.ok((await h.post()).status >= 400);
    assert.equal(h.signed.length + h.uploaded.length, 0);
  }
});
test("missing or failed live status catalog never falls back to an authorization grant", async () => {
  for (const failure of [false, true]) { const h = harness();
    if (failure) h.db.failOn = op => op.table === "statuses" ? "unavailable" : null; else h.db.tables.statuses = [];
    assert.equal((await h.get()).status, 403); assert.equal(h.signed.length, 0);
  }
});
test("failed document lookup reports failure instead of an empty successful list", async () => {
  const h = harness(); h.db.failOn = op => op.table === "case_documents" ? "unavailable" : null;
  assert.equal((await h.get()).status, 503); assert.equal(h.signed.length, 0);
});
test("internal session keeps pre-release access without needing firm equality", async () => {
  const h = harness("agent"); h.db.tables.app_users[0].firm_id = "intake-org"; h.db.tables.claims[0].status = "new";
  assert.equal((await h.get()).status, 200);
});
test("revoked upload permission prevents storage writes", async () => {
  const h = harness(); h.db.tables.app_users[0].perm_overrides = { "docs.upload": false };
  assert.equal((await h.post()).status, 403); assert.equal(h.uploaded.length, 0);
});
test("successful upload stamps the resolved claim, never a null wildcard", async () => {
  const h = harness(); const r = await h.post(null);
  assert.equal(r.status, 200); assert.equal(r.body.doc.claim_id, claim); assert.equal(r.body.doc.firm_id, "firm");
});
test("metadata refusal removes only the just-uploaded orphan", async () => {
  const h = harness(); h.db.failOn = op => op.kind === "insert" ? "refused" : null;
  assert.equal((await h.post()).status, 500); assert.deepEqual(h.removed, [h.uploaded]);
});
test("canonical path validation still rejects traversal and wrong-firm paths", async () => {
  for (const key of [`firm/${lead}/../secret`, `other/${lead}/file.pdf`, `firm/${lead}/%2e%2e/secret`]) {
    const h = harness(); h.db.tables.case_documents[0].storage_path = key;
    assert.equal((await h.get()).body.docs[0].url, null); assert.equal(h.signed.length, 0);
  }
});
(async () => { for (const [name, fn] of tests) { await fn(); console.log(`PASS ${name}`); } console.log(`${tests.length} document scope tests passed`); })().catch(e => { console.error(e); process.exitCode = 1; });
