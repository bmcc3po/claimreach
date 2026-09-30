// Offline source tests. Never calls a database, DocuSeal, or an email provider.
import assert from "node:assert/strict";
import { FakeDb } from "../test-fake-db";
import { resolveSigningMatter as resolveSigningMatterImpl, getMatterAgreement, getMatterEmergency, emergencySupersedes } from "./signing-matter";
import { recoverSignedTransition, syncSubmission } from "./esign";

const L = "10000000-0000-4000-8000-000000000001", C = "20000000-0000-4000-8000-000000000001", B = "20000000-0000-4000-8000-000000000002";
const F = "30000000-0000-4000-8000-000000000001", CAMP = "40000000-0000-4000-8000-000000000001";
const tests: [string, () => any][] = [];
const t = (name: string, fn: () => any) => tests.push([name, fn]);
// The offline fixture stands in for both the session view and trusted
// cardinality source; production supplies the service-role count after RLS.
const resolveSigningMatter = (db: any, leadId: string, opts: Record<string, any> = {}) =>
  resolveSigningMatterImpl(db, leadId, { ...opts, authoritativeDb: db });
function world() {
  return new FakeDb({
    leads: [{ id: L, firm_id: F, campaign_id: CAMP, archived_at: null }],
    claims: [{ id: C, lead_id: L, firm_id: F, campaign_id: CAMP, status: "esign_sent", claim_type: "mva" }],
    intake_calls: [{ id: "call-a", lead_id: L, firm_id: F, claim_id: C, campaign_id: CAMP }],
    esign_submissions: [{ id: "agreement-a", lead_id: L, firm_id: F, claim_id: C, campaign_id: CAMP, pax_index: null, status: "signed", created_at: "2026-09-28T10:00:00Z", submission_id: "offline-1", error: "[claim-transition-pending] Artifact warning", voided_at: null }],
    signable_documents: [], statuses: [],
  });
}
t("call ID resolves its own claim instead of lead campaign", async () => {
  const db = world(); db.tables.claims.push({ ...db.tables.claims[0], id: B }); db.tables.intake_calls[0].claim_id = B;
  const result = await resolveSigningMatter(db, L, { callId: "call-a" });
  assert.ok(result.ok); if (result.ok) assert.equal(result.matter.claim.id, B);
});
t("explicit claim/call mismatch rejects before writes", async () => {
  const db = world(); db.tables.claims.push({ ...db.tables.claims[0], id: B });
  assert.equal((await resolveSigningMatter(db, L, { claimId: B, callId: "call-a" })).ok, false);
  assert.ok(db.ops.every((op) => op.kind === "select"));
});
t("foreign call rejects without resolving a foreign lead", async () => {
  const db = world(); db.tables.intake_calls[0].lead_id = "other";
  assert.equal((await resolveSigningMatter(db, L, { callId: "call-a" })).ok, false);
});
t("archived read allowed explicitly; writes default blocked", async () => {
  const db = world(); db.tables.leads[0].archived_at = "2026-09-28";
  assert.equal((await resolveSigningMatter(db, L)).ok, false);
  assert.equal((await resolveSigningMatter(db, L, { allowArchived: true })).ok, true);
});
t("named sole claim accepts its compatible legacy null envelope", async () => {
  const db = world(); db.tables.esign_submissions[0].claim_id = null;
  const c = await resolveSigningMatter(db, L, { claimId: C }); assert.ok(c.ok);
  if (c.ok) { const r = await getMatterAgreement(db, c.lead, c.matter); assert.ok(r.ok && r.row?.id === "agreement-a"); }
});
t("multi-claim matter rejects unbound legacy evidence", async () => {
  const db = world(); db.tables.claims.push({ ...db.tables.claims[0], id: B }); db.tables.esign_submissions[0].claim_id = null;
  const c = await resolveSigningMatter(db, L, { claimId: C }); assert.ok(c.ok);
  if (c.ok) { const r = await getMatterAgreement(db, c.lead, c.matter); assert.ok(r.ok && r.row === null); }
});
t("latest voided envelope stays current and older ID is stale", async () => {
  const db = world(); db.tables.esign_submissions.push({ ...db.tables.esign_submissions[0], id: "new", status: "voided", created_at: "2026-09-28T11:00:00Z" });
  const c = await resolveSigningMatter(db, L, { claimId: C }); assert.ok(c.ok);
  if (c.ok) {
    const r = await getMatterAgreement(db, c.lead, c.matter); assert.ok(r.ok && r.row?.id === "new");
    assert.equal((await getMatterAgreement(db, c.lead, c.matter, "agreement-a")).ok, false);
    assert.equal((await getMatterAgreement(db, c.lead, c.matter, "agreement-a", { allowHistorical: true })).ok, true);
  }
});
t("passenger's original indexed agreement is primary on child file", async () => {
  const db = world(); db.tables.leads[0].external_id = "90000000-0000-4000-8000-000000000001:pax:k1"; db.tables.esign_submissions[0].pax_index = 2;
  const c = await resolveSigningMatter(db, L); assert.ok(c.ok);
  if (c.ok) { const r = await getMatterAgreement(db, c.lead, c.matter); assert.ok(r.ok && r.row?.id === "agreement-a"); }
});
t("failed claim write retains durable marker; later retry clears marker only", async () => {
  const db = world(); const row = { ...db.tables.esign_submissions[0] }; let calls = 0;
  const setStatus: any = async (opts: any) => { calls++; assert.deepEqual(opts.claimIds, [C]); assert.equal(opts.expectedStatus, "esign_sent"); return { ok: calls > 1 }; };
  assert.equal(await recoverSignedTransition(db, row, { setStatus }), false);
  assert.match(db.tables.esign_submissions[0].error, /claim-transition-pending/);
  assert.equal(await recoverSignedTransition(db, row, { setStatus }), true);
  assert.equal(db.tables.esign_submissions[0].error, "Artifact warning");
});
t("claim saved but flag write failed repairs flags without re-emitting status event", async () => {
  const db = world(); db.tables.claims[0].status = "signed_grievous";
  let calls = 0; const setStatus: any = async () => { calls++; return { ok: true }; };
  assert.equal(await recoverSignedTransition(db, db.tables.esign_submissions[0], { setStatus }), true); assert.equal(calls, 0);
  assert.ok(db.ops.some((op) => op.table === "leads" && op.kind === "update"));
});
t("a manual DQ decision never moves back to signed on recovery", async () => {
  const db = world(); db.tables.claims[0].status = "dq"; let calls = 0;
  assert.equal(await recoverSignedTransition(db, db.tables.esign_submissions[0], { setStatus: (async () => { calls++; return { ok: true }; }) as any }), true);
  assert.equal(calls, 0); assert.equal(db.tables.claims[0].status, "dq");
});
t("unreadable projections retain the recovery marker", async () => {
  const db = world(); db.tables.claims[0].status = "signed_grievous"; db.failOn = (op) => op.table === "statuses" ? "offline failure" : null;
  assert.equal(await recoverSignedTransition(db, db.tables.esign_submissions[0]), false); assert.match(db.tables.esign_submissions[0].error, /claim-transition-pending/);
});
t("newer emergency supersedes old primary but later DocuSeal re-sign supersedes emergency", async () => {
  const db = world(); db.tables.signable_documents.push({ id: "emergency", lead_id: L, firm_id: F, status: "signed", created_at: "2026-09-28T11:00:00Z", audit: { emergency: { claim_id: C } } });
  const c = await resolveSigningMatter(db, L); assert.ok(c.ok);
  if (c.ok) { const e = await getMatterEmergency(db, c.lead, c.matter); assert.ok(e.ok); if (e.ok) {
    assert.equal(emergencySupersedes(db.tables.esign_submissions[0], e.row), true);
    assert.equal(emergencySupersedes({ created_at: "2026-09-28T12:00:00Z" }, e.row), false);
  } }
  assert.equal(await recoverSignedTransition(db, db.tables.esign_submissions[0]), false);
});
t("stale callback cannot resurrect a freshly voided row or touch provider", async () => {
  const db = world(); const stale = { ...db.tables.esign_submissions[0], status: "sent" }; db.tables.esign_submissions[0].status = "voided";
  const prior = globalThis.fetch; globalThis.fetch = async () => { throw new Error("provider must not be called"); };
  try { assert.equal(await syncSubmission(db, stale), "voided"); assert.ok(db.ops.every((o) => o.kind === "select")); } finally { globalThis.fetch = prior; }
});
t("strict webhook sync rejects a failed local agreement read while ordinary polling keeps its status", async () => {
  const db = world(); db.tables.esign_submissions[0].status = "sent";
  db.failOn = (op) => op.table === "esign_submissions" && op.kind === "select" ? "offline failure" : null;
  assert.equal(await syncSubmission(db, db.tables.esign_submissions[0]), "sent");
  await assert.rejects(syncSubmission(db, db.tables.esign_submissions[0], { strict: true }), /current agreement/);
});
t("strict webhook sync rejects a failed provider read while ordinary polling keeps its status", async () => {
  const db = world(); db.tables.esign_submissions[0].status = "sent"; db.tables.esign_submissions[0].error = null;
  const prior = globalThis.fetch; globalThis.fetch = async () => { throw new Error("provider offline"); };
  try {
    assert.equal(await syncSubmission(db, db.tables.esign_submissions[0]), "sent");
    await assert.rejects(syncSubmission(db, db.tables.esign_submissions[0], { strict: true }), /verify the DocuSeal agreement/);
  } finally { globalThis.fetch = prior; }
});
t("strict webhook sync rejects an unsaved signature transition", async () => {
  const db = world(); db.tables.esign_submissions[0].status = "sent"; db.tables.esign_submissions[0].error = null;
  db.failOn = (op) => op.table === "esign_submissions" && op.kind === "update" ? "offline failure" : null;
  const priorFetch = globalThis.fetch, priorKey = process.env.DOCUSEAL_API_KEY;
  process.env.DOCUSEAL_API_KEY = "offline-test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 123, status: "pending", submitters: [{ role: "Client", status: "completed", completed_at: "2026-09-29T12:00:00Z" }] }), { status: 200 });
  try {
    await assert.rejects(syncSubmission(db, db.tables.esign_submissions[0], { strict: true }), /persist the DocuSeal status transition/);
    assert.equal(db.tables.esign_submissions[0].status, "sent");
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.DOCUSEAL_API_KEY; else process.env.DOCUSEAL_API_KEY = priorKey;
  }
});

(async () => { for (const [name, fn] of tests) { await fn(); console.log("ok", name); } console.log(`${tests.length} passed`); })().catch((e) => { console.error(e); process.exit(1); });
