import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

const TOKENS = `Available merge fields (insert literally with double braces where appropriate):
{{contact.full_name}} {{contact.first_name}} {{contact.last_name}} {{contact.phone}} {{contact.email}} {{contact.address}} {{contact.dob}} {{case.lead_no}} {{case.type}} {{case.handling_attorney}} {{case.referring_attorney}} {{today}}`;

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { description, caseType } = await req.json();
  const system = `You draft plaintiff-side legal retainer agreements as plain text. Write a complete, professional retainer the client will read and sign, with clear section headings and standard contingency-fee language. Insert the merge fields where the client's or case's specifics belong. ${TOKENS}
Output ONLY the retainer body text. No preamble, no markdown fences, no commentary.`;
  const user = `Draft a retainer agreement${caseType ? ` for a ${caseType} case` : ""}. Details and special terms: ${description}`;

  // Use the canonical /api/ai route (direct relay -> Netlify proxy fallback) so
  // this works wherever the form builder's AI works.
  try {
    const r = await fetch(new URL("/api/ai", req.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
      body: JSON.stringify({ system, user }),
    });
    const d = await r.json();
    const answer = (d.answer || "").trim();
    if (!answer) return NextResponse.json({ error: "The AI service did not respond. Check the AI relay, then try again." }, { status: 200 });
    const body = answer.replace(/^```(?:\w+)?/i, "").replace(/```$/, "").trim();
    return NextResponse.json({ body });
  } catch {
    return NextResponse.json({ error: "Request to the AI service failed." }, { status: 200 });
  }
}
