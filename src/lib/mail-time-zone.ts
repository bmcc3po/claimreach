// Infer only when the mailing location identifies one time zone reliably.
// Multi-zone states stay unset until a person verifies them, except the
// Dallas/Fort Worth ZIP area (75/76), which is wholly in Central time.
const SINGLE_ZONE: Record<string, string> = {
  AL: "America/Chicago", AR: "America/Chicago", CA: "America/Los_Angeles",
  CO: "America/Denver", CT: "America/New_York", DC: "America/New_York",
  DE: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  IA: "America/Chicago", IL: "America/Chicago", LA: "America/Chicago",
  MA: "America/New_York", MD: "America/New_York", ME: "America/New_York",
  MN: "America/Chicago", MO: "America/Chicago", MS: "America/Chicago",
  MT: "America/Denver", NC: "America/New_York", NH: "America/New_York",
  NJ: "America/New_York", NM: "America/Denver", NV: "America/Los_Angeles",
  NY: "America/New_York", OH: "America/New_York", OK: "America/Chicago",
  PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  UT: "America/Denver", VA: "America/New_York", VT: "America/New_York",
  WA: "America/Los_Angeles", WI: "America/Chicago", WV: "America/New_York",
  WY: "America/Denver",
};

export function inferMailTimeZone(state?: string | null, zip?: string | null): string | null {
  const st = String(state || "").trim().toUpperCase();
  const postal = String(zip || "").trim();
  if (st === "TX" && /^(75|76)\d{3}(?:-\d{4})?$/.test(postal)) return "America/Chicago";
  return SINGLE_ZONE[st] || null;
}

export function timeZoneLabel(value?: string | null): string {
  const labels: Record<string, string> = {
    "America/New_York": "Eastern", "America/Chicago": "Central",
    "America/Denver": "Mountain", "America/Phoenix": "Arizona",
    "America/Los_Angeles": "Pacific", "America/Anchorage": "Alaska",
    "Pacific/Honolulu": "Hawaii",
  };
  return labels[String(value || "")] || String(value || "");
}

export function normalizeTimeZone(value?: string | null): string | null {
  const aliases: Record<string, string> = {
    Eastern: "America/New_York", Central: "America/Chicago",
    Mountain: "America/Denver", Arizona: "America/Phoenix",
    Pacific: "America/Los_Angeles", Alaska: "America/Anchorage",
    Hawaii: "Pacific/Honolulu",
  };
  const raw = String(value || "").trim();
  return raw ? aliases[raw] || raw : null;
}

