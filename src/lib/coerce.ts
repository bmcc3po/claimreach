// ============================================================================
// Save-boundary coercion for lead-column writes.
//
// The bug this kills: the contact/case forms send an empty string for a field
// the caller left blank. That's fine for a text column, but Postgres rejects ""
// for date, numeric, and uuid columns with "invalid input syntax for type
// date/…". Because an update is all-or-nothing, one blank date threw away every
// other change on the form. Empty string means "no value", so it must become
// NULL before the write. NULL is equally valid for the text columns, so we can
// blanket-convert without a per-column type map.
// ============================================================================

export function nullifyEmpty<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    out[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out as T;
}
