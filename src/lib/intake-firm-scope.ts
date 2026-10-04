import { isInternalRole } from "./permissions";

/** Internal intake staff's organization is not the receiving law firm.
 * Keep the existing same-firm access and the established INNO -> TMP staffing
 * relationship. Callers must separately verify the RLS-visible lead/campaign;
 * The pilot hides the staff organization row, so only that configuration
 * lookup uses a server reader. Recipient visibility and file writes keep RLS. */
export async function intakeFirmScope(db: any, actor: { role: string; firmId: string | null }, firmId: string, organizationDb: () => any): Promise<
  { ok: true } | { ok: false; status: 403 | 503; error: string }
> {
  const denied = { ok: false, status: 403, error: "This file is not available to your intake team." } as const;
  if (!isInternalRole(actor.role)) return denied;
  if (actor.role === "owner") return { ok: true };
  if (!actor.firmId || !firmId) return denied;
  if (actor.firmId === firmId) return { ok: true };
  const { data: recipient, error } = await db.from("firms").select("id,slug").eq("id", firmId).maybeSingle();
  if (error) return { ok: false, status: 503, error: "Could not verify this file's intake team. Try saving again." };
  if (recipient?.slug !== "tmp") return denied;
  // actor.firmId comes from the authenticated app_users record, never input.
  // Match the existing call-presence/NETFLY organization check. This reader
  // receives no file id and never reads or mutates any client data.
  const { data: staff, error: staffError } = await organizationDb().from("firms").select("id,slug").eq("id", actor.firmId).maybeSingle();
  if (staffError) return { ok: false, status: 503, error: "Could not verify this file's intake team. Try saving again." };
  return staff?.slug === "inno" ? { ok: true } : denied;
}
