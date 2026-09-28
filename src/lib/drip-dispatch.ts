// ============================================================================
// Drip controls, defined once for the drip route and the drip cron.
//
// 1. Kill switch. Nothing is dispatched (no text, no note, no next_due move)
//    unless the DRIP_DISPATCH_ENABLED setting is exactly "on". The manual
//    "Run due drips" button and the scheduled cron both check it first.
// 2. Who may enroll or run drips: an ACTIVE internal account holding
//    drips.manage. gateUser() already returns null for a deactivated account.
// 3. Enrollment target: the lead must be visible through the caller's OWN
//    session (RLS) before the service client writes anything, and the
//    enrollment uses that lead's stored firm, never the caller's.
// ============================================================================
import type { GatedUser } from "@/lib/gate";

export const DRIP_OFF_MESSAGE =
  "Drip sending is off, so nothing was sent. It turns on only when the DRIP_DISPATCH_ENABLED setting is on.";

/** The kill switch. Off unless the setting is exactly "on". */
export function dripDispatchEnabled(env: Record<string, string | undefined> | undefined = (globalThis as any)?.process?.env): boolean {
  return env?.DRIP_DISPATCH_ENABLED === "on";
}

/** The one "sending is off" result both dispatchers return. */
export function dripOffResult() {
  return { ok: false as const, sending: "off" as const, fired: 0, error: DRIP_OFF_MESSAGE };
}

/** An active internal account with drips.manage. Firm logins never, whatever their overrides say. */
export function mayManageDrips(user: Pick<GatedUser, "role" | "can"> | null | undefined): boolean {
  return !!user && user.role !== "firm" && user.can("drips.manage");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enroll one lead in the active generic drip rules.
 * sb is the caller's session client (RLS applies); admin is the service
 * client and is only used after the session proves the lead is visible.
 */
export async function enrollLeadInDrips(
  sb: any, admin: any, user: Pick<GatedUser, "role" | "can"> | null, rawLeadId: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  if (!user) return { status: 401, body: { error: "unauthorized" } };
  if (!mayManageDrips(user)) return { status: 403, body: { error: "You do not have permission to manage drips." } };
  const leadId = String(rawLeadId ?? "").trim();
  if (!UUID_RE.test(leadId)) return { status: 400, body: { error: "lead_id required" } };

  // Visible to THIS caller, through their own session. A lead they cannot
  // see answers exactly like a lead that does not exist.
  const { data: lead, error: leadErr } = await sb.from("leads").select("id, firm_id").eq("id", leadId).maybeSingle();
  if (leadErr) return { status: 500, body: { error: `Could not check the file: ${leadErr.message}` } };
  if (!lead) return { status: 404, body: { error: "Lead not found." } };

  const { error } = await admin.rpc("enroll_drips_for_lead", { p_lead: lead.id, p_firm: lead.firm_id });
  if (error) return { status: 500, body: { error: `Enrollment failed: ${error.message}` } };
  return { status: 200, body: { ok: true } };
}
