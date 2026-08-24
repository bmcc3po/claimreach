// One place for drip campaign scoping. Staff Settings and /m6/drips both
// read drip_rules. Motel 6 rows use campaign = 'motel6' (migration 0092).
// Generic TMT / prison sequences keep campaign null.

export const DRIP_CAMPAIGN_NONE = "_none";
export const M6_DRIP_CAMPAIGN = "motel6";

export type DripCampaignClause =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "eq"; value: string };

export function dripCampaignClause(campaign: string | null | undefined): DripCampaignClause {
  const raw = (campaign ?? "").trim();
  if (!raw) return { kind: "all" };
  if (raw === DRIP_CAMPAIGN_NONE) return { kind: "none" };
  return { kind: "eq", value: raw };
}

export function dripCampaignLabel(key: string | null | undefined): string {
  if (!key || key === DRIP_CAMPAIGN_NONE) return "Unscoped";
  if (key === M6_DRIP_CAMPAIGN) return "Motel 6";
  return key;
}

export function dripChannelLabel(channel: string | null | undefined): string {
  if (channel === "sms") return "Text";
  if (channel === "email") return "Email";
  if (channel === "call_reminder") return "Call reminder";
  return channel || "—";
}

export function dripAssignLabel(assign: string | null | undefined): string {
  if (assign === "case_manager") return "Case manager";
  if (assign === "both") return "Both";
  return "Agent";
}

// Campaign-scoped rules need a step_key (unique with campaign). Never reuse
// an existing key on edit — that would collide with the 0092 walker rows.
export function dripStepKey(name: string, existing?: string | null): string {
  const keep = (existing ?? "").trim();
  if (keep) return keep;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `custom_${slug || "step"}_${suffix}`;
}

export function sortDripRules<T extends { stage?: string | null; delay_days?: number | null; every_days?: number | null; name?: string | null }>(rules: T[]): T[] {
  return [...rules].sort((a, b) => {
    const sa = String(a.stage ?? "99");
    const sb = String(b.stage ?? "99");
    if (sa !== sb) return sa.localeCompare(sb, undefined, { numeric: true });
    const da = a.delay_days ?? a.every_days ?? 0;
    const db = b.delay_days ?? b.every_days ?? 0;
    if (da !== db) return da - db;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

export function collectDripCampaignKeys(rules: { campaign?: string | null }[]): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    const c = (r.campaign ?? "").trim();
    if (c) set.add(c);
  }
  return Array.from(set).sort((a, b) => {
    if (a === M6_DRIP_CAMPAIGN) return -1;
    if (b === M6_DRIP_CAMPAIGN) return 1;
    return a.localeCompare(b);
  });
}
