import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { askRelay } from "@/lib/ai-relay";
import { assertM6Write, requireM6Session } from "@/lib/m6-scope";
import { buildM6CrissiSystem, type M6CrissiFile } from "@/lib/m6-crissi";
import { displayName } from "@/lib/m6";
export const runtime = "edge";

const FILE_COLS = "id, firm_id, campaign, case_type, archived_at, first_name, last_name, full_name, claimant_name, lead_no, comms_monitored";

async function fileContext(sb: any, leadId: string): Promise<M6CrissiFile | null> {
  if (!leadId) return null;
  const gate = await assertM6Write(sb, leadId, FILE_COLS);
  if (!gate.ok) return null;
  return {
    id: gate.lead.id,
    name: displayName(gate.lead),
    leadNo: gate.lead.lead_no ?? null,
    commsMonitored: !!gate.lead.comms_monitored,
  };
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const leadId = new URL(req.url).searchParams.get("lead_id") || "";
  const file = await fileContext(sb, leadId);
  return NextResponse.json({ file, sendingNumber: "+12562075828" });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const text = typeof b.message === "string" ? b.message.trim() : "";
  if (!text) return NextResponse.json({ error: "Ask Crissi a question." }, { status: 400 });

  const file = await fileContext(sb, typeof b.lead_id === "string" ? b.lead_id : "");
  const system = buildM6CrissiSystem(file);
  const answer = await askRelay(system, text);
  return NextResponse.json({
    answer,
    file,
    offline: !answer,
  });
}
