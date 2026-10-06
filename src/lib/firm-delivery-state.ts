/** Pass only this firm's matter-scoped, server-recorded delivery receipts. */
export function confirmedFirmDeliveryAt(history: { ok?: boolean; to_email?: string | null; cc_email?: string | null; created_at?: string | null; triggered_by?: string | null }[], firmEmail: string | null | undefined, ownerEmail: string | null | undefined): string | null {
  const firm = String(firmEmail || "").trim().toLowerCase();
  const owner = String(ownerEmail || "").trim().toLowerCase();
  const matching = history.filter((row) => {
    if (row.ok !== true || !row.created_at || !Number.isFinite(Date.parse(row.created_at))) return false;
    const to = String(row.to_email || "").trim().toLowerCase();
    // These writers take the primary recipient from the campaign at send time.
    // Preserve that successful evidence when today's configured address changes.
    // An owner-only send, unknown legacy source or arbitrary CC is not proof.
    const recordedFirm = !!owner && to !== owner && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to) &&
      ['manual', 'auto', 'automation', 'external_owner_confirmed'].includes(row.triggered_by || '');
    return recordedFirm || (!!firm && firm !== owner &&
      [to, ...String(row.cc_email || "").split(/[,;]/)].some(address => String(address || "").trim().toLowerCase() === firm));
  });
  return matching.map((row) => String(row.created_at)).sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null;
}

export function returnWindow(sentAt: string | null, now = Date.now()): { endsAt: string; daysLeft: number; cleared: boolean } | null {
  if (!sentAt || !Number.isFinite(Date.parse(sentAt))) return null;
  const endsAt = new Date(Date.parse(sentAt) + 7 * 86400000);
  return { endsAt: endsAt.toISOString(), daysLeft: Math.max(0, Math.ceil((endsAt.getTime() - now) / 86400000)), cleared: now >= endsAt.getTime() };
}
