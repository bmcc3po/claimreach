import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
export const runtime = "edge";

// "Call her Thursday" becomes a row, not a note somebody has to remember to
// read. This is what the Today screen reads from.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const { lead_id, due_at, kind, note, assigned_to } = b ?? {};
  if (!lead_id || !due_at) return NextResponse.json({ error: "Pick a date." }, { status: 400 });

  const when = new Date(due_at);
  if (isNaN(when.getTime())) {
    return NextResponse.json({ error: "That date did not make sense. Use YYYY-MM-DD." }, { status: 400 });
  }

  const gate = await assertM6Write(sb, lead_id, "id, firm_id, campaign, case_type, archived_at");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { error } = await sb.from("call_schedule").insert({
    firm_id: gate.lead.firm_id, lead_id,
    due_at: when.toISOString(),
    kind: kind ?? "callback",
    note: note ?? null,
    assigned_to: assigned_to ?? null,
    created_by: gate.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
