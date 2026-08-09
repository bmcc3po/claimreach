import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

const RELAY_URL = process.env.RELAY_URL || "https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa";
const PROXY_URL = process.env.AI_RELAY_URL || "";

// STRICT spec with an EXAMPLE so the model uses ClaimReach's real schema (kind, not type).
const FIELD_SPEC = `Return ONLY a JSON array of field objects in EXACTLY this schema (no other keys):
{"id":"snake_case","scope":"lead","kind":KIND,"label":"...","options"?:["..."],"script"?:"...","agentNote"?:"...","vital"?:true,"gateType"?:"dq"|"safety"|"supervisor"|"end_intake","showIf"?:{"match":"all","rules":[{"fieldId":"earlier_field_id","op":"is","value":"Yes"}]}}
Allowed kind values ONLY: section, script, text, longtext, bool, select, multiselect, int, date, monthyear, phone, email, facility_lookup, property_lookup, gate.
Rules: use "kind" NOT "type". For yes/no use kind:"bool". For a disqualifier use kind:"gate" with gateType:"dq" and a showIf that triggers it. Put a kind:"section" before each group. select/multiselect need options. showIf uses {match,rules:[{fieldId,op,value}]} where op is one of is|is_not|any_of|is_blank|not_blank. snake_case unique ids. Do NOT invent keys like "type","dq","trueIf","required","priority". Output ONLY the JSON array.
Example: [{"id":"sec_injury","scope":"lead","kind":"section","label":"Injury"},{"id":"was_injured","scope":"lead","kind":"bool","label":"Were you injured by the product?","vital":true},{"id":"gate_not_injured","scope":"lead","kind":"gate","gateType":"dq","label":"No qualifying injury","showIf":{"match":"all","rules":[{"fieldId":"was_injured","op":"is","value":"false"}]}}]`;

function parseFields(text: string): any[] | null {
  let t = (text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("["), e = t.lastIndexOf("]");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { const a = JSON.parse(t); return Array.isArray(a) ? a : null; } catch { return null; }
}

// Sanitize AI output into our real Field shape; drop anything unusable.
const KINDS = new Set(["section","script","text","longtext","bool","select","multiselect","int","date","monthyear","phone","email","facility_lookup","property_lookup","gate"]);
function sanitize(raw: any[], startIdx: number): any[] {
  const out: any[] = [];
  raw.forEach((f, i) => {
    if (!f || typeof f !== "object") return;
    let kind = f.kind || f.type;            // tolerate the model using "type"
    if (kind === "radio") kind = "select";  // common model habit
    if (kind === "checkbox") kind = "multiselect";
    if (kind === "textarea") kind = "longtext";
    if (kind === "logic") return;           // drop pseudo-fields
    if (!KINDS.has(kind)) kind = "text";
    const field: any = {
      id: f.id || `ai_${startIdx + i}`,
      scope: f.scope === "property" ? "property" : "lead",
      kind, label: f.label || "Untitled",
    };
    if (Array.isArray(f.options) && f.options.length) field.options = f.options.map(String);
    if (f.script) field.script = String(f.script);
    if (f.agentNote) field.agentNote = String(f.agentNote);
    if (f.vital) field.vital = true;
    if (kind === "gate") field.gateType = ["dq","safety","supervisor","end_intake"].includes(f.gateType) ? f.gateType : "dq";
    // normalize showIf if it's already in our shape
    if (f.showIf && f.showIf.rules && Array.isArray(f.showIf.rules)) {
      field.showIf = { match: f.showIf.match === "any" ? "any" : "all",
        rules: f.showIf.rules.filter((r: any) => r && r.fieldId).map((r: any) => ({ fieldId: r.fieldId, op: r.op || "is", value: r.value, values: r.values })) };
    }
    out.push(field);
  });
  return out;
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
async function tryDirect(secret: string, system: string, user: string, signal: AbortSignal) {
  const r = await fetch(RELAY_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Maverick-Secret": secret }, body: JSON.stringify({ system, user, temperature: 0.2 }), signal });
  if (!r.ok) return null;
  const d: any = await r.json();
  return d.answer ?? d.text ?? "";
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const secret = process.env.MAVERICK_RELAY_SECRET;
  if (!secret) return NextResponse.json({ error: "AI not configured" }, { status: 200 });

  const { mode, description, existingLabels } = await req.json();
  const system = `You build legal-intake questionnaires as STRICT JSON. ${FIELD_SPEC}`;
  const user = mode === "questions"
    ? `Generate ONLY fields for this need (no opening/contact/close). Existing sections: ${existingLabels || "none"}. Need: ${description}`
    : `Generate the CAMPAIGN-SPECIFIC qualifying questions, DQ/safety gates, and conditional logic for this intake (no generic opening/contact/close). Be concise: aim for the 10-12 most important fields, short labels, no filler. Campaign: ${description}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 95000); // return a clean error before the platform wall
  try {
    let answer: string | null = null;
    // Direct FIRST: Netlify functions hard-cap at ~10s, far too short for a ~40s
    // form generation, so the proxy ALWAYS dies on big forms. The Cloudflare edge
    // tolerates a longer fetch, so direct is the only viable path for slow gens.
    try { answer = await tryDirect(secret, system, user, ctrl.signal); } catch { answer = null; }
    if (!answer) { try { answer = await tryProxy(system, user, ctrl.signal); } catch { answer = null; } }
    clearTimeout(timer);
    if (!answer) return NextResponse.json({ error: "The AI service was slow or unavailable. Try again, or use 'Just add these questions' for smaller chunks." }, { status: 200 });
    const fields = parseFields(answer);
    if (!fields) return NextResponse.json({ error: "AI returned unparseable output. Try a shorter description." }, { status: 200 });
    const clean = sanitize(fields, Date.now() % 100000);
    if (!clean.length) return NextResponse.json({ error: "AI output had no usable fields. Try rephrasing." }, { status: 200 });
    return NextResponse.json({ fields: clean });
  } catch (e: any) {
    clearTimeout(timer);
    return NextResponse.json({ error: e?.name === "AbortError" ? "Timed out. Try a shorter description or chunk it." : "unreachable" }, { status: 200 });
  }
}
