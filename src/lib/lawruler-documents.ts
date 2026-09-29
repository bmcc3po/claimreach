// Immutable LawRuler originals. No remote URL fetches, signing, or communications.
import { parseLrFilenameLeadId } from './lawruler-email';
import { lrSigningEvidence, lrValue } from './lawruler-recovery';
import { resolveMatter } from './matter';
import { parseCsvRows } from './pfs';

export const LR_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const LR_MAX_BODY_BYTES = 20 * 1024 * 1024;
export type LrOriginal = { name: string; contentType: string; bytes: ArrayBuffer };
export type LrDocumentScope = { firmId: string; leadId: string; claimId: string; vendorId: string; caseType?: string | null };

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
}
async function stableId(value: string) {
  const hash = await sha256(new TextEncoder().encode(value).buffer as ArrayBuffer);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function resolveLawRulerMatter(db: any, scope: { firmId: string; leadId: string; campaignId?: string | null; caseType?: string | null; campaignName?: string | null; claimId?: string | null }) {
  const matter = await resolveMatter(db, scope.leadId, { campaignId: scope.campaignId, claimId: scope.claimId });
  if (!matter.ok) return matter;
  const c = matter.claim;
  if (c.firm_id !== scope.firmId) return { ok: false as const, status: 409, error: 'The incoming firm does not match the matter.' };
  if (scope.campaignId && c.campaign_id && c.campaign_id !== scope.campaignId) return { ok: false as const, status: 409, error: 'The incoming campaign does not match the matter.' };
  const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!c.campaign_id && scope.caseType && norm(c.claim_type) !== norm(scope.caseType) && norm(c.campaign) !== norm(scope.campaignName)) return { ok: false as const, status: 409, error: 'The legacy matter does not match the incoming case type. Review its identity first.' };
  return matter;
}

/** Event identity plus embedded filename/manifest identity must agree. */
export function validateLawRulerOriginal(file: LrOriginal, scope: LrDocumentScope, fields: Record<string, any>) {
  if (!file.bytes.byteLength || file.bytes.byteLength > LR_MAX_FILE_BYTES) throw new Error('Each original must be between 1 byte and 8 MiB.');
  const name = file.name.replace(/^.*[/\\]/, '').trim();
  if (!name || name.length > 240) throw new Error('The original filename is missing or too long.');
  const vendor = parseLrFilenameLeadId(name);
  let manifest: any = fields.attachment_manifest;
  if (typeof manifest === 'string') { try { manifest = JSON.parse(manifest); } catch { throw new Error('attachment_manifest must be valid JSON.'); } }
  const entries = Array.isArray(manifest) ? manifest.filter((m: any) => m?.name === name) : [];
  if (entries.length > 1) throw new Error('The attachment manifest repeats this filename.');
  const entry = entries[0];
  if (vendor && vendor !== scope.vendorId) throw new Error('The filename names a different LawRuler lead.');
  if (!vendor && (!entry || String(entry.lead_id) !== scope.vendorId)) throw new Error('An unnumbered attachment needs a matching attachment_manifest lead_id.');
  if (entry && (String(entry.lead_id) !== scope.vendorId || (entry.claim_id && entry.claim_id !== scope.claimId))) throw new Error('The attachment manifest names a different lead or matter.');
  const bytes = new Uint8Array(file.bytes);
  const start = new TextDecoder().decode(bytes.slice(0, 8));
  let docType: string, contentType: string;
  if (/\.pdf$/i.test(name)) {
    if (!start.startsWith('%PDF-') || !new TextDecoder().decode(bytes.slice(-2048)).includes('%%EOF')) throw new Error('The attachment is not a complete PDF.');
    // Motel's established IntakeForm PDF is the secondary interview. Preserve
    // that document category while all campaigns share immutable storage.
    docType = /retain|agreement|contract/i.test(name) ? 'retainer' : /intakeform/i.test(name) ? (scope.caseType === 'motel_trafficking' ? 'secondary_interview' : 'intake') : 'other'; contentType = 'application/pdf';
  } else if (/\.csv$/i.test(name)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0') || !text.includes(',') || !/[\r\n]/.test(text)) throw new Error('The attachment is not a valid text CSV.');
    const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
    const leadColumn = rows[0]?.findIndex(h => /^(leadnumber|leadid|lawrulerleadid)$/.test(h.toLowerCase().replace(/[^a-z0-9]/g, ''))) ?? -1;
    if (leadColumn >= 0 && rows.slice(1).filter(r => r.some(v => v.trim())).some(r => r[leadColumn]?.trim() !== scope.vendorId)) throw new Error('The CSV content names a different or missing LawRuler lead.');
    docType = 'intake'; contentType = 'text/csv';
  } else throw new Error('Only original PDF or CSV files are accepted by this import. Remote URLs are not fetched.');
  return { name, docType, contentType };
}

function sameDocument(row: any, scope: LrDocumentScope, path: string) {
  return row?.firm_id === scope.firmId && row?.lead_id === scope.leadId && row?.claim_id === scope.claimId && row?.storage_path === path;
}

/** A failed DB insert leaves the immutable object available for the exact retry. */
export async function storeLawRulerOriginals(db: any, scope: LrDocumentScope, files: LrOriginal[], fields: Record<string, any>) {
  if (files.length > 8) throw new Error('At most eight originals may be supplied in one request.');
  const plans = files.map(file => ({ file, plan: validateLawRulerOriginal(file, scope, fields) }));
  const results: { document_id: string; file_name: string; sha256: string; duplicate: boolean }[] = [];
  for (const { file, plan } of plans) {
    const hash = await sha256(file.bytes);
    const id = await stableId(`lawruler-original|${scope.firmId}|${scope.leadId}|${scope.claimId}|${hash}`);
    const ext = plan.contentType === 'application/pdf' ? 'pdf' : 'csv';
    const path = `${scope.firmId}/${scope.leadId}/${scope.claimId}/lawruler/${hash}.${ext}`;
    const prior = await db.from('case_documents').select('id, firm_id, lead_id, claim_id, storage_path').eq('id', id).maybeSingle();
    if (prior.error) throw new Error(`Could not check original: ${prior.error.message}`);
    if (prior.data && !sameDocument(prior.data, scope, path)) throw new Error('The existing original has conflicting matter metadata.');
    const bucket = db.storage.from('case-docs');
    const up = await bucket.upload(path, file.bytes, { contentType: plan.contentType, upsert: false });
    if (up.error) {
      if (String(up.error.statusCode) !== '409' && !/already exists|duplicate/i.test(up.error.message || '')) throw new Error(`Original upload failed: ${up.error.message}`);
      const existing = await bucket.download(path);
      if (existing.error || !existing.data || existing.data.size > LR_MAX_FILE_BYTES || await sha256(await existing.data.arrayBuffer()) !== hash) throw new Error('The existing object could not be verified. No document was filed.');
    }
    if (!prior.data) {
      const inserted = await db.from('case_documents').insert({ id, firm_id: scope.firmId, lead_id: scope.leadId, claim_id: scope.claimId, doc_type: plan.docType, file_name: plan.name, storage_path: path, uploaded_by_name: 'LawRuler imported original' });
      if (inserted.error) {
        if (String(inserted.error.code) !== '23505') throw new Error(`Original uploaded but document index failed; retry this same original: ${inserted.error.message}`);
        const raced = await db.from('case_documents').select('id, firm_id, lead_id, claim_id, storage_path').eq('id', id).maybeSingle();
        if (raced.error || !sameDocument(raced.data, scope, path)) throw new Error('The original index changed during import. Review before retrying.');
      }
    }
    const auditId = await stableId(`lawruler-original-evidence|${id}`);
    const evidence = await db.from('lead_activity').select('id, firm_id, lead_id, meta').eq('id', auditId).maybeSingle();
    if (evidence.error) throw new Error(`Could not check original provenance: ${evidence.error.message}`);
    const sameEvidence = (row: any) => row?.firm_id === scope.firmId && row?.lead_id === scope.leadId && row?.meta?.claim_id === scope.claimId && row?.meta?.document_id === id && row?.meta?.sha256 === hash;
    if (evidence.data && !sameEvidence(evidence.data)) throw new Error('The existing provenance belongs to another matter or original.');
    if (!evidence.data) {
      const signed = lrSigningEvidence(fields);
      const audit = await db.from('lead_activity').insert({ id: auditId, firm_id: scope.firmId, lead_id: scope.leadId, kind: 'system', body: 'LawRuler original preserved. External signing evidence has not been independently validated.', meta: {
        source: 'lawruler', event: 'original_document', claim_id: scope.claimId, vendor_lead_id: scope.vendorId,
        document_id: id, original_name: plan.name, sha256: hash, bytes: file.bytes.byteLength, content_type: plan.contentType,
        ...signed,
      } });
      if (audit.error && String(audit.error.code) !== '23505') throw new Error(`Original filed but provenance failed; retry this same original: ${audit.error.message}`);
      if (audit.error) {
        const raced = await db.from('lead_activity').select('id, firm_id, lead_id, meta').eq('id', auditId).maybeSingle();
        if (raced.error || !sameEvidence(raced.data)) throw new Error('The original provenance changed during import. Review before retrying.');
      }
    }
    results.push({ document_id: id, file_name: plan.name, sha256: hash, duplicate: !!prior.data });
  }
  return results;
}

export async function recordLawRulerSource(db: any, scope: LrDocumentScope, fields: Record<string, any>) {
  const status = lrValue(fields, ['status', 'leadstatus']);
  const evidence = lrSigningEvidence(fields);
  const { error } = await db.from('lead_activity').insert({ firm_id: scope.firmId, lead_id: scope.leadId, kind: 'system', body: status ? `LawRuler source status: ${status}` : 'LawRuler source received.', meta: {
    source: 'lawruler', event: 'source_snapshot', claim_id: scope.claimId, vendor_lead_id: scope.vendorId, status, recovery_mode: String(fields.recovery_mode || '').trim().toLowerCase() === 'historical' ? 'historical' : null,
    source_fields: { Status: status, 'Signed Contracts Received': evidence.source_signed_value, signed_at: evidence.source_signed_at }, ...evidence,
  } });
  if (error) throw new Error(`Source evidence could not be saved: ${error.message}`);
}
