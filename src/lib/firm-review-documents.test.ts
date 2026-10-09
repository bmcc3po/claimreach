import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as access from './firm-review-access';
import { expectedPacketPaths } from './mva-call/esign';
import { signedDocPath } from './signed-docs';
import { PDFDocument } from 'pdf-lib';
const scope = { firmId: 'firm', campaignId: 'inno', name: 'Reviewer' };
const file = { claim: { id: 'claim', lead_id: 'lead', firm_id: 'firm', campaign_id: 'inno', status: 'delivered' }, lead: { id: 'lead', firm_id: 'firm', lead_no: 'DEMO', claimant_name: 'Fictional Client', archived_at: null } };
let row: any = { id: 'agreement', firm_id: 'firm', status: 'completed', signed_at: '2026-10-05', doc_count: 2, submission_id: '123', completed_pdf_path: 'firm/signed-ds-123.pdf' };
let emergency: any = null, snapshotCalls = 0, importedCalls = 0, rendered: any = null;
const downloaded: string[] = [];
let pdfBytes: Uint8Array;
let reportRows: any[] = [];
const modules: any = {
  '@/lib/supabase-server': {}, './firm-review-access': access,
  './signature-report-loader': { loadSignatureReport: async (_db: any, campaign: any) => { assert.deepEqual(campaign, { id: 'inno', firm_id: 'firm', firm_email: null }); return reportRows; } },
  './intake-render': { loadIntakeBundle: async () => ({ claim: file.claim, lead: { ...file.lead, answers: { secret_sibling: true }, vendor_fields: { private_notes: 'unreleased' } }, answers: { own_answer: true } }),
    buildIntakePdf: async (bundle: any) => { rendered = bundle; return pdfBytes; } },
  './imported-packet': { importedOriginals: async (_: any, firm: string, lead: string, claim: string) => { importedCalls++; assert.deepEqual([firm, lead, claim], ['firm', 'lead', 'claim']); return [{ kind: 'retainer' }]; }, verifiedImportedPdfs: async () => [{ bytes: pdfBytes }] },
  './matter': { resolveMatter: async () => ({ ok: true, claim: file.claim, sole: false }) },
  './mva-call/signing-matter': { getMatterAgreement: async () => ({ ok: true, row }), getMatterEmergency: async () => ({ ok: true, row: emergency }), emergencySupersedes: (_: any, e: any) => !!e },
  './mva-call/esign': { expectedPacketPaths }, './signed-docs': { signedDocPath, downloadSignedDoc: async (_: any, p: string) => { downloaded.push(p); return pdfBytes; } },
  './mva-call/client-signed': { ensureClientSignedSnapshot: async () => { snapshotCalls++; return { ok: true, path: 'firm/client-ds-123.pdf' }; } },
  'pdf-lib': require('pdf-lib'),
};
const source = fs.readFileSync(path.resolve(__dirname, 'firm-review-server.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const server: any = {}; new Function('require', 'exports', code)((key: string) => { assert.ok(key in modules, key); return modules[key]; }, server);
(async () => {
  reportRows = [{ claimId: 'signed', state: 'signed' }, { claimId: 'unsigned', state: 'unsigned' }, { claimId: 'uncertain', state: 'verify' },
    { claimId: 'archived', state: 'signed', archived: true }, { claimId: 'test', state: 'signed', test: true }];
  assert.deepEqual([...await server.reviewerSignedClaimIds({}, scope)], ['signed'], 'the canonical signature report controls release, not a delivery label');
  const db: any = { from: (table: string) => { const q: any = { select: () => q, eq: () => q, in: () => q, is: () => q,
    maybeSingle: async () => ({ data: table === 'claims' ? file.claim : file.lead }) }; return q; } };
  assert.equal(await server.reviewerFile(db, scope, 'claim'), null, 'direct PDF/action lookup cannot bypass signed-only release');
  reportRows = [{ claimId: 'claim', state: 'signed' }]; assert.ok(await server.reviewerFile(db, scope, 'claim'));
  reportRows = [{ claimId: 'claim', state: 'verify' }]; assert.equal(await server.reviewerFile(db, scope, 'claim'), null);
  const p = await PDFDocument.create(); p.addPage(); pdfBytes = await p.save();
  await server.reviewerPdf({}, scope, file, 'intake'); assert.equal(rendered.lead.answers, undefined); assert.equal(rendered.lead.vendor_fields, undefined); assert.deepEqual(rendered.answers, { own_answer: true });
  const joined = await server.reviewerPdf({}, scope, file, 'retainer'); assert.equal((await PDFDocument.load(joined)).getPageCount(), 2); assert.deepEqual(downloaded, ['firm/signed-ds-123.pdf', 'firm/signed-ds-123-2.pdf']);
  const declined = { ...file, claim: { ...file.claim, status: 'signed_dropped', answers: { signed_decline: {
    id: 'decline', at: '2026-10-07', reason: 'Synthetic reason', previousStatus: 'delivered', source: 'firm' } } } };
  assert.equal((await PDFDocument.load(await server.reviewerPdf({}, scope, declined, 'retainer'))).getPageCount(), 2, 'declining a delivered file preserves its original PDFs');
  await assert.rejects(() => server.reviewerPdf({}, { ...scope, firmId: 'other' }, declined, 'retainer'));
  await assert.rejects(() => server.reviewerPdf({}, { ...scope, campaignId: 'other' }, declined, 'intake'));
  await assert.rejects(() => server.reviewerPdf({}, { ...scope }, { ...declined, claim: { ...declined.claim, answers: {
    signed_decline: { ...declined.claim.answers.signed_decline, previousStatus: 'signed_qa' } } } }, 'retainer'), /unavailable/);
  const original = { ...row };
  for (const change of [{ firm_id: 'other' }, { status: 'voided' }, { replacement_requested_at: 'now' }, { completed_pdf_path: 'other/signed-ds-123.pdf' }, { submission_id: '../escape' }, { doc_count: null }]) {
    row = { ...original, ...change }; await assert.rejects(() => server.reviewerPdf({}, scope, file, 'retainer'));
  }
  assert.equal(importedCalls, 0, 'a bad current agreement cannot resurrect an old imported one');
  row = { ...original, status: 'signed', doc_count: null, completed_pdf_path: null }; await server.reviewerPdf({}, scope, file, 'retainer'); assert.equal(snapshotCalls, 1); assert.equal(downloaded.at(-1), 'firm/client-ds-123.pdf');
  row = null; await server.reviewerPdf({}, scope, file, 'retainer'); assert.equal(importedCalls, 1);
  emergency = { id: 'newer' }; await assert.rejects(() => server.reviewerPdf({}, scope, file, 'retainer')); assert.equal(importedCalls, 1);
  await assert.rejects(() => server.reviewerPdf({}, { ...scope, campaignId: 'netfly' }, file, 'intake'));
  console.log('Firm review PDFs: exact scope, sibling-answer exclusion, multipart completeness, no obsolete agreement fallback, client-signed copy and hashed imported originals passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
