// Synthetic route test: recording an outside send never calls the mail provider.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "./test-fake-db";

const leadId = "10000000-0000-4000-8000-000000000001";
const claimId = "20000000-0000-4000-8000-000000000001";
const signedAt = "2026-10-01T12:00:00.000Z";
const sentAt = "2026-10-02T12:00:00.000Z";
function world() { return new FakeDb({
  leads: [{ id: leadId, firm_id: "firm", campaign_id: "campaign", archived_at: null }],
  claims: [{ id: claimId, lead_id: leadId, firm_id: "firm", claim_type: "mva", campaign: "INNO MVA", campaign_id: "campaign", status: "signed_grievous" }],
  campaigns: [{ id: "campaign", firm_id: "firm", firm_email: "firm@example.invalid" }],
  app_users: [{ email: "bmc@innovativeintake.com", role: "owner", active: true }],
  esign_submissions: [{ id: "signature", lead_id: leadId, claim_id: claimId, signed_at: signedAt, voided_at: null }],
  firm_deliveries: [], firm_delivery_dispatch: [], lead_activity: [],
}); }

function route(db: FakeDb, role = "owner") {
  const statuses: any[] = [];
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => db },
    "@/lib/gate": { gateUser: async () => ({ id: "owner", name: "Owner", role, can: () => true }) },
    "@/lib/matter": { resolveMatter: async () => ({ ok: true, claim: db.tables.claims[0] }) },
    "@/lib/firm-delivery-state": { confirmedFirmDeliveryAt: (rows: any[], firm: string) => rows.find((row) => row.ok && row.to_email === firm)?.created_at || null },
    "@/lib/claim-status": { setClaimStatusForLeads: async (options: any) => { statuses.push(options); return { ok: true }; } },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/firm-delivery/external/route.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported: any = {};
  new Function("require", "exports", code)((name: string) => { if (!(name in modules)) throw Error(`Unstubbed ${name}`); return modules[name]; }, exported);
  return { statuses, post: (extra: any = {}) => exported.POST({ json: async () => ({ lead_id: leadId, claim_id: claimId,
    to_email: "firm@example.invalid", sent_at: sentAt, evidence_note: "Verified in Sent at 8 AM", confirmed: true, ...extra }) }) };
}

async function main() {
  const forbidden = world(), agent = route(forbidden, "agent");
  assert.equal((await agent.post()).status, 403);
  assert.equal(forbidden.tables.firm_deliveries.length, 0);

  const invalid = world(), invalidRoute = route(invalid);
  assert.equal((await invalidRoute.post({ to_email: "other@example.invalid" })).status, 409);
  assert.equal((await invalidRoute.post({ sent_at: "2026-10-02T08:00" })).status, 400);
  assert.equal(invalid.tables.firm_deliveries.length, 0);

  const db = world(), owner = route(db);
  const result = await owner.post();
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(db.tables.firm_deliveries.length, 1);
  assert.equal(db.tables.firm_deliveries[0].triggered_by, "external_owner_confirmed");
  assert.equal(db.tables.firm_deliveries[0].created_at, sentAt);
  assert.deepEqual(db.tables.firm_deliveries[0].attachments, []);
  assert.equal(owner.statuses[0].status, "delivered");
  assert.equal(owner.statuses[0].historical, true);
  assert.equal(db.tables.lead_activity[0].meta.sent_at, sentAt);
  const repair = await owner.post({ op: "finish-existing", sent_at: undefined, evidence_note: undefined, to_email: undefined });
  assert.equal(repair.status, 200);
  assert.equal(db.tables.firm_deliveries.length, 1, "recovery must reuse the recorded outside send");
  console.log("External owner delivery route: 5 checks passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
