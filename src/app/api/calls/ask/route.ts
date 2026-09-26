import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff, firmSpoken } from "@/lib/mva-call/server";
import { askRelay } from "@/lib/ai-relay";
import { caseCureSystem } from "@/lib/mva-call/knowledge";
import { stateCodeOf } from "@/lib/mva-call/state";

export const runtime = "edge";

// POST /api/calls/ask  { lead_id, question, city? }
// Ask CaseCure mid-call. Goes to the same AI relay as Crissi with the MVA
// playbook as its brief. Never sends the SSN or DOB; the question is the
// agent's own words.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const question = String(b?.question || "").trim().slice(0, 1500);
  if (!question) return NextResponse.json({ error: "Type what happened or what she said first." }, { status: 400 });
  const { data: lead } = await sb.from("leads").select("id, firms(name)").eq("id", String(b?.lead_id || "")).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const system = caseCureSystem({ firmSpoken: firmSpoken((lead as any).firms?.name), stateCode: stateCodeOf(String(b?.city || "")) });
  const answer = await askRelay(system, question);
  if (!answer) return NextResponse.json({ error: "CaseCure is not answering right now. The rebuttals and lines are all here in the meantime." }, { status: 503 });
  return NextResponse.json({ answer });
}
