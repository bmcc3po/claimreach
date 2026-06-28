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

// GET ?lead_id= -> latest review for the file (used by the retainer gate)
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lead_id = new URL(req.url).searchParams.get("lead_id");
  const { data } = await sb.from("grievous_reviews").select("*").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(5);
  const { data: lead } = await sb.from("leads").select("grievous_approved, grievous_approved_at").eq("id", lead_id).maybeSingle();
  return NextResponse.json({ reviews: data ?? [], approved: !!lead?.grievous_approved });
}

// POST { op:'review', lead_id, claim_id, kind:'quick'|'full' } -> grade the intake
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const secret = process.env.MAVERICK_RELAY_SECRET;
  if (!secret) return NextResponse.json({ error: "AI not configured" }, { status: 200 });

  // gather the intake answers + claim type
  const { data: claim } = await sb.from("claims").select("claim_type, answers, campaign").eq("id", b.claim_id).maybeSingle();
  const { data: lead } = await sb.from("leads").select("first_name, last_name, phone, email").eq("id", b.lead_id).maybeSingle();
  const answers = claim?.answers ?? {};
  const quick = b.kind === "quick";

  // Grievous can now SEE the recordings/transcripts on the file (no more hunting).
  const { data: comms } = await sb.from("communications").select("channel, direction, transcript, jc_summary, recording_url").eq("lead_id", b.lead_id).not("transcript", "is", null).order("occurred_at", { ascending: false }).limit(3);
  const callContext = (comms ?? []).map((c: any) => `[${c.channel} ${c.direction}] ${c.jc_summary ? "JC summary: " + c.jc_summary + ". " : ""}${c.transcript ? "Transcript: " + String(c.transcript).slice(0, 1500) : ""}`).join("\n");

  const system = `You are Grievous, a strict, no-nonsense legal-intake QA reviewer. You enforce campaign doctrine and completeness. You do NOT coach gently — you flag every gap, missing vital field, contradiction, or disqualifier. Be precise and hard-nosed but fair.
Return STRICT JSON only: {"verdict":"approved"|"rejected"|"advisory","score":0-100,"summary":"one line","issues":["..."]}. ${quick ? "QUICK mode: only the top 3 blocking issues." : "FULL mode: every issue, ordered by severity."} Approve only if the intake is complete and viable per doctrine.`;
  const user = `Campaign/claim type: ${claim?.claim_type ?? "unknown"} (${claim?.campaign ?? ""}). Claimant: ${lead?.first_name ?? ""} ${lead?.last_name ?? ""}. Intake answers JSON: ${JSON.stringify(answers).slice(0, 6000)}${callContext ? "\n\nCALL RECORDINGS/TRANSCRIPTS ON FILE (compare the intake answers against what was actually said):\n" + callContext.slice(0, 4000) : ""}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  const raw = await ask(secret, system, user, ctrl.signal);
  clearTimeout(timer);
  if (!raw) return NextResponse.json({ error: "Grievous is unavailable right now. Try again." }, { status: 200 });

  let parsed: any = null;
  try {
    let t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    parsed = JSON.parse(t);
  } catch { parsed = { verdict: "advisory", score: null, summary: raw.slice(0, 200), issues: [] }; }

  const verdict = ["approved", "rejected", "advisory"].includes(parsed.verdict) ? parsed.verdict : "advisory";
  const { data: rev } = await sb.from("grievous_reviews").insert({
    lead_id: b.lead_id, claim_id: b.claim_id, kind: quick ? "quick" : "full",
    verdict, score: parsed.score ?? null, issues: parsed.issues ?? [], summary: parsed.summary ?? "", reviewed_by: auth.user.id,
  }).select("*").single();

  // a FULL approved review flips the gate
  if (!quick && verdict === "approved") {
    await sb.from("leads").update({ grievous_approved: true, grievous_approved_at: new Date().toISOString() }).eq("id", b.lead_id);
  }
  return NextResponse.json({ review: rev, approved: !quick && verdict === "approved" });
}
