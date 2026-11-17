/** PR Digital response clock: ClaimReach receipt to the next recorded outbound.
 * Nationwide observed federal holidays (OPM), not DC-only Inauguration Day.
 * https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
 */
export const RESPONSE_TIME_POLICY = 'Monday–Friday, 8:00 a.m.–5:30 p.m. Pacific, excluding observed federal holidays';
export const RESPONSE_TIME_BASIS = 'ClaimReach receipt to first recorded outbound after receipt';
const zone = 'America/Los_Angeles';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' });
const isoDay = (ms: number) => {
  const p = dayFormat.formatToParts(ms), get = (key: string) => p.find(x => x.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const dayMs = (day: string) => Date.parse(day + 'T12:00:00Z');
const shift = (day: string, days: number) => new Date(dayMs(day) + days * 86400000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(dayMs(day)).getUTCDay();
const nth = (year: number, month: number, dow: number, n: number) => {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  return shift(first, (dow - weekday(first) + 7) % 7 + (n - 1) * 7);
};
const observed = (day: string) => shift(day, weekday(day) === 6 ? -1 : weekday(day) === 0 ? 1 : 0);
const holidayCache = new Map<number, Set<string>>();
export function federalHolidays(year: number): ReadonlySet<string> {
  if (holidayCache.has(year)) return holidayCache.get(year)!;
  const days = new Set<string>();
  // Adjacent New Year's Day can be observed on December 31 of this year.
  for (const y of [year - 1, year, year + 1]) {
    for (const md of ['01-01', '07-04', '11-11', '12-25', ...(y >= 2021 ? ['06-19'] : [])]) days.add(observed(`${y}-${md}`));
    days.add(nth(y, 1, 1, 3)); days.add(nth(y, 2, 1, 3));
    const mayLast = `${y}-05-31`; days.add(shift(mayLast, -((weekday(mayLast) + 6) % 7)));
    days.add(nth(y, 9, 1, 1)); days.add(nth(y, 10, 1, 2)); days.add(nth(y, 11, 4, 4));
  }
  const result = new Set([...days].filter(d => d.startsWith(String(year) + '-')));
  holidayCache.set(year, result); return result;
}
export function responseTimestamp(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}
function businessBoundary(day: string, minutes: number) {
  // Noon UTC is 4/5 a.m. Pacific on the same date. DST has settled before opening.
  const utcNoon = dayMs(day), localHour = Number(hourFormat.format(utcNoon));
  return utcNoon + (minutes - localHour * 60) * 60000;
}
export function businessResponseMinutes(receivedAt: string | null, outboundAt: string | null): number | null {
  if (!responseTimestamp(receivedAt) || !responseTimestamp(outboundAt)) return null;
  const start = Date.parse(receivedAt!), end = Date.parse(outboundAt!);
  if (end < start) return null;
  let total = 0;
  const last = isoDay(end);
  for (let day = isoDay(start); day <= last; day = shift(day, 1)) {
    if ([0, 6].includes(weekday(day)) || federalHolidays(Number(day.slice(0, 4))).has(day)) continue;
    const opening = businessBoundary(day, 8 * 60), closing = businessBoundary(day, 17 * 60 + 30);
    total += Math.max(0, Math.min(end, closing) - Math.max(start, opening));
  }
  return total / 60000;
}
