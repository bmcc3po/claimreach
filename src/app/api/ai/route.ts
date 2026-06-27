import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// Cloudflare's edge can't resolve the Mac's .ts.net Funnel hostname (error 1016),
// but Netlify CAN. So we forward through a thin Netlify relay function that calls
// the Mac. Set AI_RELAY_URL (the Netlify function URL) + optional CR_AI_GATE.
const DEFAULT_RELAY = "https://claimreach.netlify.app/.netlify/functions/ai-relay";

function relayUrl() { return process.env.AI_RELAY_URL || DEFAULT_RELAY; }

// GET ?health=1 — diagnostic passthrough to the Netlify relay.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.searchParams.get("health")) return NextResponse.json({ ok: true, relay: relayUrl() });
  try {
    const r = await fetch(`${relayUrl()}?health=1`, { method: "GET" });
    const body = await r.text();
    return NextResponse.json({ relay: relayUrl(), status: r.status, body: body.slice(0, 300) });
  } catch (e: any) {
    return NextResponse.json({ relay: relayUrl(), error: String(e?.message ?? e) });
  }
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { system, user } = await req.json();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.CR_AI_GATE) headers["X-CR-Secret"] = process.env.CR_AI_GATE;
    const r = await fetch(relayUrl(), {
      method: "POST", headers,
      body: JSON.stringify({ system: system ?? "", user: user ?? "" }),
    });
    if (!r.ok) return NextResponse.json({ answer: "", error: `relay_${r.status}` }, { status: 200 });
    const d = await r.json();
    return NextResponse.json({ answer: d.answer ?? "" });
  } catch (e: any) {
    return NextResponse.json({ answer: "", error: "unreachable", detail: String(e?.message ?? e) }, { status: 200 });
  }
}
