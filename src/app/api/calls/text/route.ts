import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, fmtPhone } from "@/lib/mva-call/server";
import { sendJustCallSms } from "@/lib/justcall-send";
import { outboundContact } from "@/lib/outbound-contact";
import { normPhone } from "@/lib/comms";
import { recordAudit } from "@/lib/audit";

export const runtime = "edge";

// POST /api/calls/text  { lead_id, body }
// Texts the caller from the JustCall line (JUSTCALL_DEFAULT_FROM). The text is
// written to communications right away so it shows on the file; JustCall's
// own sms webhook later lands on the same row by its id.
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Open this action from ClaimReach.' }, { status: 403 });
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.can('messages.send')) return NextResponse.json({ error: 'Texting permission is unavailable.' }, { status: 403 });

  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  const body = String(b?.body || "").trim();
  if (!leadId || !body) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  if (body.length > 1000) return NextResponse.json({ error: "That text is too long. Keep it under 1,000 characters." }, { status: 400 });

  const contact = await outboundContact(sb, me, leadId, null, "Text");
  if ("error" in contact) return NextResponse.json({ error: contact.error }, { status: contact.status });
  const { lead, to } = contact;
  const from = process.env.JUSTCALL_DEFAULT_FROM || "";
  if (!from) return NextResponse.json({ error: "No JustCall number is set. Add JUSTCALL_DEFAULT_FROM in Cloudflare." }, { status: 500 });

  const sent = await sendJustCallSms({ to, from, body });
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });

  const data: any = (sent as any).data || {};
  const sid = String(data?.data?.[0]?.id ?? data?.data?.id ?? data?.id ?? "") || null;
  const admin = supabaseAdmin();
  const { error } = await admin.from("communications").insert({
    lead_id: lead.id, firm_id: lead.firm_id, channel: "sms", direction: "outbound",
    phone_raw: lead.phone, phone_norm: normPhone(lead.phone), agent_name: me.name, body,
    provider: "justcall", sms_sid: sid, send_status: "sent", occurred_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: `The text went out, but it did not save to the file: ${error.message}` }, { status: 500 });

  await recordAudit({
    firm_id: lead.firm_id, lead_id: lead.id, actor: me.id, actor_name: me.name ?? "Agent", category: "sms",
    description: `Texted ${fmtPhone(lead.phone)}: "${body.slice(0, 80)}${body.length > 80 ? "…" : ""}"`,
    meta: { to, channel: "sms" },
  });
  return NextResponse.json({ ok: true });
}
