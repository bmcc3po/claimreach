import { mondayOf, pacificCalendarDay, pacificDay } from './packet-worklist';
import type { SignatureReportRow } from './signature-report';

export const PAYROLL_ZONE = 'America/Los_Angeles';
export const PAYROLL_GROUPS = {
  waiting: 'Signed · waiting to send', sent: 'Signed · sent to firm',
  hold: 'Waiting on attorney', dq: 'Signed · DQ before send', rejected: 'Sent · declined',
} as const;
export type PayrollGroup = keyof typeof PAYROLL_GROUPS;
export type PayrollFile = SignatureReportRow & { firmId: string; campaignId: string; leadId: string; campaign: string; firm: string };
export type PayrollNote = { id: string; firm_id: string; claim_id: string; created_at: string;
  kind: 'attorney_hold' | 'attorney_release' | 'signature_date' | 'agent_credit' | 'reconcile'; data: Record<string, any> };
export type PayrollLine = { id: string; run_id: string | null; firm_id: string; claim_id: string; campaign_id: string;
  kind: 'billing' | 'commission' | 'firm_credit' | 'clawback'; source_line_id: string | null;
  period_start: string; data: { name: string; leadNo: string; href: string; agent: string; agentId?: string | null; signedDay: string; reason?: string; [key: string]: any } };
export type PayrollRun = { id: string; firm_id: string; period_start: string; period_end: string; closed_at: string; snapshot: PayrollReport };
export type PayrollRow = PayrollFile & { signedDay: string | null; group: PayrollGroup; holdReason: string; creditedAgent: string; creditedAgentId: string | null;
  bill: boolean; pay: boolean; blocked: string; originalPeriod: string | null };
export type PayrollAdjustment = { sourceId: string; claimId: string; firmId: string; campaignId: string; kind: 'firm_credit' | 'clawback';
  name: string; leadNo: string; href: string; agent: string; agentId?: string | null; signedDay: string;
  originalPeriod: string; rejectedAt: string; reason: string; declineSource?: 'bmc' | 'firm' };
export type PayrollReport = { start: string; end: string; cutoff: string; asOf: string; rows: PayrollRow[]; carried: PayrollRow[];
  undated: PayrollRow[]; adjustments: PayrollAdjustment[]; unresolved: PayrollRow[]; rejectionReview: PayrollRow[] };

export function validDay(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
}
export function addDays(day: string, days: number) { return new Date(Date.parse(day + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
export function payrollPeriod(end: string) {
  if (!validDay(end) || new Date(end + 'T12:00:00Z').getUTCDay() !== 0) throw new Error('Choose a Sunday for the pay-period ending date.');
  return { start: addDays(end, -6), end, cutoff: addDays(end, 3) };
}
export function defaultPayrollEnd(now: string) { return addDays(mondayOf(pacificDay(now)), -1); }
const newest = (a: PayrollNote, b: PayrollNote) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
export function processedLine(line: PayrollLine, notes: PayrollNote[]) {
  const correction = notes.filter(n => n.firm_id === line.firm_id && n.claim_id === line.claim_id && n.kind === 'reconcile' && n.data.line_id === line.id).sort(newest)[0];
  return correction ? correction.data.processed === true : true;
}
/** Current facts select the signature-week cohort. Closing copies this result;
 * it never edits a past run, starts a delivery clock, or transfers money. */
export function payrollReport(files: PayrollFile[], notes: PayrollNote[], lines: PayrollLine[], end: string, now: string): PayrollReport {
  const period = payrollPeriod(end);
  const report: PayrollReport = { ...period, asOf: now, rows: [], carried: [], undated: [], adjustments: [], unresolved: [], rejectionReview: [] };
  const activeNotes = notes.filter(n => Date.parse(n.created_at) <= Date.parse(now));
  for (const f of files) {
    if (f.test) continue;
    const ownNotes = activeNotes.filter(n => n.firm_id === f.firmId && n.claim_id === f.claimId).sort(newest);
    const signing = ownNotes.find(n => n.kind === 'signature_date');
    const signedDay = f.signedAt ? pacificCalendarDay(f.signedAt) : validDay(signing?.data.day) ? signing!.data.day : null;
    const holding = ownNotes.find(n => n.kind === 'attorney_hold' || n.kind === 'attorney_release');
    const hold = holding?.kind === 'attorney_hold';
    const credit = ownNotes.find(n => n.kind === 'agent_credit');
    const agentId = credit?.data.agent_id || f.agentId || null;
    const agent = credit?.data.agent_name || f.agentName || f.agent;
    const sent = !!f.deliveredAt || f.ownerSent;
    const rejected = f.declined === true || f.decisionKey === 'turned_down';
    const declineSource = f.declined ? f.declineSource || (f.declineOutcome === 'Firm declined' ? 'firm' : 'bmc') : 'firm';
    const decisionAt = f.declined ? f.declinedAt : f.decisionAt;
    const rejectionReason = (f.declined ? f.declineReason : f.firmReason) || (declineSource === 'bmc' ? 'BMC declined' : 'Firm declined');
    const group: PayrollGroup = sent && rejected ? 'rejected' : !sent && (f.disqualified || rejected) ? 'dq' : hold ? 'hold' : sent ? 'sent' : 'waiting';
    const ownLines = lines.filter(l => l.firm_id === f.firmId && l.claim_id === f.claimId && l.campaign_id === f.campaignId);
    const row: PayrollRow = { ...f, signedDay, group, holdReason: hold ? holding!.data.reason || 'Waiting on attorney' : '',
      creditedAgent: agent, creditedAgentId: agentId, originalPeriod: signedDay ? mondayOf(signedDay) : null,
      bill: false, pay: false, blocked: '' };
    // Archive cannot hide a financial obligation already recorded in payroll.
    if (rejected && decisionAt && Number.isFinite(Date.parse(decisionAt))) {
      for (const paid of ownLines.filter(l => ['billing', 'commission'].includes(l.kind) && l.period_start < period.start)) {
        if (!processedLine(paid, activeNotes) || ownLines.some(l => l.source_line_id === paid.id)) continue;
        if (pacificDay(decisionAt) > period.cutoff || Date.parse(decisionAt) > Date.parse(now)) continue;
        report.adjustments.push({ sourceId: paid.id, claimId: f.claimId, firmId: f.firmId, campaignId: f.campaignId,
          kind: paid.kind === 'billing' ? 'firm_credit' : 'clawback', ...paid.data,
          originalPeriod: paid.period_start, rejectedAt: decisionAt, reason: rejectionReason, declineSource });
      }
    }
    if (f.archived) continue;
    if (f.state !== 'signed') { if (f.state === 'verify') report.unresolved.push(row); continue; }
    if (!signedDay) { report.undated.push(row); continue; }
    if (signedDay > period.end) continue;
    row.blocked = rejected ? (declineSource === 'bmc' ? 'BMC declined' : 'Firm declined') : f.disqualified ? 'Disqualified' : hold ? 'Waiting on attorney' : !sent ? 'Not sent to firm' : '';
    row.bill = !row.blocked && !ownLines.some(l => l.kind === 'billing');
    row.pay = !row.blocked && !!agentId && !ownLines.some(l => l.kind === 'commission');
    if (!row.blocked && !agentId) row.blocked = 'Choose the credited agent before commission';
    if (signedDay < period.start && rejected && (!ownLines.some(l => ['billing','commission'].includes(l.kind)) || !decisionAt || !Number.isFinite(Date.parse(decisionAt)))) report.rejectionReview.push(row);
    if (signedDay >= period.start) report.rows.push(row);
    else if (row.bill || row.pay) report.carried.push(row);
  }
  for (const rows of [report.rows, report.carried, report.undated, report.unresolved, report.rejectionReview]) rows.sort((a, b) => a.name.localeCompare(b.name) || a.claimId.localeCompare(b.claimId));
  report.adjustments.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  return report;
}
export function payrollTotals(r: PayrollReport) {
  const all = [...r.rows, ...r.carried];
  return { groups: Object.fromEntries(Object.keys(PAYROLL_GROUPS).map(k => [k, r.rows.filter(row => row.group === k).length])) as Record<PayrollGroup, number>,
    bill: all.filter(f => f.bill).length, pay: all.filter(f => f.pay).length,
    credit: r.adjustments.filter(a => a.kind === 'firm_credit').length, clawback: r.adjustments.filter(a => a.kind === 'clawback').length };
}
/** Deal counts only. Older releases are kept outside this signature-period summary. */
export function payrollDealSummary(r: PayrollReport) {
  const agents = new Map<string, { agent: string; signed: number; payable: number; chargebacks: number; net: number }>();
  const get = (id: string | null | undefined, name: string) => {
    const key = id ? 'id:' + id : 'name:' + name;
    let row = agents.get(key);
    if (!row) { row = { agent: name || 'Agent not recorded', signed: 0, payable: 0, chargebacks: 0, net: 0 }; agents.set(key, row); }
    return row;
  };
  for (const file of r.rows) {
    const row = get(file.creditedAgentId, file.creditedAgent);
    row.signed++;
    if (file.pay) row.payable++;
  }
  for (const adjustment of r.adjustments) {
    if (adjustment.kind === 'clawback') get(adjustment.agentId, adjustment.agent).chargebacks++;
  }
  const rows = [...agents.values()].sort((a, b) => a.agent.localeCompare(b.agent));
  for (const row of rows) row.net = row.payable - row.chargebacks;
  const total = rows.reduce((sum, row) => ({ agent: 'Total', signed: sum.signed + row.signed,
    payable: sum.payable + row.payable, chargebacks: sum.chargebacks + row.chargebacks, net: sum.net + row.net }),
    { agent: 'Total', signed: 0, payable: 0, chargebacks: 0, net: 0 });
  return { rows, total };
}
const csvCell = (v: unknown) => '"' + (typeof v === 'number' ? String(v) : String(v ?? '').replace(/^[\s]*[=+@-]/, "'$&")).replace(/"/g, '""') + '"';
export function payrollSummaryCsv(r: PayrollReport) {
  const summary = payrollDealSummary(r);
  const rows = [
    ['Period start', 'Period end', 'Agent', 'Signed this period', 'Payable this period', 'Prior-period chargebacks', 'Net deals to pay'],
    ...[...summary.rows, summary.total].map(row => [r.start, r.end, row.agent, row.signed, row.payable, row.chargebacks, row.net]),
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function payrollCsv(r: PayrollReport) {
  const header = ['Period start', 'Period end', 'Client', 'Lead #', 'Campaign', 'Agent', 'Signed (Pacific)', 'Group', 'Bill', 'Pay commission', 'Credit firm', 'Clawback', 'Original period', 'Reason', 'Link'];
  const rows = [...r.rows, ...r.carried].map(f => [r.start,r.end,f.name,f.leadNo,f.campaign,f.creditedAgent,f.signedDay,PAYROLL_GROUPS[f.group],f.bill ? 1 : 0,f.pay ? 1 : 0,0,0,f.originalPeriod,[f.blocked,f.declineReason || f.firmReason].filter(Boolean).join(': '),'https://claimreach.com'+f.href]);
  rows.push(...r.adjustments.map(a => [r.start,r.end,a.name,a.leadNo,'',a.agent,a.signedDay,'Prior-period adjustment',0,0,a.kind === 'firm_credit' ? 1 : 0,a.kind === 'clawback' ? 1 : 0,a.originalPeriod,a.reason,'https://claimreach.com'+a.href]));
  return '\uFEFF' + [header,...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}
