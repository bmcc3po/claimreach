// One relay for every Crissi / staff AI call. Do not add a second vendor.
// Used by /api/ai and /api/m6/crissi.

const RELAY_URL = process.env.RELAY_URL || "https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa";
const PROXY_URL = process.env.AI_RELAY_URL || "";

export function relayConfig() {
  return {
    relay: RELAY_URL,
    proxy: PROXY_URL || null,
    secretSet: !!process.env.MAVERICK_RELAY_SECRET,
  };
}

export async function callRelayDirect(system: string, user: string) {
  const secret = process.env.MAVERICK_RELAY_SECRET;
  if (!secret) return { answer: "", error: "no_secret" };
  const r = await fetch(RELAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Maverick-Secret": secret },
    body: JSON.stringify({ system, user, temperature: 0.3 }),
  });
  if (!r.ok) return { answer: "", error: `relay_${r.status}` };
  const d: any = await r.json();
  return { answer: d.answer ?? d.text ?? "" };
}

export async function callProxy(system: string, user: string) {
  if (!PROXY_URL) return { answer: "", error: "no_proxy" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CR_AI_GATE) headers["X-CR-Secret"] = process.env.CR_AI_GATE;
  const r = await fetch(PROXY_URL, { method: "POST", headers, body: JSON.stringify({ system, user }) });
  if (!r.ok) return { answer: "", error: `proxy_${r.status}` };
  const d: any = await r.json();
  return { answer: d.answer ?? "" };
}

export async function askRelay(system: string, user: string): Promise<string> {
  try {
    const d = await callRelayDirect(system, user);
    if (d.answer) return d.answer;
  } catch { /* edge couldn't reach .ts.net */ }
  try {
    const d = await callProxy(system, user);
    if (d.answer) return d.answer;
  } catch { /* both failed */ }
  return "";
}
