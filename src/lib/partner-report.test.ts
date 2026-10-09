import assert from 'node:assert/strict'; import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { partnerReportHarness, REPORT_CAMP, REPORT_FIRM, REPORT_TEST_PASSWORD } from './partner-report-test-harness';
import { createReportSession, verifyReportSession, reportPasswordMatches, PARTNER_REPORT_COOKIE, REPORT_SESSION_SECONDS } from './partner-report-access';
import { partnerReportRows, partnerReportData, partnerReceivedDate } from './partner-report';
const req = (method = 'GET', body?: unknown, token?: string, origin = 'https://claimreach.test') => new NextRequest('https://claimreach.test/api/pr-digital', {
  method, headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', ...(token ? { cookie: `${PARTNER_REPORT_COOKIE}=${token}` } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

test('historical receipt uses original source date only when identity and date are valid', () => {
  const source = { LeadID: '100', CaseType: 'INNO MVA', LeadCreated: '10-08-2026' };
  const lead = { source_system: 'lawruler', lawruler_ref_no: '100', created_at: '2026-10-10T12:00:00Z', vendor_fields: { sources: { lawruler: source } } };
  assert.equal(partnerReceivedDate(lead), '2026-10-08');
  assert.equal(partnerReceivedDate({ ...lead, lawruler_created_at: '2026-10-07T13:00:00Z' }), '2026-10-07T13:00:00Z');
  for (const invalid of ['02-30-2026', '13-01-2026', '', 'yesterday']) { source.LeadCreated = invalid; assert.equal(partnerReceivedDate(lead), null); }
  source.LeadCreated = '10/8/2026'; assert.equal(partnerReceivedDate(lead), '2026-10-08');
  source.LeadID = '101'; assert.equal(partnerReceivedDate(lead), null);
});
test('password hash and signed cookie fail closed for wrong password, tampering, expiry, rotation and scope changes', async () => {
  const h = await partnerReportHarness(), now = Date.now();
  assert.equal(await reportPasswordMatches(REPORT_TEST_PASSWORD, h.config), true);
  assert.equal(await reportPasswordMatches('wrong', h.config), false);
  const token = await createReportSession(h.config, now);
  assert.equal(await verifyReportSession(token, h.config, now), true);
  for (const invalid of [undefined, '', token + '.extra', token.slice(0, -1) + 'x', 'invalid']) assert.equal(await verifyReportSession(invalid, h.config, now), false);
  assert.equal(await verifyReportSession(token, h.config, now + REPORT_SESSION_SECONDS * 1000), false);
  assert.equal(await verifyReportSession(token, h.config, now - 1000), false);
  for (const change of [{ active: false }, { scope: 'approved_sources' }, { firm_id: REPORT_CAMP }, { campaign_id: REPORT_FIRM }, { token_secret: 'c'.repeat(64) }])
    assert.equal(await verifyReportSession(token, { ...h.config, ...change } as any, now), false);
});
test('API blocks unauthenticated access, wrong password and cross-origin login/logout without returning data', async () => {
  const h = await partnerReportHarness();
  assert.equal((await h.route.GET(req())).status, 401);
  assert.equal((await h.route.POST(req('POST', { password: 'wrong' }))).status, 401);
  assert.equal((await h.route.POST(req('POST', { password: REPORT_TEST_PASSWORD }, undefined, 'https://evil.test'))).status, 403);
  assert.equal((await h.route.DELETE(req('DELETE', undefined, undefined, 'https://evil.test'))).status, 403);
  assert.ok(!h.db.ops.some(o => o.table === 'leads'), 'no client query before authentication');
});
test('successful login sets a path-limited HttpOnly cookie; read-only API exposes exactly seven columns and no caches', async () => {
  const h = await partnerReportHarness();
  const login = await h.route.POST(req('POST', { password: REPORT_TEST_PASSWORD }));
  assert.equal(login.status, 200);
  const cookie = login.cookies.get(PARTNER_REPORT_COOKIE); assert.ok(cookie?.value);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i); assert.match(login.headers.get('set-cookie'), /SameSite=strict/i);
  assert.match(login.headers.get('set-cookie'), /Path=\/api\/pr-digital/i);
  const response = await h.route.GET(req('GET', undefined, cookie.value)), data = await response.json();
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/); assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.deepEqual(Object.keys(data.rows[0]).sort(), ['name','phone','receivedAt','called','signed','signedAt','status'].sort());
  assert.equal(data.rows[0].signed, 'Yes'); assert.equal(data.rows[0].called, true);
  assert.deepEqual(data.summary, { total: 1, signed: 1, unsigned: 0, verify: 0, called: 1, awaitingDelivery: 0, sentToFirm: 1, declined: 0 });
  assert.ok(!JSON.stringify(data).includes(h.config.token_secret)); assert.ok(!h.db.ops.some(o => o.kind !== 'select'));
  const logout = await h.route.DELETE(req('DELETE')); assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});
test('durable rate gate denies the 13th attempt and fails closed on database error', async () => {
  const h = await partnerReportHarness(); h.state.attempts = 12;
  assert.equal((await h.route.POST(req('POST', { password: REPORT_TEST_PASSWORD }))).status, 429);
  h.state.rateError = true;
  assert.equal((await h.route.POST(req('POST', { password: REPORT_TEST_PASSWORD }))).status, 503);
});
test('wrong campaign/firm, disabled access and incomplete evidence queries never return a partial sheet', async () => {
  for (const change of ['firm', 'campaign', 'disabled', 'failure', 'missing-access']) {
    const h = await partnerReportHarness();
    if (change === 'firm') h.db.tables.campaigns[0].firm_id = 'foreign';
    if (change === 'campaign') h.db.tables.campaigns[0].name = 'NETFLY';
    if (change === 'disabled') h.config.active = false;
    if (change === 'failure') h.state.loadError = true;
    if (change === 'missing-access') h.db.tables.partner_report_access = [];
    const r = await h.route.GET(req('GET', undefined, await createReportSession(h.config)));
    assert.ok(r.status >= 400, change); assert.equal((await r.json()).rows, undefined);
  }
});
test('projection excludes foreign firms/campaigns, archived/test files and ambiguous matters', async () => {
  const h = await partnerReportHarness();
  for (const [lp, cp] of [[{ firm_id: 'foreign' }, {}], [{ archived_at: '2026-10-01' }, {}], [{ claimant_name: 'TEST rehearsal' }, {}], [{ vendor_fields: { signing_rehearsal: true } }, {}], [{}, { campaign_id: 'foreign' }], [{}, { firm_id: 'foreign' }]]) {
    assert.equal(partnerReportRows(h.config, [{ ...h.lead, ...lp }], [{ ...h.claim, ...cp }], h.signatures, []).length, 0);
  }
  assert.equal(partnerReportRows(h.config, [h.lead], [h.claim, { ...h.claim, id: 'sibling' }], h.signatures, []).length, 0);
});
test('source-only access needs exact approved source identity; marketing label or shared phone never grants it', async () => {
  const h = await partnerReportHarness(); h.config.scope = 'approved_sources';
  const ref = { partner_key: 'pr-digital', firm_id: REPORT_FIRM, source_system: 'lawruler', source_lead_id: '100' };
  for (const refs of [[], [{ ...ref, firm_id: 'foreign' }], [{ ...ref, source_lead_id: '200' }], [{ ...ref, partner_key: 'other' }]])
    assert.equal(partnerReportRows(h.config, [h.lead], [h.claim], h.signatures, refs).length, 0);
  assert.equal(partnerReportRows(h.config, [h.lead], [h.claim], h.signatures, [ref]).length, 1);
});
test('summary and list share source scope; delivery uses receipts or owner confirmation, never a status label', async () => {
  const h = await partnerReportHarness(); h.config.scope = 'approved_sources';
  const leads: any[] = [], claims: any[] = [], signatures: any[] = [], refs: any[] = [];
  const variations = [
    { deliveredAt: null }, // A sent label alone is not proof.
    { deliveredAt: null, ownerSent: true },
    { firmDecision: 'Firm declined' }, // Sent, then declined: both counts retain the truth.
    { deliveredAt: null, declined: true },
    { state: 'verify' },
    { state: 'unsigned' },
  ];
  for (const [i, variation] of variations.entries()) {
    leads.push({ ...h.lead, id: `lead${i}`, lawruler_ref_no: `${i}` });
    claims.push({ ...h.claim, id: `claim${i}`, lead_id: `lead${i}` });
    signatures.push({ ...h.signature, ...variation, claimId: `claim${i}` });
    refs.push({ partner_key: 'pr-digital', firm_id: REPORT_FIRM, source_system: 'lawruler', source_lead_id: `${i}` });
  }
  // Another in-campaign lead without source approval cannot inflate any total.
  leads.push(h.lead); claims.push(h.claim); signatures.push(h.signature);
  const report = partnerReportData(h.config, leads, claims, signatures, refs);
  assert.equal(report.rows.length, 6);
  assert.deepEqual(report.summary, { total: 6, signed: 4, unsigned: 1, verify: 1, called: 6, awaitingDelivery: 1, sentToFirm: 2, declined: 2 });
  for (const change of [{ archived_at: '2026-10-01' }, { firm_id: 'foreign' }, { claimant_name: 'TEST synthetic' }]) {
    const excluded = partnerReportData(h.config, leads.map(l => ({ ...l, ...change })), claims, signatures, refs);
    assert.equal(excluded.rows.length, 0); assert.ok(Object.values(excluded.summary).every(n => n === 0));
  }
});

test('imported owner-approved signature retains Yes with unknown original date; no invented historical receipt or calls', async () => {
  const h = await partnerReportHarness(); h.lead.lawruler_created_at = null; h.lead.first_dialed_at = null; h.signature.signedAt = null;
  const [row] = partnerReportRows(h.config, [h.lead], [h.claim], h.signatures, []);
  assert.equal(row.signed, 'Yes'); assert.equal(row.signedAt, null); assert.equal(row.receivedAt, null); assert.equal(row.called, false);
  h.lead.last_called_at = '2026-10-02T12:00:00Z';
  assert.equal(partnerReportRows(h.config, [h.lead], [h.claim], h.signatures, [])[0].called, true);
});
test('recorded firm decline stays visible alongside signature, and uncertain signatures are never reported as unsigned', async () => {
  const h = await partnerReportHarness(); h.signature.firmDecision = 'Firm declined';
  let row = partnerReportRows(h.config, [h.lead], [h.claim], h.signatures, [])[0];
  assert.equal(row.status, 'Signed and declined'); assert.equal(row.signed, 'Yes');
  h.signature.state = 'verify'; row = partnerReportRows(h.config, [h.lead], [h.claim], h.signatures, [])[0];
  assert.equal(row.signed, 'Check signature'); assert.equal(row.signedAt, null);
});
