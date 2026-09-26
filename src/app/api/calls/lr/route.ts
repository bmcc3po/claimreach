import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff, findByLawRulerId } from "@/lib/mva-call/server";
export const runtime = "edge";

// GET /api/calls/lr?id=<LawRuler lead ID>  ->  { lead_id, lead_key } (nulls when not here yet)
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const found = await findByLawRulerId(sb, id);
  return NextResponse.json({ lead_id: found?.id ?? null, lead_key: found?.key ?? null });
}
