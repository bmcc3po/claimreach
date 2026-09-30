// Actual route source, synthetic DB/provider boundaries. No network or live data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../test-fake-db";
import * as signing from "./signing-matter";
import * as dispo from "./dispo";
import * as report from "./report";

globalThis.fetch = async () => { throw Error("Network forbidden"); };
const L = "10000000-0000-4000-8000-000000000001", C = "20000000-0000-4000-8000-000000000001", B = "20000000-0000-4000-8000-000000000002";
function world() { return new FakeDb({
  leads: [{ id: L, firm_id: "firm", campaign_id: "campaign", claimant_name: "Synthetic PNC", archived_at: null }],
  claims: [{ id: C, lead_id: L, firm_id: "firm", campaign_id: "campaign", claim_type: "mva", answers: { mva_call: { story: { text: "Selected claim" } } } }],
  intake_calls: [{ id: "call", lead_id: L, claim_id: C, firm_id: "firm", campaign_id: "campaign" }],
  esign_submissions: [{ id: "primary", lead_id: L, claim_id: C, firm_id: "firm", pax_index: null, status: "completed", created_at: "2026-09-01T12:00:00Z" }],
  signable_documents: [],
}); }
function route(db: FakeDb) {
  const emails: any[] = [], statuses: any[] = [];
  const mods: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, o: any = {}) => ({ body, status: o.status ?? 200 }) } },
    "@/lib/lead-key": { leadKeyOf: (l: any) => l.id },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => db },
    "@/lib/mva-call/server": { requireStaff: async () => ({ id: "agent", name: "Synthetic Agent", role: "agent" }) },
    "@/lib/mva-call/report": report,
    "@/lib/signed-docs": { signedPdfAttachment: async () => ({ file: null }) },
    "@/lib/mva-call/dispo": dispo,
    "@/lib/claim-status": { setClaimStatusForLeads: async (p: any) => { statuses.push(p); return { ok: true }; } },
    "@/lib/mva-call/signing-matter": { ...signing,
      resolveSigningMatter: (session: any, leadId: string, options: any = {}) => signing.resolveSigningMatter(session, leadId, { ...options, authoritativeDb: db }),
    },
    "@/lib/audit": { recordAudit: async () => {} },
    "@/lib/webhook-deliver": { fireEvent: async () => {} },
    "@/lib/email": { sendEmail: async (p: any) => { emails.push(p); return { ok: true }; } },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../../app/api/calls/dispo/route.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {};
  new Function("require", "exports", code)((id: string) => { if (!(id in mods)) throw Error(`Unstubbed ${id}`); return mods[id]; }, exp);
  return { emails, statuses, post: (extra: any = {}) => exp.POST({ url: "https://synthetic.invalid/api/calls/dispo", json: async () => ({ lead_id: L, claim_id: C, call_id: "call", dispo: "signed", notify: [], ...extra }) }) };
}
let count = 0;
async function check(name: string, fn: () => Promise<void>) { await fn(); count++; console.log("ok", name); }
async function main() {
  await check("newer provisional emergency prevents old primary signed disposition and notification", async () => {
    const db = world(); db.tables.signable_documents.push({ id: "emergency", lead_id: L, firm_id: "firm", status: "signed", created_at: "2026-09-28T12:00:00Z", audit: { emergency: { claim_id: C } } });
    const r = route(db), result = await r.post({ notify: ["synthetic@example.invalid"] });
    assert.equal(result.status, 409); assert.equal(r.emails.length, 0); assert.equal(db.tables.intake_calls[0].status, undefined);
  });
  await check("DNC does not depend on agreement reads and disables every contact permission", async () => {
    const db = world(); db.failOn = (op) => op.table === "esign_submissions" ? "synthetic agreement read failure" : null;
    const r = route(db), result = await r.post({ dispo: "dnc" });
    assert.equal(result.status, 200); assert.equal(r.statuses[0].status, "dnc");
    for (const key of ["perm_call", "perm_text", "perm_email"]) assert.equal(db.tables.leads[0][key], false);
    assert.ok(!db.ops.some((op) => op.table === "esign_submissions"));
  });
  await check("mismatched claim and call refuse before writes or notification", async () => {
    const db = world(); db.tables.claims.push({ ...db.tables.claims[0], id: B }); const r = route(db);
    assert.equal((await r.post({ claim_id: B })).status, 409); assert.equal(r.emails.length, 0); assert.equal(r.statuses.length, 0);
  });
  await check("own-matter signed disposition closes call and scoped report uses its answers", async () => {
    const db = world(), r = route(db); const result = await r.post({ notify: ["synthetic@example.invalid"] });
    assert.equal(result.status, 200); assert.equal(db.tables.intake_calls[0].status, "ended");
    assert.equal(r.emails.length, 1); assert.match(r.emails[0].text, /Selected claim/); assert.match(r.emails[0].text, new RegExp(C));
  });
  await check("unreadable signature evidence refuses signed disposition before writes", async () => {
    const db = world(); db.failOn = (op) => op.table === "esign_submissions" ? "synthetic failure" : null;
    const r = route(db); assert.equal((await r.post()).status, 500); assert.equal(r.emails.length, 0); assert.ok(db.ops.every((op) => op.kind === "select"));
  });
  console.log(`${count} passed`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
