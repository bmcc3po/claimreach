import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';
import * as recovery from './lawruler-recovery';
import * as apply from './lawruler-recovery-apply';
import * as originals from './lawruler-documents';
import * as ingest from './lead-ingest';
import * as lrStatus from './lawruler-status';
import * as status from './claim-status';
import * as address from './us-address';
import * as m6 from './m6';
import * as webhooks from './webhooks';
import * as standard from './standard-fields';
import * as mvaSync from './lawruler-mva-sync';
import * as netflySync from './lawruler-netfly';
import * as netflyOntake from './netfly-ontake';
import { DEFAULT_STATUSES } from './statuses';
const F = '11111111-1111-4111-8111-111111111111', L = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
function harness(route: string, role = 'owner') {
  const database = new FakeDb({ leads: [{ id: L, firm_id: F, external_id: '264972', source_system: 'lawruler', archived_at: null, vendor_fields: { lawruler_status: 'Needs review' } }],
    claims: [{ id: C, firm_id: F, lead_id: L, campaign_id: 'mva', claim_type: 'mva', status: 'new' }],
    campaigns: [{ id: 'mva', name: 'TMP MVA', active: true, firm_id: F, case_type: 'mva', firms: { slug: 'tmp' } }], lead_activity: [], case_documents: [], webhook_events: [] });
  const contactUpserts: any[] = [];
  const query = database.from.bind(database);
  database.from = ((table: string) => {
    const q: any = query(table);
    q.upsert = async (rows: any, options: any) => { if (table === 'contact_points') contactUpserts.push({ rows, options }); return { error: null }; };
    return q;
  }) as any;
  const statusWrites: any[] = [], ingestOptions: any[] = [];
  let adminCalls = 0, ingests = 0;
  const mods: Record<string, any> = {
    'next/server': { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
    '@/lib/supabase-server': { supabaseServer: async () => ({}), supabaseAdmin: () => { adminCalls++; return database; } },
    '@/lib/mva-call/server': { requireStaff: async () => role === 'none' ? null : { id: 'synthetic-owner', role: role === 'owner-denied' ? 'owner' : role, can: (key: string) => !(role === 'owner-denied' && key === 'claims.status') } },
    '@/lib/lawruler-recovery': recovery, '@/lib/lawruler-recovery-apply': apply, '@/lib/lawruler-documents': originals, '@/lib/lawruler-mva-sync': mvaSync,
    '@/lib/lawruler-netfly': netflySync, '@/lib/netfly-ontake': netflyOntake,
    '@/lib/lead-ingest': { ...ingest, ingestLead: async (_db: any, options: any) => { ingests++; ingestOptions.push(options); return { ok: true, lead_id: L, lead_no: 'TEST-1' }; } },
    '@/lib/lawruler-status': lrStatus, '@/lib/claim-status': { ...status, setClaimStatusForLeads: async (options: any) => { statusWrites.push(options); return { ok: true }; } }, '@/lib/us-address': address, '@/lib/m6': m6, '@/lib/webhooks': webhooks,
  };
  const code = fs.readFileSync(path.resolve(__dirname, '../app/api/webhooks/lawruler', route, 'route.ts'), 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {}; new Function('require', 'exports', 'process', js)((id: string) => { if (!(id in mods)) throw new Error(`Unstubbed module ${id}`); return mods[id]; }, exp, { env: { LAWRULER_WEBHOOK_SECRET: 'offline-secret' } });
  return { ...exp, database, contactUpserts, statusWrites, ingestOptions, adminCalls: () => adminCalls, ingests: () => ingests };
}
const req = (payload: any, headers: Record<string, string> = {}) => new Request('https://synthetic.invalid/api/webhooks/lawruler', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lr-secret': 'offline-secret', ...headers }, body: JSON.stringify(payload) });
function innoHarness() {
  const h = harness(''); h.database.tables.campaigns[0].name = 'INNO MVA';
  h.database.tables.leads[0].case_type = 'mva'; h.database.tables.claims[0].answers = {};
  h.database.tables.statuses = DEFAULT_STATUSES.map(s => ({ ...s }));
  h.database.tables.lawruler_aliases = [{ alias: 'Signed e-Sign (Default)', status_key: 'signed_grievous' }, { alias: 'Disqualified (Default)', status_key: 'dq' }, { alias: 'New Lead (Default)', status_key: 'new' }];
  h.database.tables.dq_reasons = [{ key: 'criteria', active: true }];
  return h;
}
let count = 0; const t = async (name: string, fn: () => Promise<void>) => { await fn(); count++; console.log('ok', name); };
(async () => {
  await t('unauthorized request never reads body or creates privileged logger/client', async () => {
    const h = harness(''); const r = await h.POST({ headers: new Headers({ 'x-lr-secret': 'wrong' }), get body() { throw new Error('Body accessed before authentication'); } });
    assert.equal(r.status, 401); assert.equal(h.adminCalls(), 0); assert.equal(h.database.ops.length, 0);
  });
  await t('bounded/invalid parsing rejects before privileged logging', async () => {
    for (const request of [req({}, { 'content-length': String(originals.LR_MAX_BODY_BYTES + 1) }), req([])]) {
      const h = harness(''); const r = await h.POST(request); assert.equal(r.status, 400); assert.equal(h.adminCalls(), 0);
    }
    const h = harness(''); const r = await h.POST(new Request('https://synthetic.invalid', { method: 'POST', headers: { 'x-lr-secret': 'offline-secret' }, body: 'broken JSON' }));
    assert.equal(r.status, 400); assert.equal(h.adminCalls(), 0);
  });
  await t('remote attachment URL is refused without fetch, logging or ingestion', async () => {
    const h = harness(''); const r = await h.POST(req({ LeadID: '264972', CaseType: 'TMP MVA', retainer_url: 'http://127.0.0.1/private' }));
    assert.equal(r.status, 422); assert.equal(h.adminCalls(), 0); assert.equal(h.ingests(), 0);
  });
  await t('duplicate source IDs and same-campaign sibling ambiguity stop before ingest', async () => {
    const a = harness(''); a.database.tables.leads.push({ ...a.database.tables.leads[0], id: 'duplicate' });
    const b = harness(''); b.database.tables.claims.push({ ...b.database.tables.claims[0], id: 'sibling' });
    for (const h of [a, b]) { const r = await h.POST(req({ LeadID: '264972', CaseType: 'TMP MVA' })); assert.equal(r.status, 409); assert.equal(h.ingests(), 0); }
  });
  await t('phone-only collision cannot attach a new LR identity to existing person', async () => {
    const h = harness(''); Object.assign(h.database.tables.leads[0], { external_id: '999', campaign_id: 'mva', phone_norm: '2025550123', created_at: new Date().toISOString() });
    const r = await h.POST(req({ LeadID: '264972', CaseType: 'TMP MVA', Phone: '2025550123' }));
    assert.equal(r.status, 409); assert.equal(h.ingests(), 0);
  });
  await t('valid MVA hook saves exact source snapshot and review-required status, no signature fabrication', async () => {
    const h = harness(''); const r = await h.POST(req({ LeadID: '264972', CaseType: 'TMP MVA', Status: 'Legacy signed', 'Signed Contracts Received': 'Yes' }));
    assert.equal(r.status, 200); assert.equal(h.ingests(), 1); assert.equal(r.body.claim_id, C); assert.equal(r.body.status_reconciliation, 'review_required');
    assert.equal(h.database.tables.lead_activity[0].meta.claim_id, C); assert.equal(h.database.tables.claims[0].status, 'new'); assert.equal(h.database.tables.esign_agreements, undefined);
  });
  await t('NETFLY LawRuler transfer saves partial source, then completes with the original PDF and unchanged note', async () => {
    assert.equal(netflySync.netflyHandoffNote({ NetflyHandoffNote: '{{default27}}-Case Description' }), '');
    assert.equal(netflySync.netflyHandoffNote({ NetflyHandoffNote: '{{default27}}-Case Description', Summary: 'Client/Driver: Synthetic Person' }), 'Client/Driver: Synthetic Person');
    assert.equal(ingest.normalizeLead({ Summary: 'Client/Driver: Synthetic Person' }).description, 'Client/Driver: Synthetic Person');
    const h = harness('');
    Object.assign(h.database.tables.campaigns[0], { name: 'NETFLY ONTAKE', path: 'secondary', esign_required: false });
    Object.assign(h.database.tables.leads[0], { external_id: 'other-source', campaign_id: 'mva', case_type: 'mva' });
    Object.assign(h.database.tables.claims[0], { answers: {}, updated_at: '2026-09-30T00:00:00.000Z' });
    const missing = await h.POST(req({ LeadID: '264972', CaseType: 'NETFLY ONTAKE', FirstName: 'Synthetic', LastName: 'Person' }));
    assert.equal(missing.status, 200, JSON.stringify(missing.body));
    assert.equal(missing.body.partial, true);
    assert.deepEqual(missing.body.missing_source, ['handoff_note', 'signed_retainer_pdf']);
    assert.equal(missing.body.attachments_complete, false);
    assert.equal(h.ingests(), 1);
    assert.equal(h.database.tables.claims[0].status, 'new');
    const objects = new Map<string, ArrayBuffer>();
    (h.database as any).storage = { from: () => ({
      upload: async (path: string, bytes: ArrayBuffer) => { if (objects.has(path)) return { error: { message: 'already exists', statusCode: '409' } }; objects.set(path, bytes); return { error: null }; },
      download: async (path: string) => ({ data: objects.has(path) ? new Blob([objects.get(path)!]) : null, error: null }),
    }) };
    const note = 'Client/Driver: Synthetic Person\nAccident Date: 09/04/2026\nAccident Summary: Rear ended while stopped.';
    const noteOnly = await h.POST(req({ LeadID: '264972', CaseType: 'NETFLY ONTAKE', FirstName: 'Synthetic', LastName: 'Person', Summary: note }));
    assert.equal(noteOnly.status, 200, JSON.stringify(noteOnly.body));
    assert.deepEqual(noteOnly.body.missing_source, ['signed_retainer_pdf']);
    assert.equal(noteOnly.body.attachments_complete, false);
    const send = () => { const form = new FormData();
      form.set('LeadID', '264972'); form.set('CaseType', 'NETFLY ONTAKE');
      form.set('FirstName', 'Synthetic'); form.set('LastName', 'Person'); form.set('NetflyHandoffNote', note);
      // DocuSeal's number in the filename is a submission ID, not LawRuler's LeadID.
      form.set('retainer', new Blob([`%PDF-1.4\n${'synthetic evidence '.repeat(8)}\n%%EOF`], { type: 'application/pdf' }), 'signed-11738202.pdf');
      return new Request('https://synthetic.invalid/api/webhooks/lawruler', { method: 'POST', headers: { 'x-lr-secret': 'offline-secret' }, body: form }); };
    const first = await h.POST(send());
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(h.ingestOptions[0].historical, true);
    assert.equal(h.ingestOptions[0].holdOutreach, true);
    assert.equal(h.database.tables.leads[0].perm_text, false);
    assert.equal(h.database.tables.case_documents[0].doc_type, 'netfly_signed_retainer');
    assert.equal(h.ingestOptions[0].lead.phone, null);
    assert.equal(h.database.tables.claims[0].answers.netfly_secondary.handoffs[0].note, note);
    assert.equal(h.database.tables.claims[0].status, 'new');
    assert.equal(first.body.communications_triggered, false);
    assert.equal(first.body.partial, false);
    assert.equal(first.body.attachments_complete, true);
    const retry = await h.POST(send());
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(h.database.tables.case_documents.length, 1);
    assert.equal(h.database.tables.claims[0].answers.netfly_secondary.handoffs.length, 1);
  });
  await t('conflicting NETFLY and Motel campaign markers cannot cross-route a transfer', async () => {
    const h = harness('');
    const r = await h.POST(req({ LeadID: '264972', CaseType: 'NETFLY ONTAKE', campaign: 'motel6' }));
    assert.equal(r.status, 422);
    assert.equal(h.ingests(), 0);
    assert.equal(h.database.ops.length, 0);
  });
  await t('actual INNO orchestrator holds vendor-reported signing for evidence review without acquisition fanout', async () => {
    const h = innoHarness(); const r = await h.POST(req({ LeadID: '264972', CaseType: 'INNO MVA', Status: 'Signed e-Sign' }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.status_reconciliation, 'review_required');
    assert.equal(h.database.tables.claims[0].status, 'external_signed_review'); assert.equal(h.ingestOptions[0].historical, true);
    assert.equal(r.body.intake.outcome, 'not_supplied'); assert.equal(r.body.documents.outcome, 'not_supplied');
    assert.equal(r.body.communications_triggered, false); assert.equal(h.database.tables.esign_submissions, undefined);
    assert.equal(h.database.tables.leads[0].signed_at, undefined);
    assert.ok(h.database.tables.lead_activity.some((a: any) => a.meta?.event === 'mva_sync_result' && a.meta.claim_id === C));
  });
  await t('INNO DQ without configured reason stays visibly held; explicit active reason applies exact DQ', async () => {
    for (const reason of [undefined, 'criteria']) {
      const h = innoHarness(); const r = await h.POST(req({ LeadID: '264972', CaseType: 'INNO MVA', Status: 'Disqualified', ...(reason ? { dq_reason_key: reason } : {}) }));
      assert.equal(r.status, 200); assert.equal(r.body.reconciliation.acquisition_hold, true);
      assert.equal(r.body.status_reconciliation, reason ? 'applied' : 'review_required'); assert.equal(h.database.tables.claims[0].status, reason ? 'dq' : 'external_dq_review');
    }
  });
  await t('INNO historical source stages answers and originals but never applies live status or acquisition fanout', async () => {
    const h = innoHarness(); const r = await h.POST(req({ LeadID: '264972', CaseType: 'INNO MVA', Status: 'Signed e-Sign', Custom4121: 'Driver', recovery_mode: 'historical' }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(h.ingestOptions[0].historical, true); assert.equal(r.body.communications_triggered, false);
    assert.equal(h.database.tables.claims[0].status, 'new'); assert.equal(r.body.status_reconciliation, 'review_required');
    assert.equal(r.body.intake.outcome, 'review_required'); assert.equal(h.database.tables.claims[0].answers.mva_call?.story?.seat, undefined);
    assert.equal(h.database.tables.claims[0].answers.lawruler_presign.evidence.Custom4121.raw, 'Driver');
  });
  await t('INNO remote original URL is never fetched and leaves source signing in evidence review', async () => {
    const h = innoHarness(); const r = await h.POST(req({ LeadID: '264972', CaseType: 'INNO MVA', Status: 'Signed e-Sign', retainer_url: 'https://private.invalid/retainer.pdf' }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.status_reconciliation, 'review_required'); assert.equal(r.body.documents.outcome, 'pending');
    assert.equal(r.body.attachments_complete, false); assert.equal(h.database.tables.claims[0].status, 'external_signed_review'); assert.equal(h.database.tables.case_documents.length, 0);
  });
  await t('invalid or unbound binary original is reviewable without undoing the INNO evidence hold', async () => {
    for (const [name, bytes] of [['Retainer.pdf', '%PDF-1.4\nsynthetic\n%%EOF'], ['264972-Retainer.pdf', 'not a complete PDF']]) {
      const h = innoHarness(); const form = new FormData(); form.set('LeadID', '264972'); form.set('CaseType', 'INNO MVA'); form.set('Status', 'Signed e-Sign');
      form.set('file', new Blob([bytes], { type: 'application/pdf' }), name);
      const r = await h.POST(new Request('https://synthetic.invalid', { method: 'POST', headers: { 'x-lr-secret': 'offline-secret' }, body: form }));
      assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.status_reconciliation, 'review_required'); assert.equal(r.body.documents.outcome, 'pending'); assert.equal(r.body.attachments_complete, false);
      assert.equal(h.database.tables.claims[0].status, 'external_signed_review'); assert.equal(h.database.tables.case_documents.length, 0);
    }
  });
  await t('INNO intake write failure returns retryable response after evidence hold, and same source retry repairs intake', async () => {
    const h = innoHarness(); let fail = true;
    h.database.failOn = (op: any) => fail && op.table === 'claims' && op.kind === 'update' && op.patch?.answers ? 'intake storage offline' : null;
    const payload = { LeadID: '264972', CaseType: 'INNO MVA', Status: 'Signed e-Sign', Custom4121: 'Driver' };
    const first = await h.POST(req(payload)); assert.equal(first.status, 500, JSON.stringify(first.body)); assert.equal(first.body.ok, false);
    assert.equal(first.body.status_reconciliation, 'review_required'); assert.equal(first.body.intake.outcome, 'failed'); assert.equal(first.body.intake.retry_required, true); assert.equal(h.database.tables.claims[0].status, 'external_signed_review');
    fail = false; const retry = await h.POST(req(payload)); assert.equal(retry.status, 200, JSON.stringify(retry.body)); assert.equal(retry.body.status_reconciliation, 'review_required');
    assert.equal(h.database.tables.claims[0].answers.mva_call.story.seat, 'Driver'); assert.equal(h.database.tables.claims.length, 1);
  });
  await t('INNO partial original storage failure preserves first artifact, returns retry, and same source repairs remaining file', async () => {
    const h = innoHarness(), objects = new Map<string, ArrayBuffer>(); let failSecond = true;
    (h.database as any).storage = { from: () => ({
      upload: async (key: string, bytes: ArrayBuffer) => {
        if (failSecond && new TextDecoder().decode(bytes).includes('second original')) return { error: { message: 'synthetic storage unavailable', statusCode: '503' } };
        if (objects.has(key)) return { error: { message: 'already exists', statusCode: '409' } };
        objects.set(key, bytes.slice(0)); return { error: null };
      }, download: async (key: string) => ({ data: objects.has(key) ? new Blob([objects.get(key)!]) : null, error: null }),
    }) };
    const request = () => {
      const form = new FormData(); form.set('LeadID', '264972'); form.set('CaseType', 'INNO MVA'); form.set('Status', 'Signed e-Sign');
      form.set('retainer', new Blob(['%PDF-1.4\nfirst original\n%%EOF']), '264972-Retainer.pdf');
      form.set('intake', new Blob(['%PDF-1.4\nsecond original\n%%EOF']), '264972-IntakeForm.pdf');
      return new Request('https://synthetic.invalid', { method: 'POST', headers: { 'x-lr-secret': 'offline-secret' }, body: form });
    };
    const first = await h.POST(request()); assert.equal(first.status, 500, JSON.stringify(first.body)); assert.equal(first.body.retry_required, true); assert.equal(first.body.documents.retry_required, true);
    assert.equal(first.body.documents.stored, 1); assert.equal(first.body.originals.length, 1); assert.equal(h.database.tables.case_documents.length, 1); assert.equal(h.database.tables.claims[0].status, 'external_signed_review');
    failSecond = false; const retry = await h.POST(request());
    assert.equal(retry.status, 200, JSON.stringify(retry.body)); assert.equal(retry.body.documents.outcome, 'stored'); assert.equal(retry.body.originals.length, 2); assert.equal(retry.body.originals[0].duplicate, true);
    assert.equal(objects.size, 2); assert.equal(h.database.tables.case_documents.length, 2); assert.equal(h.database.tables.lead_activity.filter((a: any) => a.meta?.event === 'original_document').length, 2);
  });
  await t('INNO invalid original does not prevent a separate valid original from being preserved', async () => {
    const h = innoHarness(), objects = new Map<string, ArrayBuffer>();
    (h.database as any).storage = { from: () => ({ upload: async (key: string, bytes: ArrayBuffer) => { objects.set(key, bytes); return { error: null }; } }) };
    const form = new FormData(); form.set('LeadID', '264972'); form.set('CaseType', 'INNO MVA'); form.set('Status', 'Signed e-Sign');
    form.set('bad', new Blob(['not PDF']), '264972-Bad.pdf'); form.set('good', new Blob(['%PDF-1.4\nvalid original\n%%EOF']), '264972-Retainer.pdf');
    const r = await h.POST(new Request('https://synthetic.invalid', { method: 'POST', headers: { 'x-lr-secret': 'offline-secret' }, body: form }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.documents.outcome, 'pending'); assert.equal(r.body.documents.retry_required, false); assert.equal(r.body.documents.stored, 1);
    assert.equal(r.body.attachments_complete, false); assert.equal(objects.size, 1); assert.equal(h.database.tables.case_documents[0].doc_type, 'retainer'); assert.equal(h.database.tables.claims[0].status, 'external_signed_review');
  });
  await t('INNO status reconciliation evidence failure never reports full success', async () => {
    const h = innoHarness(); h.database.failOn = (op: any) => op.table === 'lead_activity' && op.kind === 'insert' && op.patch?.meta?.event === 'mva_sync_result' ? 'result log offline' : null;
    const r = await h.POST(req({ LeadID: '264972', CaseType: 'INNO MVA', Status: 'Signed e-Sign' }));
    assert.equal(r.status, 500); assert.equal(r.body.retry_required, true); assert.match(r.body.error, /result log offline/); assert.equal(h.database.tables.claims[0].status, 'external_signed_review');
  });
  await t('ordinary INNO New Lead retains existing new-lead ingest behavior; other MVA campaign remains review-only', async () => {
    const fresh = innoHarness(); const r = await fresh.POST(req({ LeadID: '264972', CaseType: 'INNO MVA', Status: 'New Lead' }));
    assert.equal(r.status, 200); assert.equal(fresh.ingestOptions[0].historical, false); assert.equal(r.body.status_reconciliation, 'unchanged');
    const other = harness(''); const old = await other.POST(req({ LeadID: '264972', CaseType: 'TMP MVA', Status: 'Signed e-Sign' }));
    assert.equal(old.status, 200); assert.equal(old.body.status_reconciliation, 'review_required'); assert.equal(other.database.tables.claims[0].status, 'new'); assert.equal(old.body.intake, undefined);
  });
  await t('multipart originals reach exact-matter storage for both MVA and legacy Motel', async () => {
    for (const motel of [false, true]) {
      const h = harness(''); const objects = new Map<string, ArrayBuffer>();
      (h.database as any).storage = { from: () => ({ upload: async (key: string, bytes: ArrayBuffer) => { objects.set(key, bytes); return { error: null }; } }) };
      if (motel) {
        Object.assign(h.database.tables.claims[0], { campaign_id: null, campaign: 'motel6', claim_type: 'motel_trafficking' });
        h.database.tables.retention_settings = [{ campaign: 'motel6', firm_id: F }];
      }
      const form = new FormData();
      if (motel) { form.set('campaign', 'motel6'); form.set('leadid', '264972'); }
      else { form.set('LeadID', '264972'); form.set('CaseType', 'TMP MVA'); }
      form.set('file', new Blob(['%PDF-1.4\nSynthetic original\n%%EOF'], { type: 'application/pdf' }), '264972-Tester-IntakeForm.pdf');
      const r = await h.POST(new Request('https://synthetic.invalid/api/webhooks/lawruler', { method: 'POST', headers: { 'x-lr-secret': 'offline-secret' }, body: form }));
      assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(objects.size, 1);
      assert.equal(h.database.tables.case_documents[0].claim_id, C); assert.equal(h.database.tables.case_documents[0].firm_id, F);
      assert.equal(h.database.tables.case_documents[0].doc_type, motel ? 'secondary_interview' : 'intake');
      assert.equal(h.database.tables.lead_activity.filter((a: any) => a.meta?.event === 'original_document').length, 1);
    }
  });
  await t('historical Motel marker preserves source but skips mapped status and LOR processing; live behavior remains', async () => {
    for (const historical of [true, false]) {
      const h = harness(''); Object.assign(h.database.tables.claims[0], { campaign_id: null, campaign: 'motel6', claim_type: 'motel_trafficking' });
      h.database.tables.retention_settings = [{ campaign: 'motel6', firm_id: F }];
      const r = await h.POST(req({ leadid: '264972', campaign: 'motel6', status: 'Secondary OK Sent To Firm', lor_status: 'ready', ...(historical ? { recovery_mode: 'historical' } : {}) }));
      assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(h.statusWrites.length, historical ? 0 : 1);
      assert.equal(h.database.ops.some((o: any) => o.table === 'lead_lor'), !historical);
      assert.equal(h.database.tables.lead_activity.find((a: any) => a.meta?.event === 'source_snapshot').meta.status, 'Secondary OK Sent To Firm');
      if (historical) { assert.equal(r.body.status_reconciliation, 'review_required'); assert.equal(r.body.communications_triggered, false); }
    }
  });
  await t('App historical marker reaches shared ingest; invalid marker is refused before privileged work', async () => {
    const h = harness(''); const r = await h.POST(req({ LeadID: '264972', CaseType: 'TMP MVA', recovery_mode: 'historical' }));
    assert.equal(r.status, 200); assert.equal(h.ingestOptions[0].historical, true); assert.equal(r.body.communications_triggered, false);
    const invalid = harness(''); assert.equal((await invalid.POST(req({ recovery_mode: 'historial' }))).status, 400); assert.equal(invalid.adminCalls(), 0);
  });
  await t('actual shared ingest suppresses new-lead event and unmatched-comms work only for historical recovery', async () => {
    for (const historical of [true, false]) {
      let events = 0, reconciles = 0;
      const mods: Record<string, any> = { '@/lib/comms': { normPhone: (s: string) => s.replace(/[^0-9]/g, ''), reconcileUnmatched: async () => { reconciles++; } }, './us-address': address, './standard-fields': standard, '@/lib/webhook-deliver': { fireEvent: async () => { events++; } } };
      const source = fs.readFileSync(path.resolve(__dirname, 'lead-ingest.ts'), 'utf8');
      const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const exp: any = {}; new Function('require', 'exports', js)((id: string) => { if (!(id in mods)) throw new Error(`Unstubbed ${id}`); return mods[id]; }, exp);
      const database: any = new FakeDb({ leads: [], claims: [], lead_activity: [] }); database.rpc = async () => ({ data: 'TEST-NEW', error: null });
      const r = await exp.ingestLead(database, { lead: ingest.normalizeLead({ LeadID: '264972', FirstName: 'Synthetic', LastName: 'Tester', Phone: '2025550123' }), campaign: { id: 'mva', name: 'TMP MVA', firm_id: F, case_type: 'mva' }, via: 'lawruler', historical });
      assert.equal(r.ok, true); assert.equal(r.created, true); assert.equal(events, historical ? 0 : 1); assert.equal(reconciles, historical ? 0 : 1);
    }
  });
  await t('legacy Motel ambiguity stops before modifying lead or contact data', async () => {
    const h = harness(''); Object.assign(h.database.tables.claims[0], { campaign_id: null, campaign: 'motel6', claim_type: 'motel_trafficking' });
    h.database.tables.claims.push({ ...h.database.tables.claims[0], id: 'sibling' }); h.database.tables.retention_settings = [{ campaign: 'motel6', firm_id: F }];
    const r = await h.POST(req({ leadid: '264972', campaign: 'motel6', first_name: 'Historical name' }));
    assert.equal(r.status, 409); assert.equal(r.body.saved, false); assert.equal(h.contactUpserts.length, 0); assert.ok(h.database.ops.every((o: any) => o.kind !== 'update'));
  });
  await t('legacy Motel resend preserves corrected names/contact columns and known contact-point state', async () => {
    const h = harness(''); Object.assign(h.database.tables.leads[0], { first_name: 'Corrected', last_name: 'Person', claimant_name: 'Corrected Person', phone: '2025550199', email: 'corrected@example.invalid' });
    Object.assign(h.database.tables.claims[0], { campaign_id: null, campaign: 'motel6', claim_type: 'motel_trafficking' });
    h.database.tables.retention_settings = [{ campaign: 'motel6', firm_id: F }];
    const r = await h.POST(req({ leadid: '264972', campaign: 'motel6', first_name: 'Old', last_name: 'Name', claimant_name: 'Old Name', phone: '2025550188', email: 'old@example.invalid' }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const actual = h.database.tables.leads[0]; assert.equal(actual.first_name, 'Corrected'); assert.equal(actual.last_name, 'Person'); assert.equal(actual.claimant_name, 'Corrected Person'); assert.equal(actual.phone, '2025550199'); assert.equal(actual.email, 'corrected@example.invalid');
    assert.equal(h.contactUpserts[0].options.ignoreDuplicates, true); assert.ok(h.contactUpserts[0].rows.some((r: any) => r.value === '2025550199')); assert.ok(!h.contactUpserts[0].rows.some((r: any) => r.value === '2025550188'));
  });
  await t('actual App ingest preserves corrected first/last/display name and contact columns', async () => {
    const h = harness(''); Object.assign(h.database.tables.leads[0], { campaign_id: 'mva', first_name: 'Corrected', last_name: 'Person', claimant_name: 'Corrected Person', phone: '2025550199', email: 'corrected@example.invalid' });
    const r = await ingest.ingestLead(h.database, { lead: ingest.normalizeLead({ LeadID: '264972', FirstName: 'Old', LastName: 'Name', Phone: '2025550188', Email: 'old@example.invalid' }), campaign: { id: 'mva', name: 'TMP MVA', firm_id: F, case_type: 'mva', active: true, firm_slug: 'tmp' }, via: 'lawruler' });
    assert.equal(r.ok, true); const actual = h.database.tables.leads[0]; assert.equal(actual.first_name, 'Corrected'); assert.equal(actual.last_name, 'Person'); assert.equal(actual.claimant_name, 'Corrected Person'); assert.equal(actual.phone, '2025550199'); assert.equal(actual.email, 'corrected@example.invalid');
  });
  await t('unauthorized reconciliation GET and POST stop before admin or body parse', async () => {
    for (const role of ['none', 'agent', 'manager', 'firm']) {
      const h = harness('status-sync', role);
      assert.equal((await h.GET({ url: `https://synthetic.invalid?firm_id=${F}` })).status, 403);
      assert.equal((await h.POST({ text: async () => { throw new Error('unauthorized body parsed'); } })).status, 403); assert.equal(h.adminCalls(), 0);
    }
  });
  await t('owner status permission override is enforced before parsing apply body', async () => {
    const h = harness('status-sync', 'owner-denied');
    assert.equal((await h.POST({ text: async () => { throw new Error('body parsed despite permission override'); } })).status, 403);
    assert.equal(h.adminCalls(), 0);
  });
  await t('reconciliation GET never writes and requires an explicit firm', async () => {
    const h = harness('status-sync'); assert.equal((await h.GET({ url: 'https://synthetic.invalid' })).status, 400);
    const r = await h.GET({ url: `https://synthetic.invalid?firm_id=${F}` }); assert.equal(r.status, 200); assert.equal(r.body.dry_run, true); assert.ok(h.database.ops.every((o: any) => o.kind === 'select'));
  });
  await t('reconciliation rejects missing expected status and duplicated selections before privileged work', async () => {
    const h = harness('status-sync'); const selection = { lead_id: L, claim_id: C, source_status: 'Legacy signed', status: 'new' };
    assert.equal((await h.POST({ text: async () => JSON.stringify({ firm_id: F, selections: [selection] }) })).status, 400);
    assert.equal((await h.POST({ text: async () => JSON.stringify({ firm_id: F, selections: [{ ...selection, expected_status: 'new' }, { ...selection, expected_status: 'new' }] }) })).status, 400);
    assert.equal(h.adminCalls(), 0);
  });
  await t('old replay GET is a firm-scoped read-only diagnostic preview', async () => {
    const h = harness('replay'); const r = await h.GET({ url: `https://synthetic.invalid?firm_id=${F}` });
    assert.equal(r.status, 200); assert.equal(r.body.dry_run, true); assert.equal(r.body.actions_executed, false); assert.equal(h.ingests(), 0); assert.ok(h.database.ops.every((o: any) => o.kind === 'select'));
    assert.equal((await harness('replay', 'agent').GET({ url: `https://synthetic.invalid?firm_id=${F}` })).status, 403);
  });
  console.log(`${count} LawRuler route tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
