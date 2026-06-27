import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// Crissi / ClaimReach AI. The relay (Tailscale Funnel) is the real endpoint:
//   POST {system, user, temperature?} -> {answer}, header X-Maverick-Secret.
// Cloudflare's edge historically couldn't resolve the .ts.net host (error 1016
// when the Funnel was misconfigured). Now that Funnel is public, we try the relay
// DIRECTLY first; if that throws (edge DNS refusal), fall back to the Netlify proxy.
//
// Env:
//   MAVERICK_RELAY_SECRET  - the shared secret (required)
//   RELAY_URL              - default https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa
//   AI_RELAY_URL           - optional Netlify proxy fallback (dashboard.innovativeintake.com/.netlify/functions/ai-relay)
//   CR_AI_GATE             - optional shared secret for the Netlify proxy

const RELAY_URL = process.env.RELAY_URL || "https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa";
const PROXY_URL = process.env.AI_RELAY_URL || "";

async function callRelayDirect(system: string, user: string) {
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

async function callProxy(system: string, user: string) {
  if (!PROXY_URL) return { answer: "", error: "no_proxy" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CR_AI_GATE) headers["X-CR-Secret"] = process.env.CR_AI_GATE;
  const r = await fetch(PROXY_URL, { method: "POST", headers, body: JSON.stringify({ system, user }) });
  if (!r.ok) return { answer: "", error: `proxy_${r.status}` };
  const d: any = await r.json();
  return { answer: d.answer ?? "" };
}

// GET ?health=1 — diagnostic across both paths.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.searchParams.get("health")) return NextResponse.json({ ok: true, relay: RELAY_URL, proxy: PROXY_URL || null });
  const out: Record<string, unknown> = { relay: RELAY_URL, proxy: PROXY_URL || null, secretSet: !!process.env.MAVERICK_RELAY_SECRET };
  try { const d = await callRelayDirect("You are a test.", "say OK"); out.direct = d; }
  catch (e: any) { out.directError = String(e?.message ?? e); }
  if (PROXY_URL) {
    try { const d = await callProxy("You are a test.", "say OK"); out.viaProxy = d; }
    catch (e: any) { out.proxyError = String(e?.message ?? e); }
  }
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { system, user } = await req.json();
  const sys = system ?? "";
  const usr = user ?? "";

  // 1) Try the relay directly.
  try {
    const d = await callRelayDirect(sys, usr);
    if (d.answer) return NextResponse.json({ answer: d.answer });
  } catch { /* edge couldn't reach .ts.net — fall through to proxy */ }

  // 2) Fall back to the Netlify proxy if configured.
  try {
    const d = await callProxy(sys, usr);
    if (d.answer) return NextResponse.json({ answer: d.answer });
  } catch { /* both failed */ }

  // 3) Graceful empty so the UI uses its offline (Bible) fallback.
  return NextResponse.json({ answer: "", error: "unreachable" }, { status: 200 });
}
