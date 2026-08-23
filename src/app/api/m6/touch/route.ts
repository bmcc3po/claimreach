import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
export const runtime = "edge";

const OUTCOMES = ["two_way", "no_answer", "voicemail", "bad_number"];

// Writes through m6_log_touch (0089). Direct communications INSERT from a
// firm JWT is still allowed by 0087, but "Reached" also UPDATEs
// leads.retention_stage via on_two_way_contact — that nested write is the
// only extra column the guard allows. The RPC is the app's single writer.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const { lead_id, outcome, purpose, channel, contact_point_id, body } = b ?? {};
  if (!lead_id) return NextResponse.json({ error: "Missing the file." }, { status: 400 });
  if (!OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: "Pick how the contact ended." }, { status: 400 });
  }

  const gate = await assertM6Write(sb, lead_id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { error } = await sb.rpc("m6_log_touch", {
    p_lead_id: lead_id,
    p_outcome: outcome,
    p_purpose: purpose ?? "ad_hoc",
    p_channel: channel === "sms" ? "sms" : "call",
    p_contact_point_id: contact_point_id ?? null,
    p_body: body ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
