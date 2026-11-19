// Partner-visible firm status audit. This projection contains only 30-day review facts.
// Keep any private commercial reconciliations outside the partner response.
export type PartnerFirmAudit = {
  firmPhase: string | null;
  firmPhaseAt: string | null;
  cancellationNoticeAt: string | null;
  daysFromSignToFirmEvent: number | null;
  firmEventBasis: 'Notice date' | 'Archive phase date (unverified)' | null;
  thirtyDayReview: string;
  firmReportAsOf: string | null;
};
const phases = new Set(['Archived','Pending Drop','Treating','Collecting Medical Records']);
function isoDay(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value ? value : null;
}
function pacificDay(value: string | null): string | null {
  if (!value) return null;
  if (isoDay(value)) return value;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(d);
  const part = (key:string) => parts.find(x=>x.type===key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function publicFirmOutcomeAudit(answers: unknown, signedAt: string | null): PartnerFirmAudit {
  const value = answers && typeof answers === 'object'
    ? (answers as { firm_outcome_audit?: Record<string, unknown> }).firm_outcome_audit : null;
  const rawPhase = value?.phase;
  const firmPhase = typeof rawPhase === 'string' && phases.has(rawPhase) ? rawPhase : null;
  const firmPhaseAt = isoDay(value?.phase_date);
  const cancellationNoticeAt = firmPhase === 'Archived' ? isoDay(value?.notice_date) : null;
  const firmReportAsOf = isoDay(value?.source_as_of);
  const eventDay = firmPhase === 'Archived' ? cancellationNoticeAt || firmPhaseAt : null;
  const signedDay = pacificDay(signedAt);
  const gap = eventDay && signedDay ? Math.round(
    (Date.parse(eventDay + 'T00:00:00Z') - Date.parse(signedDay + 'T00:00:00Z')) / 86400000
  ) : null;
  const daysFromSignToFirmEvent = gap != null && gap >= 0 ? gap : null;
  const firmEventBasis = eventDay ? (cancellationNoticeAt ? 'Notice date' as const : 'Archive phase date (unverified)' as const) : null;
  const thirtyDayReview = !firmPhase ? 'Not in latest firm report'
    : firmPhase === 'Pending Drop' ? 'Pending drop; cancellation date unverified'
    : firmPhase !== 'Archived' ? 'No cancellation reported in firm snapshot'
    : daysFromSignToFirmEvent == null ? 'Signing or event date needs verification'
    : !cancellationNoticeAt ? 'Archive date only; verify cancellation notice'
    : daysFromSignToFirmEvent <= 30 ? 'Notice within 30 days; verify effective date'
    : 'Notice after 30 days; verify effective date';
  return { firmPhase, firmPhaseAt, cancellationNoticeAt, daysFromSignToFirmEvent, firmEventBasis, thirtyDayReview, firmReportAsOf };
}
