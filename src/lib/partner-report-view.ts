import type { PartnerReportRow, PartnerReportSummary } from './partner-report';

export function reportDay(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/Los_Angeles', year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function shiftDay(day: string, count: number) {
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+count); return d.toISOString().slice(0,10);
}
export function datePreset(preset: string, now: string) {
  const today = reportDay(now);
  if (preset === 'Last 14 days') return { from:shiftDay(today,-13),to:today };
  if (preset === 'Last 7 days') return { from:shiftDay(today,-6),to:today };
  if (preset === 'Last 30 days') return { from:shiftDay(today,-29),to:today };
  if (preset === 'This month') return { from:today.slice(0,7)+'-01',to:today };
  return { from:'',to:'' };
}
export function inReportRange(row: PartnerReportRow, from: string, to: string, basis: 'receivedAt'|'signedAt' = 'receivedAt') {
  if (!from && !to) return true;
  const day = reportDay(row[basis]);
  return !!day && (!from || day >= from) && (!to || day <= to);
}
export function summarizePartnerRows(rows: PartnerReportRow[]): PartnerReportSummary {
  const summary: PartnerReportSummary = { total:rows.length,signed:0,unsigned:0,verify:0,called:0,awaitingDelivery:0,sentToFirm:0,declined:0,
    inProgress:0,lost:0,signRate:0,averageSpeedMinutes:null,speedSamples:0 };
  let speed = 0;
  for (const r of rows) {
    if (r.called) summary.called++;
    if (r.signed === 'Yes') {
      summary.signed++;
      if (r.deliveryGroup === 'declined') summary.declined++;
      else if (r.deliveryGroup === 'sent') summary.sentToFirm++;
      else summary.awaitingDelivery++;
    } else {
      if (r.signed === 'Check signature') summary.verify++; else summary.unsigned++;
      if (['new','contacting','esign_sent'].includes(r.statusKey)) summary.inProgress++;
      if (['dq','external_dq_review','not_interested'].includes(r.statusKey)) summary.lost++;
    }
    if (r.speedMinutes != null && Number.isFinite(r.speedMinutes) && r.speedMinutes >= 0) { speed += r.speedMinutes; summary.speedSamples++; }
  }
  summary.signRate = summary.total ? summary.signed / summary.total : 0;
  summary.averageSpeedMinutes = summary.speedSamples ? speed / summary.speedSamples : null;
  return summary;
}
export function groupPartnerRows(rows: PartnerReportRow[], by: 'week'|'state') {
  const groups = new Map<string,PartnerReportRow[]>();
  for (const row of rows) {
    const day = reportDay(row.receivedAt);
    const key = by === 'state' ? row.state || 'Not recorded' : !day ? 'Not recorded' : shiftDay(day, -((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
    groups.set(key,[...(groups.get(key)||[]),row]);
  }
  return [...groups].map(([key,items]) => ({ key,...summarizePartnerRows(items) })).sort((a,b) =>
    a.key === 'Not recorded' ? 1 : b.key === 'Not recorded' ? -1 : by === 'week' ? b.key.localeCompare(a.key) : b.total-a.total || a.key.localeCompare(b.key));
}
export type ReportSortKey = keyof PartnerReportRow;
export function sortPartnerRows(rows: PartnerReportRow[], key: ReportSortKey, direction: 'asc'|'desc') {
  return [...rows].sort((a,b) => {
    const av = a[key], bv = b[key];
    if (av == null || av === '') return bv == null || bv === '' ? a.name.localeCompare(b.name) : 1;
    if (bv == null || bv === '') return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av-bv : typeof av === 'boolean' && typeof bv === 'boolean' ? Number(av)-Number(bv) :
      ['receivedAt','signedAt','lastActivityAt'].includes(key) ? Date.parse(String(av))-Date.parse(String(bv)) : String(av).localeCompare(String(bv));
    return (direction === 'asc' ? cmp : -cmp) || a.name.localeCompare(b.name);
  });
}
export function reportDate(value: string | null) {
  if (!value) return 'Not recorded';
  const onlyDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat('en-US', { timeZone:onlyDay?'UTC':'America/Los_Angeles', dateStyle:'medium',...(!onlyDay ? { timeStyle:'short' as const } : {}) }).format(new Date(value)) + (onlyDay?' · time not recorded':'');
}
export function reportDuration(seconds: number | null): string {
  if (seconds == null) return 'Not recorded';
  const s = Math.round(seconds), hours = Math.floor(s/3600), minutes = Math.floor((s%3600)/60);
  return hours ? `${hours}h ${minutes}m ${s%60}s` : `${minutes}m ${s%60}s`;
}
export const REPORT_COLUMNS: { key:ReportSortKey; label:string }[] = [
  {key:'name',label:'Full name'},{key:'phone',label:'Phone #'},{key:'receivedAt',label:'Date received'},
  {key:'called',label:'Called'},{key:'signed',label:'Signed'},{key:'signedAt',label:'Date signed'},
  {key:'status',label:'Current status'},{key:'speedMinutes',label:'Speed to lead'},
  {key:'callDurationSeconds',label:'Call duration'},{key:'state',label:'State'},
  {key:'lastActivityAt',label:'Last activity'},{key:'dqKind',label:'DQ outcome'},{key:'dqReason',label:'DQ reason'},{key:'notes',label:'Marketer explanation'},{key:'dqReview',label:'Review status'},
];
export function reportCell(row:PartnerReportRow,key:ReportSortKey) {
  if (['receivedAt','signedAt','lastActivityAt'].includes(key)) return reportDate(row[key] as string|null);
  if (key === 'called') return row.called?'Yes':'No';
  if (key === 'speedMinutes') return reportDuration(row.speedMinutes == null?null:row.speedMinutes*60);
  if (key === 'callDurationSeconds') return reportDuration(row.callDurationSeconds);
  return String(row[key] ?? 'Not recorded');
}
export function partnerCsv(rows:PartnerReportRow[]) {
  const escape = (v:string) => '"'+(/^[\s]*[=+@-]/.test(v)?"'":'')+v.replace(/"/g,'""')+'"';
  return '\uFEFF'+[REPORT_COLUMNS.map(c=>c.label),...rows.map(r=>REPORT_COLUMNS.map(c=>reportCell(r,c.key)))].map(r=>r.map(escape).join(',')).join('\r\n');
}
