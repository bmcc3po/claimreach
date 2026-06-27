import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// AI relay — forwards { system, user } to the Mac relay (Codex/OpenAI via OpenClaw),
// adding the protected secret server-side. Same contract as maverick-qa.js: { answer }.
const RELAY_URL = "https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa";
const HEALTH_URL = "https://bretts-macbook-air.hair-tarpon.ts.net/mav/health";

// GET /api/ai?health=1 — diagnostic. Tells us exactly what's wrong without leaking the secret.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.searchParams.get("health")) return NextResponse.json({ ok: true, hint: "POST { system, user } to use; ?health=1 to diagnose" });
  const secret = process.env.MAVERICK_RELAY_SECRET;
  const diag: Record<string, unknown> = { secretSet: !!secret, relay: RELAY_URL };
  // 1. Can the edge even reach the Mac (health endpoint, no secret)?
  try {
    const h = await fetch(HEALTH_URL, { method: "GET" });
    diag.healthStatus = h.status;
    diag.healthBody = (await h.text()).slice(0, 200);
  } catch (e: any) { diag.healthError = String(e?.message ?? e); }
  // 2. Does an authed POST with the secret return an answer?
  if (secret) {
    try {
      const r = await fetch(RELAY_URL, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Maverick-Secret": secret },
        body: JSON.stringify({ system: "You are a test.", user: "say OK" }),
      });
      diag.qaStatus = r.status;
      diag.qaBody = (await r.text()).slice(0, 200);
    } catch (e: any) { diag.qaError = String(e?.message ?? e); }
  }
  return NextResponse.json(diag);
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const secret = process.env.MAVERICK_RELAY_SECRET;
  if (!secret) return NextResponse.json({ answer: "", error: "no_secret" }, { status: 200 });

  const { system, user } = await req.json();
  try {
    const r = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Maverick-Secret": secret },
      body: JSON.stringify({ system: system ?? "", user: user ?? "" }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 300);
      return NextResponse.json({ answer: "", error: `relay_${r.status}`, detail: body }, { status: 200 });
    }
    const d = await r.json();
    return NextResponse.json({ answer: d.answer ?? d.text ?? "" });
  } catch (e: any) {
    return NextResponse.json({ answer: "", error: "unreachable", detail: String(e?.message ?? e) }, { status: 200 });
  }
}
