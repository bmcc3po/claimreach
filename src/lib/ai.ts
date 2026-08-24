// Client helper — all ClaimReach AI features call the Mac relay through /api/ai.
// Returns the answer text, or "" on failure (callers provide their own fallback).
// One vendor. Do not add a second chat route.

export type CrissiBrain = "live" | "offline" | "unknown";

type HealthAnswer = { answer?: unknown; error?: unknown } | null | undefined;

function nonemptyAnswer(block: HealthAnswer): boolean {
  return typeof block?.answer === "string" && block.answer.trim() !== "";
}

// LIVE = a real answer from the Mac or the proxy. HTTP 200 with empty
// answers (tonight: relay_530) is OFFLINE. Do not treat status codes as health.
export function crissiBrainFromHealth(data: {
  direct?: HealthAnswer;
  viaProxy?: HealthAnswer;
} | null | undefined): "live" | "offline" {
  if (nonemptyAnswer(data?.direct) || nonemptyAnswer(data?.viaProxy)) return "live";
  return "offline";
}

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
