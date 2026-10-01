/** The return window starts only when a successful delivery included the actual firm. */
export function confirmedFirmDeliveryAt(history: { ok?: boolean; to_email?: string | null; cc_email?: string | null; created_at?: string | null }[], firmEmail: string | null | undefined, ownerEmail: string | null | undefined): string | null {
  const firm = String(firmEmail || "").trim().toLowerCase();
  if (!firm || firm === String(ownerEmail || "").trim().toLowerCase()) return null;
  const matching = history.filter((row) => row.ok === true && !!row.created_at &&
    [row.to_email, ...String(row.cc_email || "").split(/[,;]/)].some((address) => String(address || "").trim().toLowerCase() === firm));
  return matching.map((row) => String(row.created_at)).sort()[0] || null;
}

export function returnWindow(sentAt: string | null, now = Date.now()): { endsAt: string; daysLeft: number; cleared: boolean } | null {
  if (!sentAt || !Number.isFinite(Date.parse(sentAt))) return null;
  const endsAt = new Date(Date.parse(sentAt) + 7 * 86400000);
  return { endsAt: endsAt.toISOString(), daysLeft: Math.max(0, Math.ceil((endsAt.getTime() - now) / 86400000)), cleared: now >= endsAt.getTime() };
}
