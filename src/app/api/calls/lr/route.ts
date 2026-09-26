import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff, findByLawRulerId } from "@/lib/mva-call/server";
export const runtime = "edge";

// GET /api/calls/lr?id=<LawRuler lead ID>  ->  { lead_id | null }
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  return NextResponse.json({ lead_id: await findByLawRulerId(sb, id) });
}
