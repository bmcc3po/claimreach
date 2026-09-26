// ============================================================================
// One URL convention for a lead, on the desktop site and in the App:
//
//   claimreach.com/leads/TMP-1042      the full file (desktop site)
//   claimreach.com/app/TMP-1042        the call screen (App)
//   claimreach.com/leads/lr/265230     by LawRuler lead ID, desktop site
//   claimreach.com/app/lr/265230       by LawRuler lead ID, App
//
// The long internal ID still works in every one of those spots (old links,
// emails); the page then shows the lead-number address in the bar.
// ============================================================================

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LEAD_NO_RE = /^[A-Za-z]{1,8}-\d{1,9}$/;

/**
 * The internal ID for whatever sits in the URL: the internal ID itself or a
 * lead number like TMP-1042 (any capitalization). Runs as the signed-in user,
 * so RLS decides what they can open. A lead number shared by two firms opens
 * the open file first, then the newest.
 */
export async function resolveLeadKey(sb: any, raw: string | null | undefined): Promise<string | null> {
  let key = String(raw || "").trim();
  try { key = decodeURIComponent(key); } catch { /* keep as typed */ }
  if (UUID_RE.test(key)) return key;
  if (!LEAD_NO_RE.test(key)) return null;
  const { data } = await sb.from("leads").select("id, archived_at, created_at")
    .eq("lead_no", key.toUpperCase()).order("created_at", { ascending: false }).limit(5);
  const rows = data ?? [];
  return (rows.find((r: any) => !r.archived_at) || rows[0])?.id ?? null;
}

/** The address a lead should show: its lead number when it has one. */
export function leadKeyOf(lead: { id: string; lead_no?: string | null }): string {
  return lead.lead_no && LEAD_NO_RE.test(lead.lead_no) ? lead.lead_no : lead.id;
}
