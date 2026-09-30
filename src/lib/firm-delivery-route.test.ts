import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as matter from "./matter";

// Real route source; synthetic caller session, admin client and sender.
const leadId = "11111111-1111-4111-8111-111111111111";
const claimId = "22222222-2222-4222-8222-222222222222";
const attemptKey = "33333333-3333-4333-8333-333333333333";
function harness(role = "agent", visible = true, capable = true, dispatchError: string | null = null) {
  const sends: any[] = [], rpcs: any[] = [], audits: any[] = [];
  const lead = { id: leadId, firm_id: "firm", campaign_id: "campaign" };
  const claim = { id: claimId, lead_id: leadId, firm_id: "firm", campaign_id: "campaign", status: "signed_grievous" };
  const sb = { from(table: string) {
    const rows: Record<string, any[]> = { leads: visible ? [lead] : [], claims: [claim], campaigns: [{ id: "campaign", firm_id: "firm", name: "MVA", firm_email: "firm@synthetic.invalid" }], firms: [{ id: "firm", name: "Synthetic firm" }] };
    let filters: ((r: any) => boolean)[] = [];
    const results = () => (rows[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const q: any = { select: () => q, order: () => q, eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
      maybeSingle: async () => ({ data: results()[0] ?? null, error: null }),
      then: (a: any, b: any) => Promise.resolve({ data: results(), error: null }).then(a, b) };
    return q;
  } };
  const admin = { from: (table: string) => { let head = false; const filters: ((r: any) => boolean)[] = [];
    const matches = () => (table === "claims" ? [claim] : []).filter((r) => filters.every((f) => f(r)));
    const q: any = { select: (_cols: string, opts?: any) => { head = !!opts?.head; return q; },
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; }, or: () => q, order: () => q,
      then: (a: any, b: any) => Promise.resolve({ data: head ? null : matches(), count: head ? matches().length : null, error: null }).then(a, b) }; return q; },
    rpc: async (name: string, args: any) => { rpcs.push({ name, args }); return { data: true, error: null }; } };
  const user = { id: "actual-user", role, name: "Synthetic agent", can: (key: string) => capable && key === "claims.status" };
  const mods: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, o: any = {}) => ({ body, status: o.status ?? 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => sb, supabaseAdmin: () => admin },
    "@/lib/gate": { gateUser: async () => user }, "@/lib/permissions": { isInternalRole: (r: string) => ["owner", "admin", "manager", "qa", "agent"].includes(r) },
    "@/lib/matter": matter, "@/lib/firm-delivery": { deliverLeadToFirm: async (x: any) => { sends.push(x); return { ok: true }; }, matterSendState: async () => ({ ok: true, state: { sentAt: null, result: null, legacy: false } }) },
    "@/lib/firm-delivery-dispatch": { readFirmDispatch: async () => ({ row: null, error: dispatchError }) },
    "@/lib/audit": { recordAudit: async (a: any) => { audits.push(a); } },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/firm-delivery/route.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {};
  new Function("require", "exports", js)((id: string) => { if (!(id in mods)) throw new Error(`unstubbed ${id}`); return mods[id]; }, exp);
  return { ...exp, sends, rpcs, audits };
}
let count = 0;
const t = async (name: string, fn: () => Promise<void>) => { await fn(); count++; console.log("ok", name); };
const req = (b: any) => ({ json: async () => ({ lead_id: leadId, claim_id: claimId, ...b }) });
(async () => {
  await t("agent with claims.status can manually deliver without intake.qa", async () => {
    const h = harness(); const r = await h.POST(req({})); assert.equal(r.status, 200); assert.equal(h.sends[0].claimId, claimId);
  });
  await t("missing caller-session lead never reaches privileged sender", async () => {
    const h = harness("agent", false); const r = await h.POST(req({})); assert.equal(r.status, 404); assert.equal(h.sends.length, 0);
  });
  await t("claims.status override and firm role both refuse manual delivery", async () => {
    for (const h of [harness("agent", true, false), harness("firm")]) { const r = await h.POST(req({})); assert.equal(r.status, 403); assert.equal(h.sends.length, 0); }
  });
  await t("agent cannot reconcile an uncertain provider result", async () => {
    const h = harness(); const r = await h.POST(req({ op: "reconcile", attempt_key: attemptKey, delivered: false, note: "Checked synthetic provider" }));
    assert.equal(r.status, 403); assert.equal(h.rpcs.length, 0); assert.equal(h.sends.length, 0);
  });
  await t("owner reconciliation binds authenticated actor and never sends email", async () => {
    const h = harness("owner"); const r = await h.POST(req({ op: "reconcile", attempt_key: attemptKey, delivered: false, note: "Checked synthetic provider", actor_id: "forged-user" }));
    assert.equal(r.status, 200); assert.equal(h.rpcs[0].args.p_actor_id, "actual-user"); assert.equal(h.sends.length, 0); assert.equal(h.audits.length, 1);
  });
  await t("missing dispatch migration is surfaced as error, not unsent/safe", async () => {
    const h = harness("owner", true, true, "table missing"); const r = await h.GET({ url: `https://synthetic.invalid/api/firm-delivery?lead_id=${leadId}&claim_id=${claimId}` });
    assert.equal(r.status, 500); assert.match(r.body.error, /table missing/);
  });
  await t("GET returns selected campaign recipient for visible confirmation", async () => {
    const h = harness(); const r = await h.GET({ url: `https://synthetic.invalid/api/firm-delivery?lead_id=${leadId}&claim_id=${claimId}` });
    assert.equal(r.status, 200); assert.equal(r.body.delivery.to, "firm@synthetic.invalid"); assert.equal(r.body.can_reconcile, false);
  });
  console.log(`${count} passed`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
