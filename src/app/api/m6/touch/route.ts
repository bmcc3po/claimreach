import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
import { normPhone } from "@/lib/comms";
export const runtime = "edge";

const OUTCOMES = ["two_way", "no_answer", "voicemail", "bad_number"];

// Writes to `communications`, the same table JustCall feeds. Manual logging is
// the exception path once both firms are on JustCall, but it has to exist for
// the cell-phone call, the in-person contact, and the message passed through
// somebody's mother.
//
// The clock is NOT reset here. The 0082 trigger on communications.outcome does
// that, so a touch that arrives from JustCall behaves identically to one typed
// in by hand.
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

  const { data: me } = await sb.from("app_users").select("email").eq("id", gate.user.id).maybeSingle();

  const raw = gate.lead.phone ?? null;
  const { error } = await sb.from("communications").insert({
    lead_id, firm_id: gate.lead.firm_id,
    channel: channel === "sms" ? "sms" : "call",
    direction: purpose === "inbound" ? "inbound" : "outbound",
    // 0023: phone_raw / phone_norm. There is no communications.phone —
    // naming it makes PostgREST reject the entire insert.
    phone_raw: raw,
    phone_norm: normPhone(raw),
    body: body ?? null,
    agent_name: gate.user.name ?? null,
    agent_email: me?.email ?? null,
    occurred_at: new Date().toISOString(),
    purpose: purpose ?? "ad_hoc",
    outcome,
    contact_point_id: contact_point_id ?? null,
    logged_manually: true,
    dispositioned_by: gate.user.id,
    dispositioned_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
