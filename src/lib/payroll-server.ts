import { gateUser } from './gate';
import { loadSignatureReport, reportPages } from './signature-report-loader';
import { payrollReport, payrollPeriod, type PayrollFile, type PayrollNote, type PayrollLine, type PayrollRun } from './payroll';

export async function payrollOwner(db: any) {
  const me = await gateUser(db);
  return me?.role === 'owner' ? me : null;
}
export type PayrollData = { files: PayrollFile[]; notes: PayrollNote[]; lines: PayrollLine[]; runs: PayrollRun[];
  firms: { id: string; name: string }[]; agents: { id: string; full_name: string }[] };
export async function loadPayroll(db: any): Promise<PayrollData> {
  const campaigns = await reportPages(() => db.from('campaigns').select('id,name,firm_id,firm_email').eq('case_type', 'mva'));
  const firmIds = [...new Set(campaigns.map(c => c.firm_id))];
  const files: PayrollFile[] = [], notes: PayrollNote[] = [], lines: PayrollLine[] = [], runs: PayrollRun[] = [], firms: { id: string; name: string }[] = [];
  for (const firmId of firmIds) {
    const [firm, ns, ls, rs] = await Promise.all([
      db.from('firms').select('id,name').eq('id', firmId).single(),
      reportPages(() => db.from('cr_payroll_notes').select('*').eq('firm_id', firmId)),
      reportPages(() => db.from('cr_payroll_lines').select('*').eq('firm_id', firmId)),
      reportPages(() => db.from('cr_payroll_runs').select('*').eq('firm_id', firmId)),
    ]);
    if (firm.error || !firm.data) throw new Error('Could not read the payroll firm. No totals were finalized.');
    firms.push(firm.data); notes.push(...ns); lines.push(...ls); runs.push(...rs);
    for (const c of campaigns.filter(c => c.firm_id === firmId)) {
      const rows = await loadSignatureReport(db, c);
      files.push(...rows.map(r => ({ ...r, firmId, campaignId: c.id, leadId: r.leadId!, campaign: c.name, firm: firm.data.name })));
    }
  }
  const agents = await reportPages(() => db.from('app_users').select('id,full_name').eq('active', true).in('role', ['owner','admin','manager','qa','agent']));
  return { files, notes, lines, runs, firms, agents };
}
export function reportForFirm(data: PayrollData, firmId: string, end: string, now: string) {
  return payrollReport(data.files.filter(f => f.firmId === firmId), data.notes.filter(n => n.firm_id === firmId), data.lines.filter(l => l.firm_id === firmId), end, now);
}
export function payrollView(data: PayrollData, end: string, now: string) {
  const period = payrollPeriod(end);
  const sections = data.firms.map(firm => {
    const closed = data.runs.find(r => r.firm_id === firm.id && r.period_end === end);
    return { firm, closedAt: closed?.closed_at || null, report: closed?.snapshot || reportForFirm(data, firm.id, end, now) };
  });
  return { ...period, sections, agents: data.agents, lines: data.lines, notes: data.notes };
}
export async function payrollToken(data: PayrollData, end: string) {
  const bytes = new TextEncoder().encode(JSON.stringify({ end, ...data }));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2,'0')).join('');
}
export function payrollClosePayload(data: PayrollData, end: string, now: string) {
  const runs: any[] = [], lines: any[] = [];
  for (const firm of data.firms) {
    if (data.runs.some(r => r.firm_id === firm.id && r.period_end === end)) continue;
    if (data.runs.some(r => r.firm_id === firm.id && r.period_end > end)) throw new Error('This period predates a closed payroll. Use reconciliation to record a historical correction.');
    const report = reportForFirm(data, firm.id, end, now);
    const runId = crypto.randomUUID();
    runs.push({ id: runId, firm_id: firm.id, period_start: report.start, period_end: end, snapshot: report });
    for (const f of [...report.rows, ...report.carried]) {
      for (const kind of ['billing','commission'] as const) {
        if (!(kind === 'billing' ? f.bill : f.pay)) continue;
        lines.push({ firm_id: firm.id, claim_id: f.claimId, campaign_id: f.campaignId, run_id: runId, period_start: report.start,
          kind, source_line_id: null, data: { name: f.name, leadNo: f.leadNo, href: f.href, campaign: f.campaign, agent: f.creditedAgent,
            agentId: f.creditedAgentId, signedDay: f.signedDay, assumption: 'Processed from the owner-approved Wednesday payroll; reconcile monthly with Wave.' } });
      }
    }
    for (const a of report.adjustments) lines.push({ firm_id: firm.id, claim_id: a.claimId, campaign_id: a.campaignId,
      run_id: runId, period_start: report.start, kind: a.kind, source_line_id: a.sourceId, data: a });
  }
  return { p_runs: runs, p_lines: lines };
}
