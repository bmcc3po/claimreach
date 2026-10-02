/** A short, agent-owned marker for an active conversation. It is not a claim
 * that the phone provider verified a connected call. */
export type LiveCallPresence = { by: string; by_name: string; expires_at: string };

export function activeCallPresence(value: unknown, now = Date.now()): LiveCallPresence | null {
  if (!value || typeof value !== "object") return null;
  const call = value as Record<string, unknown>;
  if (typeof call.by !== "string" || !call.by || typeof call.by_name !== "string" || !call.by_name || typeof call.expires_at !== "string") return null;
  const expires = Date.parse(call.expires_at);
  return Number.isFinite(expires) && expires > now ? call as LiveCallPresence : null;
}
