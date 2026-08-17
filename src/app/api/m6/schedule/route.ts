import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// "Call her Thursday" becomes a row, not a note somebody has to remember to
// read. This is what the Today screen reads from.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to save this." }, { status: 401 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const { lead_id, due_at, kind, note, assigned_to } = b ?? {};
  if (!lead_id || !due_at) return NextResponse.json({ error: "Pick a date." }, { status: 400 });

  const when = new Date(due_at);
  if (isNaN(when.getTime())) {
    return NextResponse.json({ error: "That date did not make sense. Use YYYY-MM-DD." }, { status: 400 });
  }

  const { data: lead } = await sb.from("leads").select("id, firm_id").eq("id", lead_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "That file is not available to you." }, { status: 404 });

  const { error } = await sb.from("call_schedule").insert({
    firm_id: lead.firm_id, lead_id,
    due_at: when.toISOString(),
    kind: kind ?? "callback",
    note: note ?? null,
    assigned_to: assigned_to ?? null,
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
