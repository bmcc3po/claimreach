import { lrValue } from './lawruler-recovery';
import { PARTNER_REPORT_KEY } from './partner-report-access';

type SourceScope = { firmId: string; campaignId: string; leadId: string; claimId: string; vendorId: string };
/** Only called after the LawRuler route authenticates and resolves the exact matter.
 * A public marketing label or a matching phone can never create this binding. */
export async function syncPrDigitalSource(db: any, scope: SourceScope, fields: Record<string, any>) {
  const norm = (value: string | null) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (norm(lrValue(fields, ['contactmethod'])) !== 'pr digital' ||
      norm(lrValue(fields, ['casetype', 'typeofcase'])) !== 'inno mva') return 'not_applicable';
  if (!/^\d{1,30}$/.test(scope.vendorId) || lrValue(fields, ['leadid', 'lawrulerleadid']) !== scope.vendorId)
    throw new Error('PR Digital source identity does not match the imported lead.');
  const config = await db.from('partner_report_access').select('firm_id,campaign_id,scope')
    .eq('report_key', PARTNER_REPORT_KEY).eq('active', true).maybeSingle();
  if (config.error) throw new Error('Could not verify PR Digital report scope.');
  if (!config.data || config.data.scope !== 'approved_sources' || config.data.firm_id !== scope.firmId || config.data.campaign_id !== scope.campaignId) return 'not_applicable';
  const lead = await db.from('leads').select('id').eq('id', scope.leadId).eq('firm_id', scope.firmId)
    .eq('source_system', 'lawruler').eq('lawruler_ref_no', scope.vendorId).maybeSingle();
  const claim = await db.from('claims').select('id').eq('id', scope.claimId).eq('lead_id', scope.leadId)
    .eq('firm_id', scope.firmId).eq('campaign_id', scope.campaignId).eq('claim_type', 'mva').maybeSingle();
  if (lead.error || claim.error || !lead.data || !claim.data) throw new Error('Could not verify PR Digital lead and matter identity.');
  const readRef = () => db.from('partner_source_leads').select('firm_id').eq('partner_key', PARTNER_REPORT_KEY)
    .eq('source_system', 'lawruler').eq('source_lead_id', scope.vendorId).maybeSingle();
  const prior = await readRef();
  if (prior.error || (prior.data && prior.data.firm_id !== scope.firmId)) throw new Error('PR Digital source approval needs identity review.');
  if (prior.data) return 'already_linked';
  // Record evidence before granting access. Stable ID keeps retries idempotent.
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pr-digital-source|${scope.firmId}|${scope.leadId}|${scope.vendorId}`));
  const hex = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const audit = await db.from('lead_activity').insert({ id, firm_id: scope.firmId, lead_id: scope.leadId, kind: 'system',
    body: 'Authenticated LawRuler source identifies this INNO MVA lead as supplied by PR Digital.',
    meta: { event: 'partner_source_verified', partner_key: PARTNER_REPORT_KEY, source: 'lawruler', vendor_lead_id: scope.vendorId,
      claim_id: scope.claimId, campaign_id: scope.campaignId, contact_method: 'PR DIGITAL', communications_triggered: false } });
  if (audit.error && audit.error.code !== '23505') throw new Error('PR Digital source evidence could not be recorded. Retry this import.');
  if (audit.error) {
    const existing = await db.from('lead_activity').select('firm_id,lead_id,meta').eq('id', id).maybeSingle();
    if (existing.error || existing.data?.firm_id !== scope.firmId || existing.data?.lead_id !== scope.leadId ||
        existing.data?.meta?.claim_id !== scope.claimId || existing.data?.meta?.vendor_lead_id !== scope.vendorId)
      throw new Error('PR Digital source evidence needs identity review.');
  }
  const inserted = await db.from('partner_source_leads').insert({ partner_key: PARTNER_REPORT_KEY, source_system: 'lawruler', source_lead_id: scope.vendorId, firm_id: scope.firmId });
  if (inserted.error) {
    if (inserted.error.code !== '23505') throw new Error('PR Digital source could not be added to its report. Retry this import.');
    const raced = await readRef();
    if (raced.error || raced.data?.firm_id !== scope.firmId) throw new Error('PR Digital source approval changed during import.');
  }
  return 'linked';
}
