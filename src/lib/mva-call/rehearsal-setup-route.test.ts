import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from '../test-fake-db';
import * as rehearsal from './rehearsal';
import { toE164 } from '../justcall-send';

globalThis.fetch = async () => { throw Error('Network forbidden'); };
function harness(change: Record<string, any> = {}) {
  const db = new FakeDb({
    campaigns: [{ id: 'campaign', name: 'INNO MVA', firm_id: 'firm', case_type: 'mva' }],
    firms: [{ id: 'firm', slug: 'tmp' }],
    leads: [{ id: '11111111-1111-4111-8111-111111111111', firm_id: 'firm', campaign_id: 'campaign', claimant_name: 'TEST Driver', vendor_fields: null, ...change.lead }],
    esign_submissions: change.prior ? [{ id: 'signed', lead_id: '11111111-1111-4111-8111-111111111111', firm_id: 'firm' }] : [],
  });
  if (change.child) db.tables.leads.push({ id: 'child', firm_id: 'firm', external_id: '11111111-1111-4111-8111-111111111111:pax:friend' });
  const from = db.from.bind(db);
  db.from = (table: string) => {
    const q: any = from(table);
    q.like = (key: string, value: string) => q.in(key, (db.tables[table] || []).filter(r => String(r[key] || '').startsWith(value.slice(0, -1))).map(r => r[key]));
    return q;
  };
  if (change.readFailure) db.failOn = op => op.table === 'esign_submissions' ? 'Read failed' : null;
  if (change.writeFailure) db.failOn = op => op.kind === 'update' ? 'Write failed' : null;
  const templates: any[] = [];
  const modules: Record<string, any> = {
    'next/server': { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
    '@/lib/supabase-server': { supabaseServer: async () => db, supabaseAdmin: () => db },
    '@/lib/mva-call/server': { requireStaff: async () => ({ id: 'owner-id', name: 'Owner', role: change.role || 'owner' }) },
    '@/lib/docuseal': { docusealConfigured: () => true },
    '@/lib/mva-call/esign': { packetsFor: () => ({ OTHER: { name: 'real OTHER' } }), templateFor: async (_db: any, opts: any) => {
      templates.push(opts); return change.providerFailure ? { ok: false, error: 'Provider unavailable' } : { ok: true, templateId: 'synthetic-template', made: true };
    } },
    '@/lib/mva-call/rehearsal': rehearsal,
    '@/lib/justcall-send': { toE164 },
    '@/lib/audit': { recordAudit: async () => {} },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../app/api/calls/esign-setup/route.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const route: any = {};
  new Function('require', 'exports', code)((id: string) => { assert(id in modules, id); return modules[id]; }, route);
  return { db, templates, post: (body: any = {}) => route.POST({ url: 'https://claimreach.example.invalid/api/calls/esign-setup', json: async () => ({ campaign_id: 'campaign',
    rehearsal_lead_id: '11111111-1111-4111-8111-111111111111', rehearsal_phone: '2025550100', rehearsal_emails: 'owner@example.test', ...body }) }) };
}
async function main() {
  for (const role of ['agent', 'team_lead', 'firm']) {
    const h = harness({ role }); assert.equal((await h.post()).status, 403); assert.equal(h.templates.length, 0);
    assert.equal(h.db.ops.filter(o => o.kind !== 'select').length, 0);
  }
  for (const change of [{ prior: true }, { child: true }, { readFailure: true }, { writeFailure: true },
    { lead: { claimant_name: 'Real Client' } }, { lead: { archived_at: '2026-10-01' } }, { lead: { firm_id: 'foreign' } }, { lead: { campaign_id: 'foreign' } }]) {
    const h = harness(change); assert((await h.post()).status >= 400); assert.equal(h.templates.length, 0);
  }
  for (const body of [{ rehearsal_phone: '' }, { rehearsal_emails: '' }, { rehearsal_emails: 'bad' }]) {
    const h = harness(); assert.equal((await h.post(body)).status, 400); assert.equal(h.templates.length, 0);
  }
  const h = harness(), result = await h.post();
  assert.equal(result.status, 200); assert.equal(result.body.test_only, true);
  assert.equal(h.templates[0].key, rehearsal.rehearsalKey(h.db.tables.leads[0].id));
  assert.equal(h.templates[0].packet.name, rehearsal.REHEARSAL_PACKET.name);
  assert.equal(h.db.tables.leads[0].source_key, 'test_lead');
  assert.equal(h.db.tables.leads[0].vendor_fields.signing_rehearsal.phone, '+12025550100');
  const normal = harness(); assert.equal((await normal.post({ rehearsal_lead_id: undefined })).status, 200);
  assert.equal(normal.templates[0].key, 'OTHER'); assert.equal(normal.templates[0].packet.name, 'real OTHER');
  const fail = harness({ providerFailure: true }); assert.equal((await fail.post()).status, 424);
  console.log('Owner-only setup, fresh synthetic file, tenant scope, contact validation and provider failure scenarios passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
