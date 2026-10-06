import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { normPhone } from "@/lib/comms";
import { requireStaff } from '@/lib/mva-call/server';
import { outboundContact } from '@/lib/outbound-contact';
export const runtime = "edge";

// Outbound SMS via JustCall v2.1. (Click-to-call has NO REST endpoint in
// JustCall's API — outbound dialing is done through their CTI dialer, so the
// Call button opens the JustCall dialer client-side instead.)
// POST { op:'sms', lead_id, to, body }
function e164(p: string): string {
  const d = (p || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;          // default US
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d.startsWith("+") ? p : "+" + d;
}

export async function POST(req: NextRequest) {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Open this action from ClaimReach.' }, { status: 403 });
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (b?.op !== "sms") return NextResponse.json({ error: "Only SMS is supported via API. Use the JustCall dialer to place calls." }, { status: 400 });
  if (typeof b.body !== 'string' || !b.body.trim() || b.body.length > 1000) return NextResponse.json({ error: 'Enter a message under 1,000 characters.' }, { status: 400 });
  const contact = await outboundContact(sb, me, b.lead_id, b.to, 'Text');
  if ('error' in contact) return NextResponse.json({ error: contact.error }, { status: contact.status });

  const admin = supabaseAdmin();
  // Pull all candidate rows for this firm scope, then pick the best one in code
  // (prefer firm-specific over global, and a row that actually has a sending number).
  const { data: rows } = await admin.from("justcall_accounts")
    .select("api_key, api_secret, justcall_number, firm_id, active")
    .or(`firm_id.eq.${contact.lead.firm_id},firm_id.is.null`);
  const candidates = (rows || []).filter((r: any) => r.active !== false);
  const acct = candidates.sort((a: any, b: any) => {
    // firm-specific first
    if (!!a.firm_id !== !!b.firm_id) return a.firm_id ? -1 : 1;
    // then rows that have a sending number first
    if (!!a.justcall_number !== !!b.justcall_number) return a.justcall_number ? -1 : 1;
    return 0;
  })[0];
  if (!acct) return NextResponse.json({ error: "No JustCall account configured. Add one in Integrations." }, { status: 200 });
  if (!acct.justcall_number) return NextResponse.json({ error: "Set your JustCall sending number in Integrations -> JustCall (the FROM line)." }, { status: 200 });

  const to = contact.to;
  if (to.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "invalid number" }, { status: 400 });

  const payload = JSON.stringify({ justcall_number: e164(acct.justcall_number), contact_number: to, body: b.body || "" });
  const url = "https://api.justcall.io/v2.1/texts/new";
  // JustCall's spec shows raw "api_key:api_secret"; some accounts want HTTP Basic.
  // Try raw first, fall back to Basic on 401 so it works either way.
  const rawAuth = `${acct.api_key}:${acct.api_secret}`;
  const basicAuth = `Basic ${btoa(rawAuth)}`;

  async function send(authHeader: string) {
    return fetch(url, { method: "POST", headers: { "Authorization": authHeader, "Content-Type": "application/json", "Accept": "application/json" }, body: payload });
  }

  try {
    let r = await send(rawAuth);
    if (r.status === 401) r = await send(basicAuth);
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: d.message || d.error || `JustCall ${r.status}` }, { status: 200 });
    const saved = await admin.from('communications').insert({ lead_id: contact.lead.id, firm_id: contact.lead.firm_id,
      channel: 'sms', direction: 'outbound', phone_raw: contact.lead.phone, phone_norm: normPhone(contact.lead.phone),
      body: b.body, agent_name: me.name, provider: 'justcall', sms_sid: String(d?.data?.[0]?.id ?? d?.data?.id ?? d?.id ?? '') || null,
      send_status: 'sent', occurred_at: new Date().toISOString() });
    if (saved.error) return NextResponse.json({ error: 'The text went out, but its file history did not save. Do not resend it.' }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ error: String(e?.message ?? e) }, { status: 200 }); }
}
