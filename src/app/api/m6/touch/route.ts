import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
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
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to save this." }, { status: 401 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const { lead_id, outcome, purpose, channel, contact_point_id, body } = b ?? {};
  if (!lead_id) return NextResponse.json({ error: "Missing the file." }, { status: 400 });
  if (!OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: "Pick how the contact ended." }, { status: 400 });
  }

  // RLS decides whether this user may see the file at all.
  const { data: lead } = await sb.from("leads").select("id, firm_id, phone").eq("id", lead_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "That file is not available to you." }, { status: 404 });

  const { data: me } = await sb.from("app_users").select("full_name, email").eq("id", user.id).maybeSingle();

  const { error } = await sb.from("communications").insert({
    lead_id, firm_id: lead.firm_id,
    channel: channel === "sms" ? "sms" : "call",
    direction: purpose === "inbound" ? "inbound" : "outbound",
    phone: lead.phone ?? null,
    body: body ?? null,
    agent_name: me?.full_name ?? null,
    agent_email: me?.email ?? null,
    occurred_at: new Date().toISOString(),
    purpose: purpose ?? "ad_hoc",
    outcome,
    contact_point_id: contact_point_id ?? null,
    logged_manually: true,
    dispositioned_by: user.id,
    dispositioned_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
