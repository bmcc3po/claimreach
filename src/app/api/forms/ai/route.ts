import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

const RELAY_URL = process.env.RELAY_URL || "https://bretts-macbook-air.hair-tarpon.ts.net/mav/qa";

const FIELD_SPEC = `Each field is a JSON object:
{ "id": "snake_case_unique", "scope": "lead"|"property", "kind": KIND, "label": "...", "options"?: ["..."], "script"?: "verbatim text", "agentNote"?: "...", "vital"?: true, "gateType"?: "dq"|"safety"|"supervisor"|"end_intake", "showIf"?: { "match":"all"|"any", "rules":[{ "fieldId":"...", "op":"is"|"is_not"|"any_of"|"is_blank"|"not_blank", "value"?:"...", "values"?:["..."] }] } }
KIND is one of: section, script, text, longtext, bool, select, multiselect, int, date, monthyear, phone, email, facility_lookup, property_lookup, gate.
Rules: start with a "section" field before each group. Use "script" (with a script string) for read-aloud parts. Use "gate" with gateType for DQ/safety checkpoints. Use bool for yes/no. For select/multiselect include options. Use showIf to only show a field when an earlier answer matches (e.g. show implant-infection questions only if still_implanted is true). Keep ids unique and snake_case. Mark truly essential fields vital:true.`;

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const secret = process.env.MAVERICK_RELAY_SECRET;
  if (!secret) return NextResponse.json({ error: "AI not configured" }, { status: 200 });

  const { mode, description, existingLabels } = await req.json();
  const system = `You build legal-intake questionnaires as STRICT JSON. Output ONLY a JSON array of field objects, no prose, no markdown fences. ${FIELD_SPEC}`;
  const user = mode === "questions"
    ? `Generate ONLY the fields for this need (no opening/closing/contact, just these questions). Context of existing sections: ${existingLabels || "n/a"}. Need: ${description}`
    : `Build a complete intake questionnaire for: ${description}. Include an opening (safe-to-talk), contact info, the campaign-specific qualifying questions with any DQ gates and conditional logic, and a close.`;

  try {
    const r = await fetch(RELAY_URL, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Maverick-Secret": secret },
      body: JSON.stringify({ system, user, temperature: 0.2 }),
    });
    if (!r.ok) return NextResponse.json({ error: `relay_${r.status}` }, { status: 200 });
    const d: any = await r.json();
    let text = (d.answer ?? d.text ?? "").trim();
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("["); const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    let fields: any[] = [];
    try { fields = JSON.parse(text); } catch { return NextResponse.json({ error: "AI returned invalid JSON", raw: text.slice(0, 400) }, { status: 200 }); }
    // light sanitization: ensure ids
    fields = (Array.isArray(fields) ? fields : []).map((f, i) => ({ ...f, id: f.id || `ai_${Date.now()}_${i}` }));
    return NextResponse.json({ fields });
  } catch (e: any) {
    return NextResponse.json({ error: "unreachable", detail: String(e?.message ?? e) }, { status: 200 });
  }
}
