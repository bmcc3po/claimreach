import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { ingestComm, normPhone } from "@/lib/comms";
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
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json();
  if (b.op !== "sms") return NextResponse.json({ error: "Only SMS is supported via API. Use the JustCall dialer to place calls." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: acct } = await admin.from("justcall_accounts").select("api_key, api_secret, justcall_number")
    .or(`firm_id.eq.${me.firm_id},firm_id.is.null`).eq("active", true).order("firm_id", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
  if (!acct) return NextResponse.json({ error: "No JustCall account configured. Add one in Integrations." }, { status: 200 });
  if (!acct.justcall_number) return NextResponse.json({ error: "Set your JustCall sending number in Integrations -> JustCall (the FROM line)." }, { status: 200 });

  const to = e164(b.to);
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
    await ingestComm({ channel: "sms", direction: "outbound", phone: to, body: b.body, agent_name: me.full_name, sms_sid: String(d.id || d.data?.id || ""), occurred_at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ error: String(e?.message ?? e) }, { status: 200 }); }
}
