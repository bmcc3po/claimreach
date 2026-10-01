// The post-Day-2 manual call windows. A durable task must supply the number of
// completed follow-up attempts; elapsed time alone never advances a missed call.
const HOURS = [8, 12, 17] as const;

function localYmd(iso: string, zone: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (name: string) => Number(parts.find((p) => p.type === name)?.value);
  return [value("year"), value("month"), value("day")];
}

function localToUtc(y: number, m: number, d: number, hour: number, zone: string): Date {
  const target = Date.UTC(y, m - 1, d, hour);
  let candidate = target;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = fmt.formatToParts(new Date(candidate));
    const val = (name: string) => Number(parts.find((p) => p.type === name)?.value);
    const shown = Date.UTC(val("year"), val("month") - 1, val("day"), val("hour"));
    candidate += target - shown;
  }
  const [cy, cm, cd] = localYmd(new Date(candidate).toISOString(), zone);
  if (cy !== y || cm !== m || cd !== d) throw new Error("Could not resolve the lead-local call window.");
  return new Date(candidate);
}

export function localDateKey(date: Date, zone: string): string { return localYmd(date.toISOString(), zone).join("-"); }

/** 08:00 inclusive, 21:00 exclusive on weekdays in the lead's time zone. */
export function nextPermittedCall(date: Date, zone: string): Date {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid call timestamp.");
  const [y, m, d] = localYmd(date.toISOString(), zone);
  const day = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 8; i++) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
      const open = localToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 8, zone);
      const close = localToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 21, zone);
      if (date < open) return open;
      if (date < close) return date;
    }
    day.setUTCDate(day.getUTCDate() + 1);
    date = localToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 8, zone);
  }
  throw new Error("Could not find a permitted call window.");
}

export function nextWeekdayOpening(after: Date, zone: string): Date {
  const [y, m, d] = localYmd(after.toISOString(), zone);
  const day = new Date(Date.UTC(y, m - 1, d + 1));
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  return localToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 8, zone);
}

export function nextThreePerDayWindowAfter(after: Date, zone: string): Date {
  const [y, m, d] = localYmd(after.toISOString(), zone);
  const day = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 8; i++) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
      for (const hour of HOURS) {
        const candidate = localToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, zone);
        if (candidate > after) return candidate;
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  throw new Error("Could not find a follow-up window.");
}

/** First follow-up window is 08:00 on the next permitted weekday. */
export function nextOngoingCall(dayTwoCompletedAt: string, completedFollowups: number, zone: string): Date {
  if (!Number.isInteger(completedFollowups) || completedFollowups < 0 || completedFollowups >= 15) throw new Error("Invalid completed follow-up count.");
  const [y, m, d] = localYmd(dayTwoCompletedAt, zone);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() + 1);
  let businessDays = Math.floor(completedFollowups / HOURS.length);
  while (true) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      if (businessDays === 0) break;
      businessDays--;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return localToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(),
    HOURS[completedFollowups % HOURS.length], zone);
}
