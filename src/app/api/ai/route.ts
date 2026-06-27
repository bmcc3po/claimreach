import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// AI relay — forwards { system, user } to the Mac relay (Codex/OpenAI via OpenClaw),
// adding the protected secret server-side. Same contract as maverick-qa.js: { answer }.
const RELAY_URL = "https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa";

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const secret = process.env.MAVERICK_RELAY_SECRET;
  if (!secret) return NextResponse.json({ answer: "", error: "AI relay not configured" }, { status: 200 });

  const { system, user } = await req.json();
  try {
    const r = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Maverick-Secret": secret },
      body: JSON.stringify({ system: system ?? "", user: user ?? "" }),
    });
    if (!r.ok) return NextResponse.json({ answer: "", error: `relay ${r.status}` }, { status: 200 });
    const d = await r.json();
    return NextResponse.json({ answer: d.answer ?? d.text ?? "" });
  } catch {
    // Mac offline or unreachable — return empty so the UI can fall back gracefully.
    return NextResponse.json({ answer: "", error: "relay unreachable" }, { status: 200 });
  }
}
