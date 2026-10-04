// Actual route, synthetic matter and provider. This test never sends a text.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { toE164 } from "../justcall-send";
import { normPhone } from "../comms";
import { rehearsalRecipientAllowed } from './rehearsal';

globalThis.fetch = async () => { throw Error("Network forbidden"); };
function harness(change: Record<string, any> = {}) {
  const row = { id: "agreement", firm_id: "firm", phone: "2025550100", via: "Text", sign_url: "https://sign.example.invalid/current", status: "sent", ...change.row };
  const sent: any[] = [], logged: any[] = [], audits: any[] = [];
  const db = { from(table: string) {
    if (table === "firms") return { select: () => ({ eq: (_key: string, value: string) => { assert.equal(value, "firm"); return { maybeSingle: async () => ({ data: { name: "Synthetic Firm" } }) }; } }) };
    assert.equal(table, "communications");
    return { insert: async (data: any) => { logged.push(data); return { error: change.logFailure ? { message: "Storage unavailable" } : null }; } };
  } };
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => db },
    "@/lib/mva-call/server": { requireStaff: async () => change.unauthorized ? null : ({ id: "agent", name: "Synthetic Agent" }), firmSpoken: (s: string) => s },
    "@/lib/justcall-send": { toE164, sendJustCallSms: async (sms: any) => { sent.push(sms); return change.providerFailure ? { ok: false, error: "Provider rejected this number" } : { ok: true }; } },
    "@/lib/comms": { normPhone },
    "@/lib/mva-call/rehearsal": { rehearsalRecipientAllowed, readRehearsal: async () => {
      if (change.rehearsalReadFailure) throw Error('Rehearsal read failed');
      return change.rehearsal ? { version: 1, phone: '+12025550100', emails: [] } : null;
    } },
    "@/lib/audit": { recordAudit: async (data: any) => audits.push(data) },
    "@/lib/mva-call/send-attempt": { SEND_HELD_MESSAGE: "Send held", readPendingSendAttempt: async () => change.reservationFailure ? { ok: false, status: 503, error: "Could not verify reservation" } : { ok: true, attempt: change.held ? { id: "pending" } : null } },
    "@/lib/mva-call/signing-matter": {
      resolveSigningMatter: async (_db: any, lead: string, opts: any) => {
        assert.equal(lead, "lead"); assert.equal(opts.claimId, "matter");
        return change.forbidden ? { ok: false, status: 403, error: "Matter unavailable" } : { ok: true, lead: { id: lead, perm_text: change.optOut ? false : true }, matter: { claim: { id: "matter" } } };
      },
      getMatterAgreement: async (_db: any, _lead: any, _matter: any, id: string) => {
        assert.equal(id, "agreement");
        return change.stale ? { ok: false, status: 409, error: "Stale agreement" } : { ok: true, row };
      }, agreementIsVoided: (value: any) => !!value.voided_at,
    },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../../app/api/calls/esign/resend/route.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const route: any = {};
  new Function("require", "exports", code)((id: string) => { assert.ok(id in modules, `Unexpected module ${id}`); return modules[id]; }, route);
  return { row, sent, logged, audits, post: (body = {}) => route.POST({ json: async () => ({ lead_id: "lead", claim_id: "matter", agreement_id: "agreement", ...body }) }) };
}

async function main() {
  process.env.JUSTCALL_DEFAULT_FROM = "+12025550199";
  const old = harness(), a = await old.post();
  assert.equal(a.status, 200); assert.equal(old.sent[0].to, "+12025550100"); assert.ok(old.sent[0].body.includes(old.row.sign_url));
  const alt = harness(), b = await alt.post({ phone: "(202) 555-0101", recipient_confirmed: true });
  assert.equal(b.status, 200); assert.equal(b.body.phone, "+12025550101"); assert.equal(alt.logged[0].phone_raw, "+12025550101");
  assert.equal(alt.audits[0].meta.alternate_recipient, true); assert.equal(alt.row.phone, "2025550100"); assert.ok(alt.sent[0].body.endsWith(alt.row.sign_url));
  for (const body of [{ phone: "" }, { phone: "123" }, { phone: "2025550101" }, { phone: "2025550101", recipient_confirmed: "true" }]) {
    const h = harness(); assert.equal((await h.post(body)).status, 400); assert.equal(h.sent.length, 0);
  }
  const email = harness({ row: { via: "Email" } });
  assert.equal((await email.post()).status, 400);
  assert.equal((await email.post({ phone: "2025550102", recipient_confirmed: true })).status, 200);
  for (const change of [{ unauthorized: true }, { forbidden: true }, { stale: true }, { held: true }, { reservationFailure: true }, { optOut: true }, { row: { status: "signed" } }, { row: { status: "completed" } }, { row: { voided_at: "2026-10-01" } }, { row: { sign_url: "" } }]) {
    const h = harness(change); assert.ok((await h.post({ phone: "2025550101", recipient_confirmed: true })).status >= 400); assert.equal(h.sent.length, 0);
  }
  const fail = harness({ providerFailure: true }); assert.equal((await fail.post()).status, 502); assert.equal(fail.logged.length, 0); assert.equal(fail.audits.length, 0);
  const rehearsal = harness({ rehearsal: true });
  assert.equal((await rehearsal.post({ phone: '2025550101', recipient_confirmed: true })).status, 409);
  assert.equal(rehearsal.sent.length, 0);
  assert.equal((await rehearsal.post()).status, 200);
  assert.match(rehearsal.sent[0].body, /NONBINDING TEST/);
  const unreadable = harness({ rehearsalReadFailure: true });
  assert.equal((await unreadable.post()).status, 503); assert.equal(unreadable.sent.length, 0);
  const logging = harness({ logFailure: true }), success = await logging.post(); assert.equal(success.body.ok, true); assert.match(success.body.warning, /text was sent/); assert.equal(logging.sent.length, 1);
  console.log("20 same-link resend, alternate recipient, authorization and failure scenarios passed");
}
main().catch((cause) => { console.error(cause); process.exitCode = 1; });
