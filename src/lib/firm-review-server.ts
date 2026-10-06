import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { firmReviewScope, reviewerProfileAllowed, releasedToReviewer, REVIEW_EVENT, type FirmReviewScope } from './firm-review-access';
import { buildIntakePdf, loadIntakeBundle } from './intake-render';
import { importedOriginals, verifiedImportedPdfs } from './imported-packet';
import { resolveMatter } from './matter';
import { getMatterAgreement, getMatterEmergency, emergencySupersedes } from './mva-call/signing-matter';
import { expectedPacketPaths } from './mva-call/esign';
import { downloadSignedDoc, signedDocPath } from './signed-docs';
import { ensureClientSignedSnapshot } from './mva-call/client-signed';
import { loadSignatureReport } from './signature-report-loader';

export { REVIEW_EVENT } from './firm-review-access';
export const REVIEW_LEAD_COLS = 'id,firm_id,lead_no,claimant_name,phone,email,dob,mail_addr1,mail_city,mail_state,mail_zip,archived_at,vendor_fields,external_id';
export const REVIEW_CLAIM_COLS = 'id,lead_id,firm_id,campaign_id,campaign,claim_type,status,firm_sent_at,firm_send_result,updated_at';
export async function reviewerSignedClaimIds(db: any, scope: FirmReviewScope): Promise<Set<string>> {
  // Use the same evidence rules as the invoice report: a delivery label is
  // insufficient, and replacement/voided/unverified imported packets stay out.
  const rows = await loadSignatureReport(db, { id: scope.campaignId, firm_id: scope.firmId, firm_email: null });
  return new Set(rows.filter(row => row.state === 'signed' && !row.archived && !row.test).map(row => row.claimId));
}
export async function reviewerContext() {
  const sb = await supabaseServer();
  const { data: { user }, error } = await sb.auth.getUser();
  const scope = firmReviewScope(user);
  if (error || !user || !scope) return null;
  const db = supabaseAdmin();
  // Fail closed if someone accidentally grants this identity a broad profile.
  const [profile, access, campaign] = await Promise.all([
    db.from('app_users').select('id,role,active').eq('id', user.id).maybeSingle(),
    db.from('firm_access').select('email').eq('email', user.email!.toLowerCase()).maybeSingle(),
    db.from('campaigns').select('id,firm_id,name').eq('id', scope.campaignId).eq('firm_id', scope.firmId).maybeSingle(),
  ]);
  if (profile.error || !reviewerProfileAllowed(user, profile.data) || access.error || access.data || campaign.error || !campaign.data) return null;
  return { db, user, scope, campaign: campaign.data.name as string };
}
export async function reviewerFile(db: any, scope: FirmReviewScope, claimId: string) {
  const { data: claim, error } = await db.from('claims').select(REVIEW_CLAIM_COLS).eq('id', claimId)
    .eq('firm_id', scope.firmId).eq('campaign_id', scope.campaignId).in('status', ['delivered', 'retained']).maybeSingle();
  if (error) throw new Error('Could not read the file. Please try again.');
  if (!claim) return null;
  const leadResult = await db.from('leads').select(REVIEW_LEAD_COLS).eq('id', claim.lead_id).eq('firm_id', scope.firmId).is('archived_at', null).maybeSingle();
  if (leadResult.error) throw new Error('Could not read the file. Please try again.');
  if (!releasedToReviewer(scope, claim, leadResult.data)) return null;
  if (!(await reviewerSignedClaimIds(db, scope)).has(claim.id)) return null;
  return { claim, lead: leadResult.data };
}
export async function reviewEvents(db: any, scope: FirmReviewScope, claimIds: string[]) {
  if (!claimIds.length) return [];
  const { data, error } = await db.from('lead_activity').select('id,lead_id,created_at,meta')
    .eq('firm_id', scope.firmId).eq('meta->>event', REVIEW_EVENT).eq('meta->>campaign_id', scope.campaignId)
    .in('meta->>claim_id', claimIds).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(5000);
  if (error || data?.length >= 5000) throw new Error('Could not read review history. Please contact ClaimReach.');
  return data || [];
}
export async function reviewerPdf(db: any, scope: FirmReviewScope, file: { claim: any; lead: any }, kind: 'intake' | 'retainer') {
  const { claim, lead } = file;
  if (!releasedToReviewer(scope, claim, lead)) throw new Error('File unavailable.');
  if (kind === 'intake') {
    const bundle = await loadIntakeBundle(db, lead.id, claim.id);
    if (!bundle || bundle.claim.firm_id !== scope.firmId || bundle.claim.campaign_id !== scope.campaignId) throw new Error('Intake unavailable.');
    // Do not give the renderer lead-wide answer bags from unrelated matters.
    bundle.lead = { id: lead.id, lead_no: lead.lead_no, claimant_name: lead.claimant_name, phone: lead.phone,
      email: lead.email, dob: lead.dob, mail_addr1: lead.mail_addr1, mail_city: lead.mail_city, mail_state: lead.mail_state, mail_zip: lead.mail_zip };
    return buildIntakePdf(bundle);
  }
  const matter = await resolveMatter(db, lead.id, { claimId: claim.id });
  if (!matter.ok) throw new Error('Could not verify this agreement’s file.');
  const agreement = await getMatterAgreement(db, lead, matter);
  const emergency = await getMatterEmergency(db, lead, matter);
  if (!agreement.ok || !emergency.ok || emergencySupersedes(agreement.ok ? agreement.row : null, emergency.ok ? emergency.row : null)) throw new Error('The current agreement needs owner review.');
  const row = agreement.row;
  let parts: Uint8Array[];
  if (row) {
    if (row.firm_id !== scope.firmId || !['signed', 'completed'].includes(row.status) || !row.signed_at || row.voided_at || row.replacement_requested_at ||
      !/^\d+$/.test(String(row.submission_id))) throw new Error('The current signed agreement needs owner review.');
    if (row.status === 'signed') {
      const snapshot = await ensureClientSignedSnapshot(db, row);
      if (!snapshot.ok) throw new Error('The client-signed copy is temporarily unavailable. Please contact ClaimReach.');
      const bytes = await downloadSignedDoc(db, snapshot.path);
      if (!bytes) throw new Error('The client-signed copy is temporarily unavailable. Please contact ClaimReach.');
      return bytes;
    }
    if (!Number.isInteger(row.doc_count) || row.doc_count < 1 || row.doc_count > 16 ||
      row.completed_pdf_path !== signedDocPath(scope.firmId, `ds-${row.submission_id}`, 'signed')) throw new Error('The completed agreement needs owner review.');
    parts = [];
    for (const path of expectedPacketPaths(scope.firmId, String(row.submission_id), row.doc_count)) {
      const bytes = await downloadSignedDoc(db, path);
      if (!bytes || bytes.length > 20 * 1024 * 1024) throw new Error('A signed packet page is unavailable. Please contact ClaimReach.');
      parts.push(bytes);
    }
  } else {
    const originals = await importedOriginals(db, scope.firmId, lead.id, claim.id);
    parts = (await verifiedImportedPdfs(db, originals.filter(o => o.kind === 'retainer'))).map(p => p.bytes);
  }
  if (parts.length === 1) return parts[0];
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const bytes of parts) {
    const original = await PDFDocument.load(bytes);
    for (const page of await merged.copyPages(original, original.getPageIndices())) merged.addPage(page);
  }
  return merged.save();
}
