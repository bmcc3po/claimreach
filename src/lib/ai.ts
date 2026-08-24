// Client helper — all ClaimReach AI features call the Mac relay through /api/ai.
// Returns the answer text, or "" on failure (callers provide their own fallback).
// One vendor. Do not add a second chat route.
export async function askAI(
  system: string,
  user: string,
  extra?: { surface?: "m6"; lead_id?: string },
): Promise<string> {
  try {
    const r = await fetch("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user, ...extra }),
    });
    const d = await r.json();
    return d.answer ?? "";
  } catch {
    return "";
  }
}
