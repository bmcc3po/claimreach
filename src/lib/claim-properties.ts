// ============================================================================
// claim_properties boundary rules — shared by the save route (/api/claim-intake)
// and the intake surfaces (ClaimIntake, GuidedIntake).
//
// Why this exists: the DB stores stay month/year as TWO integer columns
// (stay_month 1-12, stay_year), but the UI shows ONE "month & year" field whose
// value is a string like "10/1977". Left unnormalized, that string was written
// straight into an int column, which (a) threw `invalid input syntax for type
// integer` and (b) — because the route deleted the old rows before inserting —
// wiped the property answers. These helpers are the single place that converts
// between the UI shape and the column types, so neither surface can drift.
// ============================================================================

export const PROP_INT_COLS = new Set(["stay_month", "stay_year", "age_at_time", "sequence_order"]);
export const PROP_FLOAT_COLS = new Set(["lat", "lng"]);
export const PROP_BOOL_COLS = new Set([
  "under_18", "asked_staff_for_help", "police_emt_called", "repeatedly_same_motel",
  "specific_rooms_req", "housekeeping_entered", "dnd_long_periods", "condoms_visible",
  "staff_interact_traffk", "staff_interact_victim", "mgmt_intervened",
  "violence_public_areas", "drug_paraphernalia", "staff_witnessed_drugs", "has_variance",
]);
export const PROP_JSONB_COLS = new Set(["asked_whom", "men_waiting_areas", "variance_control"]);

// System / generated columns that must never be echoed back into the form's
// value bag (and never written back to the DB by the client).
const SYSTEM_COLS = new Set([
  "id", "claim_id", "firm_id", "created_at", "updated_at", "brand_mismatch", "custom",
]);

// "10/1977" | "10-1977" | "1" | 10 -> { month, year }. Best-effort and defensive:
// anything it can't read becomes null rather than throwing.
export function splitStayMonth(raw: any): { month: number | null; year: number | null } {
  if (raw === null || raw === undefined || raw === "") return { month: null, year: null };
  if (typeof raw === "number") return { month: Number.isFinite(raw) ? raw : null, year: null };
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{2,4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    let year = parseInt(m[2], 10);
    if (m[2].length === 2) year += year >= 50 ? 1900 : 2000; // 2-digit year heuristic
    return {
      month: month >= 1 && month <= 12 ? month : null,
      year: Number.isFinite(year) ? year : null,
    };
  }
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) {
    if (n >= 1 && n <= 12) return { month: n, year: null };
    if (n >= 1900 && n <= 2100) return { month: null, year: n };
  }
  return { month: null, year: null };
}

// month/year ints -> the single "MM/YYYY" string the UI's monthyear field shows.
export function joinStayMonth(month: any, year: any): string {
  const mm = month === null || month === undefined || month === "" ? null : month;
  const yy = year === null || year === undefined || year === "" ? null : year;
  if (yy != null) return `${mm ?? ""}/${yy}`;
  if (mm != null) return String(mm);
  return "";
}

function toInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function toFloat(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function toBool(v: any): boolean | null {
  if (v === true || v === false) return v;
  if (v === "true" || v === "yes" || v === "1" || v === 1) return true;
  if (v === "false" || v === "no" || v === "0" || v === 0) return false;
  return null;
}

// Server-side: coerce one writable claim_properties column to its DB type.
// Returns `undefined` to mean "omit this column" so the DB default / NULL applies
// (critical for NOT NULL DEFAULT columns like has_variance, and to keep an empty
// string out of an int/bool/jsonb column).
export function coercePropCol(col: string, v: any): any {
  if (col === "stay_month") { const s = splitStayMonth(v); return s.month === null ? undefined : s.month; }
  if (PROP_INT_COLS.has(col)) { const n = toInt(v); return n === null ? undefined : n; }
  if (PROP_FLOAT_COLS.has(col)) { const n = toFloat(v); return n === null ? undefined : n; }
  if (PROP_BOOL_COLS.has(col)) { const b = toBool(v); return b === null ? undefined : b; }
  if (PROP_JSONB_COLS.has(col)) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") return v;
    if (v === "" || v == null) return undefined;
    return [v];
  }
  if (v === "" || v === undefined) return undefined;
  return v;
}

// Client-side: turn a flat DB row into the form's `values` object. Recombines the
// two int columns into the single monthyear field and surfaces any `custom`
// (imported-form) fields at top level; drops system/generated columns.
export function dbRowToFormValues(row: Record<string, any>): Record<string, any> {
  const values: Record<string, any> = {};
  for (const k of Object.keys(row ?? {})) if (!SYSTEM_COLS.has(k)) values[k] = row[k];
  if (row?.custom && typeof row.custom === "object") Object.assign(values, row.custom);
  values.stay_month = joinStayMonth(row?.stay_month, row?.stay_year);
  return values;
}

// Client-side: reconstruct the `resolved` property object from a flat DB row so
// the guided runner shows the confirmed property and can re-verify canonical id.
export function dbRowToResolved(row: Record<string, any>): any {
  if (!row?.place_id) return undefined;
  return {
    place_id: row.place_id, name: row.name_as_recalled, address: row.address,
    lat: row.lat, lng: row.lng, current_brand: row.current_brand,
  };
}
