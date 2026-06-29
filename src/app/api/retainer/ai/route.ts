import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

const RELAY_URL = process.env.RELAY_URL || "https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa";
const PROXY_URL = process.env.AI_RELAY_URL || "";

// The merge tokens a retainer can use; the AI is told to insert these verbatim.
const TOKENS = `Available merge fields (insert literally where appropriate, double braces):
{{contact.full_name}} {{contact.first_name}} {{contact.last_name}} {{contact.phone}} {{contact.email}} {{contact.address}} {{contact.dob}} {{case.lead_no}} {{case.type}} {{case.handling_attorney}} {{case.referring_attorney}} {{case.description}} {{today}}`;

async function tryDirect(secret: string, system: string, user: string, signal: AbortSignal) {
  const r = await fetch(RELAY_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Maverick-Secret": secret }, body: JSON.stringify({ system, user, temperature: 0.3 }), signal });
  if (!r.ok) return null;
  const d: any = await r.json();
  return d.answer ?? d.text ?? "";
}
async function tryProxy(system: string, user: string, signal: AbortSignal) {
  if (!PROXY_URL) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CR_AI_GATE) headers["X-CR-Secret"] = process.env.CR_AI_GATE;
  const r = await fetch(PROXY_URL, { method: "POST", headers, body: JSON.stringify({ system, user }), signal });
  if (!r.ok) return null;
  const d: any = await r.json();
  return d.answer ?? "";
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const secret = process.env.MAVERICK_RELAY_SECRET;
  if (!secret) return NextResponse.json({ error: "AI not configured" }, { status: 200 });

  const { description, caseType } = await req.json();
  const system = `You draft plaintiff-side legal retainer agreements as plain text. Write a complete, professional retainer the client will read and sign. Use clear section headings, standard contingency-fee retainer language, and insert the merge fields where the client's or case's specifics belong (name, date, case type). ${TOKENS}
Output ONLY the retainer body text. No preamble, no markdown fences, no commentary.`;
  const user = `Draft a retainer agreement${caseType ? ` for a ${caseType} case` : ""}. Details and any special terms: ${description}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 95000);
  try {
    let answer: string | null = null;
    try { answer = await tryDirect(secret, system, user, ctrl.signal); } catch { answer = null; }
    if (!answer) { try { answer = await tryProxy(system, user, ctrl.signal); } catch { answer = null; } }
    clearTimeout(timer);
    if (!answer) return NextResponse.json({ error: "The AI service did not respond. Try again." }, { status: 200 });
    const body = answer.replace(/^```(?:\w+)?/i, "").replace(/```$/, "").trim();
    return NextResponse.json({ body });
  } catch (e: any) {
    clearTimeout(timer);
    return NextResponse.json({ error: e?.name === "AbortError" ? "The AI service ran long. Try a shorter description." : "Request failed." }, { status: 200 });
  }
}
