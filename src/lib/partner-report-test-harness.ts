// Synthetic-only route harness; no network or production credentials.
import fs from 'node:fs'; import path from 'node:path'; import ts from 'typescript';
import assert from 'node:assert/strict';
import { FakeDb } from './test-fake-db';
import * as access from './partner-report-access';
import { reportPages } from './signature-report-loader';
import { partnerReportData } from './partner-report';
import type { SignatureReportRow } from './signature-report';
export const REPORT_FIRM = '11111111-1111-4111-8111-111111111111';
export const REPORT_CAMP = '22222222-2222-4222-8222-222222222222';
export const REPORT_TEST_PASSWORD = 'synthetic-only-password';
function compile(file: string, modules: Record<string, any>) {
  const out: any = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), { compilerOptions: { target: 9, module: 1 } }).outputText;
  new Function('require', 'exports', code)((key: string) => { assert.ok(key in modules, key); return modules[key]; }, out);
  return out;
}
export async function partnerReportHarness() {
  const config: access.ReportAccess = { report_key: 'pr-digital', firm_id: REPORT_FIRM, campaign_id: REPORT_CAMP,
    scope: 'campaign', active: true, password_salt: 'a'.repeat(32), password_hash: '', token_secret: 'b'.repeat(64) };
  config.password_hash = await access.reportPasswordHash(REPORT_TEST_PASSWORD, config.password_salt);
  const lead: any = { id: 'lead', firm_id: REPORT_FIRM, claimant_name: 'Fictional Client', phone: '2025550100',
    created_at: '2026-10-01T12:00:00Z', first_dialed_at: '2026-10-01T13:00:00Z', source_system: 'lawruler', lawruler_ref_no: '100', lawruler_created_at: '2026-09-30T12:00:00Z' };
  const claim: any = { id: 'claim', lead_id: 'lead', firm_id: REPORT_FIRM, campaign_id: REPORT_CAMP, claim_type: 'mva' };
  const signature = { claimId: claim.id, state: 'signed', signedAt: '2026-10-02T12:00:00Z', deliveredAt: '2026-10-02T13:00:00Z', status: 'Signed — sent to firm', archived: false, test: false } as SignatureReportRow;
  const db = new FakeDb({ partner_report_access: [config], leads: [lead], claims: [claim], partner_source_leads: [],
    campaigns: [{ id: REPORT_CAMP, firm_id: REPORT_FIRM, name: 'INNO MVA', case_type: 'mva', firm_email: 'firm@example.test' }] });
  const h = { config, lead, claim, signature, db, signatures: [signature], attempts: 0, rateError: false, loadError: false };
  (db as any).rpc = async (name: string, args: any) => {
    assert.equal(name, 'consume_partner_report_attempt'); assert.equal(args.p_report_key, 'pr-digital'); assert.match(args.p_client_hash, /^[a-f0-9]{64}$/);
    h.attempts++; return { data: h.attempts <= 12, error: h.rateError ? { message: 'fixture rate failure' } : null };
  };
  const server = compile('partner-report-server.ts', { './signature-report-loader': { reportPages, loadSignatureReport: async () => {
    if (h.loadError) throw new Error('fixture signing failure'); return h.signatures;
  } }, './partner-report-access': access, './partner-report': { partnerReportData } });
  const route = compile('../app/api/pr-digital/route.ts', { 'next/server': require('next/server'), '@/lib/supabase-server': { supabaseAdmin: () => db },
    '@/lib/partner-report-server': server, '@/lib/partner-report-access': access });
  return { ...h, state: h, route, server };
}
