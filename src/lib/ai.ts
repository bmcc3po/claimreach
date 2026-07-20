// Client helper — all ClaimReach AI features call the Mac relay through /api/ai.
// Returns the answer text, or "" on failure (callers provide their own fallback).
export async function askAI(system: string, user: string): Promise<string> {
  try {
    const r = await fetch("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user }),
    });
    const d = await r.json();
    return d.answer ?? "";
  } catch {
    return "";
  }
}
