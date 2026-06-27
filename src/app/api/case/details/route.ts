import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";
const FIELDS = ["marketing_source","referring_attorney","handling_attorney","intake_agent_id","qa_agent_id","case_manager_id","office_location","case_rating","call_outcome","esign_date","case_summary","case_description","case_tags"];
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (!b.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const patch: Record<string, any> = {};
  for (const k of FIELDS) if (k in b) patch[k] = b[k];
  const { error } = await sb.from("leads").update(patch).eq("id", b.lead_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
