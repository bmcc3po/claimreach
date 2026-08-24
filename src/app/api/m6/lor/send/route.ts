import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
import { LOR_LEAD_COLS, sendLorViaPostgrid } from "@/lib/m6-lor-server";
export const runtime = "edge";

// One human click. PostGrid only. Writes sent status on lead_lor.

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const leadId = typeof b.lead_id === "string" ? b.lead_id : "";
  if (!leadId) return NextResponse.json({ error: "Missing the file." }, { status: 400 });

  const gate = await assertM6Write(sb, leadId, LOR_LEAD_COLS);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const out = await sendLorViaPostgrid(sb, leadId, gate.user, gate.lead);
  return NextResponse.json(out.body, { status: out.status });
}
