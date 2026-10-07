import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createHmac } from 'node:crypto';
import { FakeDb } from './test-fake-db';
import * as inbound from './resend-inbound';
import * as handoff from './netfly-handoff';

let db = new FakeDb({ webhook_events: [] });
let imported = 0;
const inbox = 'netfly@example.resend.app';
const secret = 'whsec_' + Buffer.from('NONBINDING synthetic webhook secret').toString('base64');
const initial = (): inbound.ReceivedEmail => ({ id: 'email-test', from: 'Brett <BCurry@turnbullfirm.com>', to: [inbox],
  subject: 'Fwd: New Signing - GA! Synthetic Client', text: 'Client: Synthetic Client', html: null,
  message_id: 'test-message', created_at: '2026-10-07T12:00:00Z', authentication: { dmarc: 'pass' } });
let email = initial();
process.env.NETFLY_RESEND_WEBHOOK_SECRET = secret;
process.env.NETFLY_RECEIVING_TO = inbox;
process.env.NETFLY_RESEND_API_KEY = 'synthetic-only';
delete process.env.NETFLY_EMAIL_FROM_DOMAINS;
delete process.env.NETFLY_EMAIL_FROM_ADDRESSES;
const code = fs.readFileSync(path.resolve(__dirname, '../app/api/webhooks/netfly-email/route.ts'), 'utf8');
const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modules: Record<string, any> = {
  'next/server': { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) } },
  '@/lib/supabase-server': { supabaseAdmin: () => db },
  '@/lib/resend-inbound': { ...inbound, resendGet: async () => email },
  '@/lib/netfly-handoff': handoff,
  '@/lib/netfly-email-import': {
    netflyEmailCampaign: async () => ({ firm_id: 'firm-tmp', id: 'netfly-campaign' }),
    importNetflyEmail: async (_db: any, scope: any, received: any) => {
      assert.equal(scope.firm_id, 'firm-tmp'); assert.equal(received.id, email.id);
      imported++; return { lead_id: 'synthetic-lead', claim_id: 'synthetic-claim', lead_no: 'TEST-1', partial: false, retry_required: false };
    },
  },
};
const route: any = {};
new Function('require', 'exports', compiled)((name: string) => {
  if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
  return modules[name];
}, route);
const reset = () => { db = new FakeDb({ webhook_events: [] }); email = initial(); imported = 0; delete process.env.NETFLY_EMAIL_FROM_ADDRESSES; };
const post = async (signed = true) => {
  const raw = JSON.stringify({ type: 'email.received', data: { email_id: email.id } });
  const stamp = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`msg_test.${stamp}.${raw}`).digest('base64');
  return route.POST(new Request('https://example.test/api/webhooks/netfly-email', { method: 'POST', body: raw,
    headers: { 'svix-id': 'msg_test', 'svix-timestamp': stamp, 'svix-signature': signed ? `v1,${sig}` : 'v1,invalid' } }));
};

async function main() {
  assert.equal((await post()).body.ok, true, 'the authorized individual forwarder imports');
  assert.equal(imported, 1);
  assert.equal(db.tables.webhook_events[0].status, 'received');
  assert.equal((await post()).body.already_saved, true);
  assert.equal(imported, 1, 'replaying a successful message cannot re-import');

  for (const sender of ['other@turnbullfirm.com', 'bcurry@turnbullfirm.com.attacker.test', 'a <bcurry@turnbullfirm.com>, b <attacker@example.test>']) {
    reset(); email.from = sender;
    const result = await post();
    assert.equal(result.status, 200); assert.equal(result.body.reason, 'unapproved_sender');
    assert.equal(imported, 0); assert.equal(db.tables.webhook_events.length, 1);
    assert.equal(db.tables.webhook_events[0].firm_id, 'firm-tmp');
    assert.equal(db.tables.webhook_events[0].status, 'failed', 'held mail is visible in the existing status UI');
    assert.match(db.tables.webhook_events[0].error, /forwarding address is not approved/);
    assert.ok(!JSON.stringify(db.tables.webhook_events).includes('Client:'));
    await post(); assert.equal(db.tables.webhook_events.length, 1, 'held replay updates its same receipt');
  }
  reset(); process.env.NETFLY_EMAIL_FROM_ADDRESSES = '';
  assert.equal((await post()).body.reason, 'unapproved_sender', 'owner can disable the default individual forwarder');
  process.env.NETFLY_EMAIL_FROM_ADDRESSES = '  BCURRY@turnbullfirm.com  ';
  assert.equal((await post()).body.ok, true);
  assert.equal(db.tables.webhook_events.length, 1); assert.equal(db.tables.webhook_events[0].status, 'received');
  assert.equal(db.tables.webhook_events[0].error, null, 'successful retry clears the prior hold');

  for (const result of [undefined, 'fail', 'unknown', 'gray']) {
    reset(); email.authentication = result ? { dmarc: result } : undefined;
    email.headers = { 'authentication-results': 'amazonses.com; dmarc=pass header.from=turnbullfirm.com;' };
    assert.equal((await post()).status, 503);
    assert.equal(imported, 0, 'forged message headers cannot replace provider-computed authentication');
  }
  reset(); email.to = ['different@example.resend.app'];
  assert.equal((await post()).body.reason, 'different_recipient');
  assert.equal(imported, 0); assert.equal(db.tables.webhook_events.length, 0, 'another inbox is not surfaced to this firm');
  reset(); assert.equal((await post(false)).status, 401); assert.equal(imported, 0); assert.equal(db.ops.length, 0);
  reset(); email.from = 'unapproved@example.test';
  db.failOn = op => op.table === 'webhook_events' && op.kind === 'insert' ? 'database unavailable' : null;
  assert.equal((await post()).status, 503, 'a missing hold receipt is a retryable failure');
  assert.equal(imported, 0);
  console.log('NETFLY forwarded email route: sender, DMARC, webhook authentication, visible holds, retry and isolation passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
