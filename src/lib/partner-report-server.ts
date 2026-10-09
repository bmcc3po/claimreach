import { reportPages, loadSignatureReport } from './signature-report-loader';
import { PARTNER_REPORT_KEY, validReportAccess, type ReportAccess } from './partner-report-access';
import { partnerReportData } from './partner-report';

export async function loadReportAccess(db: any): Promise<ReportAccess | null> {
  const result = await db.from('partner_report_access').select('report_key,firm_id,campaign_id,scope,active,password_salt,password_hash,token_secret')
    .eq('report_key', PARTNER_REPORT_KEY).eq('active', true).maybeSingle();
  if (result.error) throw new Error('Report access unavailable');
  return validReportAccess(result.data) ? result.data : null;
}
export async function loadPartnerReport(db: any, access: ReportAccess) {
  // A configured campaign must belong to the configured firm and be INNO MVA.
  const campaign = await db.from('campaigns').select('id,firm_id,firm_email')
    .eq('id', access.campaign_id).eq('firm_id', access.firm_id).eq('name', 'INNO MVA').eq('case_type', 'mva').maybeSingle();
  if (campaign.error || !campaign.data) throw new Error('Report campaign unavailable');
  const claims = await reportPages(() => db.from('claims').select('id,lead_id,firm_id,campaign_id,claim_type')
    .eq('firm_id', access.firm_id).eq('campaign_id', access.campaign_id).eq('claim_type', 'mva'));
  const ids = [...new Set(claims.map(c => c.lead_id))];
  const leads: any[] = [];
  for (let i = 0; i < ids.length; i += 100) leads.push(...await reportPages(() => db.from('leads')
    .select('id,firm_id,claimant_name,first_name,last_name,phone,lawruler_created_at,created_at,first_dialed_at,last_called_at,archived_at,vendor_fields,lawruler_ref_no,source_system')
    .eq('firm_id', access.firm_id).in('id', ids.slice(i, i + 100)).is('archived_at', null)));
  let refs: any[] = [];
  if (access.scope === 'approved_sources') {
    // Composite PK has no id; paginate using its unique source-lead key within this scope.
    for (let offset = 0; ; offset += 500) {
      const result = await db.from('partner_source_leads').select('partner_key,firm_id,source_system,source_lead_id')
        .eq('partner_key', PARTNER_REPORT_KEY).eq('firm_id', access.firm_id).eq('source_system', 'lawruler')
        .order('source_lead_id', { ascending: true }).range(offset, offset + 499);
      if (result.error) throw new Error('Report source approvals unavailable');
      refs.push(...(result.data || []));
      if ((result.data || []).length < 500) break;
    }
  }
  const signatures = await loadSignatureReport(db, campaign.data);
  return { ...partnerReportData(access, leads, claims, signatures, refs), updatedAt: new Date().toISOString() };
}
