import { reportPages, loadSignatureReport } from './signature-report-loader';
import { PARTNER_REPORT_KEY, validReportAccess, type ReportAccess } from './partner-report-access';
import { partnerReportData, partnerAllowedLeads } from './partner-report';

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
  const claims = await reportPages(() => db.from('claims').select('id,lead_id,firm_id,campaign_id,claim_type,status,dq_reason_key,dq_explanation')
    .eq('firm_id', access.firm_id));
  const ids = [...new Set(claims.filter(c => c.campaign_id === access.campaign_id && c.claim_type === 'mva').map(c => c.lead_id))];
  const leads: any[] = [];
  for (let i = 0; i < ids.length; i += 100) leads.push(...await reportPages(() => db.from('leads')
    .select('id,firm_id,claimant_name,first_name,last_name,phone,lawruler_created_at,created_at,first_dialed_at,last_called_at,archived_at,vendor_fields,lawruler_ref_no,source_system,mail_state')
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
  // Evidence stays inside the existing approved lead set before public projection.
  const eligible = new Set(partnerAllowedLeads(access,leads,refs).map(l => l.id));
  const scopedIds = ids.filter(id => eligible.has(id));
  const evidenceRows = async (table:string, columns:string) => {
    const rows:any[] = [];
    for (let i=0;i<scopedIds.length;i+=100) rows.push(...await reportPages(() => db.from(table).select(columns)
      .eq('firm_id',access.firm_id).in('lead_id',scopedIds.slice(i,i+100))));
    return rows;
  };
  const [signatures,calls,callLogs,reasons,statuses] = await Promise.all([
    loadSignatureReport(db,campaign.data),
    evidenceRows('communications','id,firm_id,lead_id,channel,direction,occurred_at,duration_sec'),
    evidenceRows('call_logs','id,firm_id,lead_id,claim_id,created_at'),
    db.from('dq_reasons').select('key,label'),
    db.from('statuses').select('key,label,qualify,phase,track'),
  ]);
  if (reasons.error || statuses.error) throw new Error('Report reason catalog unavailable');
  return { ...partnerReportData(access, leads, claims, signatures, refs, { calls,callLogs,reasons:reasons.data || [],statuses:statuses.data || [] }), updatedAt: new Date().toISOString() };
}
