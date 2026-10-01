// Staff-facing calendar dates use the Pacific office clock. Persisted instants
// remain UTC; a lead's outreach windows use the lead's own time zone.
export const OFFICE_TIME_ZONE = "America/Los_Angeles";

function instant(at: string | Date): Date {
  const date = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid office-clock instant");
  return date;
}

export function officeDateISO(at: string | Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant(at));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function officeDateUS(at: string | Date = new Date()): string {
  const [year, month, day] = officeDateISO(at).split("-");
  return `${month}/${day}/${year}`;
}

export function officeDateTime(at: string | Date): string {
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TIME_ZONE, month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(instant(at))} PT`;
}
