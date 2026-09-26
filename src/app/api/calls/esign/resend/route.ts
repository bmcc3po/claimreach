import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, firmSpoken } from "@/lib/mva-call/server";
import { sendJustCallSms } from "@/lib/justcall-send";
import { normPhone } from "@/lib/comms";

export const runtime = "edge";

// POST /api/calls/esign/resend  { lead_id }
// Texts the same signing link again from the JustCall line.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const { data: row } = await sb.from("esign_submissions").select("*")
    .eq("lead_id", leadId).is("pax_index", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || !["sent", "opened"].includes(row.status)) return NextResponse.json({ error: "There's no open agreement to resend." }, { status: 409 });
  if (!row.sign_url || !row.phone) return NextResponse.json({ error: "This one went by email. Ask her to check her inbox and spam." }, { status: 409 });

  const { data: lead } = await sb.from("leads").select("perm_text").eq("id", leadId).maybeSingle();
  if (lead?.perm_text === false) return NextResponse.json({ error: "She asked not to be texted." }, { status: 409 });
  const admin = supabaseAdmin();
  const { data: firm } = await admin.from("firms").select("name").eq("id", row.firm_id).maybeSingle();
  const from = process.env.JUSTCALL_DEFAULT_FROM || "";
  if (!from) return NextResponse.json({ error: "No JustCall number is set (JUSTCALL_DEFAULT_FROM)." }, { status: 500 });
  const body = `${firmSpoken(firm?.name)}: here is your agreement link again. ${row.sign_url}`;
  const sent = await sendJustCallSms({ to: row.phone, from, body });
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
  await admin.from("communications").insert({
    lead_id: leadId, firm_id: row.firm_id, channel: "sms", direction: "outbound", phone_raw: row.phone, phone_norm: normPhone(row.phone),
    agent_name: me.name, body, provider: "justcall", send_status: "sent", occurred_at: new Date().toISOString(), purpose: "esign",
  });
  return NextResponse.json({ ok: true });
}
