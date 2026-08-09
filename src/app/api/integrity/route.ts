import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

const RELAY_URL = process.env.RELAY_URL || "https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa";
const PROXY_URL = process.env.AI_RELAY_URL || "";

async function ask(secret: string, system: string, user: string, signal: AbortSignal): Promise<string> {
  try {
    const r = await fetch(RELAY_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Maverick-Secret": secret }, body: JSON.stringify({ system, user, temperature: 0.2 }), signal });
    if (r.ok) { const d: any = await r.json(); if (d.answer ?? d.text) return d.answer ?? d.text; }
  } catch {}
  if (PROXY_URL) {
    try {
      const h: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.CR_AI_GATE) h["X-CR-Secret"] = process.env.CR_AI_GATE;
      const r = await fetch(PROXY_URL, { method: "POST", headers: h, body: JSON.stringify({ system, user }), signal });
      if (r.ok) { const d: any = await r.json(); return d.answer ?? ""; }
    } catch {}
  }
  return "";
}

function parseJSON(raw: string): any {
  try {
    let t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    return JSON.parse(t);
  } catch { return null; }
}

// POST { lead_id, claim_id, checks?: ["spelling","story","fraud"] }
// Returns inline findings the agent can act on live.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const secret = process.env.MAVERICK_RELAY_SECRET;
  if (!secret) return NextResponse.json({ error: "AI not configured" }, { status: 200 });

  const b = await req.json();
  const { data: claim } = await sb.from("claims").select("claim_type, answers, campaign").eq("id", b.claim_id).maybeSingle();
  const answers = claim?.answers ?? {};
  // only free-text-ish content matters for story/spelling; keep the whole map for fraud
  const text = JSON.stringify(answers).slice(0, 7000);

  const system = `You are ClaimReach's Live Intake Integrity engine for a plaintiff legal intake (campaign: ${claim?.claim_type ?? "unknown"}). You review intake answers WHILE the agent is on the call and return concrete, actionable findings. Be precise, no fluff. Return STRICT JSON only:
{
 "spelling":[{"field":"<id or label>","fix":"corrected text"}],
 "grammar":[{"field":"<id or label>","fix":"cleaned text"}],
 "story_holes":[{"issue":"plain-language contradiction or missing fact","ask":"the exact follow-up the agent should ask"}],
 "fraud_flags":[{"flag":"the risk","why":"why it's a soft-fraud / weak-case signal","severity":"low|med|high"}],
 "overall":"one-line status"
}
Rules: story_holes = internal contradictions (dates out of order, conflicting descriptions) AND missing connective facts (injury claimed but no treatment/provider, ambulance but no hospital, etc). fraud_flags = treatment gaps, undisclosed pre-existing conditions, attorney-shopping, severity-vs-damage mismatch, coached-sounding answers. If a category has nothing, return an empty array. Do not invent facts not present.`;
  const user = `Intake answers JSON:\n${text}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  const raw = await ask(secret, system, user, ctrl.signal);
  clearTimeout(timer);
  if (!raw) return NextResponse.json({ error: "Integrity engine unavailable. Try again." }, { status: 200 });

  const parsed = parseJSON(raw) ?? { overall: raw.slice(0, 160), spelling: [], grammar: [], story_holes: [], fraud_flags: [] };
  return NextResponse.json({ result: {
    spelling: parsed.spelling ?? [],
    grammar: parsed.grammar ?? [],
    story_holes: parsed.story_holes ?? [],
    fraud_flags: parsed.fraud_flags ?? [],
    overall: parsed.overall ?? "",
  }});
}
