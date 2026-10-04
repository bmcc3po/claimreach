import { isInternalRole } from "./permissions";

/** Internal intake staff's organization is not the receiving law firm.
 * Keep the existing same-firm access and the established INNO -> TMP staffing
 * relationship. Callers must separately verify the RLS-visible lead/campaign;
 * this helper never reads hidden files or substitutes a privileged client. */
export async function intakeFirmScope(db: any, actor: { role: string; firmId: string | null }, firmId: string): Promise<
  { ok: true } | { ok: false; status: 403 | 503; error: string }
> {
  const denied = { ok: false, status: 403, error: "This file is not available to your intake team." } as const;
  if (!isInternalRole(actor.role)) return denied;
  if (actor.role === "owner") return { ok: true };
  if (!actor.firmId || !firmId) return denied;
  if (actor.firmId === firmId) return { ok: true };
  const { data, error } = await db.from("firms").select("id,slug").in("id", [actor.firmId, firmId]);
  if (error) return { ok: false, status: 503, error: "Could not verify this file's intake team. Try saving again." };
  const staff = data?.find((row: any) => row.id === actor.firmId);
  const recipient = data?.find((row: any) => row.id === firmId);
  return staff?.slug === "inno" && recipient?.slug === "tmp" ? { ok: true } : denied;
}
