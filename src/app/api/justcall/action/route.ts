import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { ingestComm, normPhone } from "@/lib/comms";
export const runtime = "edge";

// Click-to-call + outbound SMS via JustCall API.
// POST { op:'call'|'sms', lead_id, to, body? }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json();
  const admin = supabaseAdmin();
  // firm JC account, else master/default
  const { data: acct } = await admin.from("justcall_accounts").select("api_key, api_secret")
    .or(`firm_id.eq.${me.firm_id},firm_id.is.null`).eq("active", true).order("firm_id", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
  if (!acct) return NextResponse.json({ error: "No JustCall account configured. Add one in Integrations." }, { status: 200 });

  const authHeader = `${acct.api_key}:${acct.api_secret}`;
  const to = normPhone(b.to);
  if (to.length < 10) return NextResponse.json({ error: "invalid number" }, { status: 400 });

  if (b.op === "sms") {
    try {
      const r = await fetch("https://api.justcall.io/v2/texts/new", {
        method: "POST", headers: { "Authorization": authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ contact_number: to, body: b.body || "" }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok) return NextResponse.json({ error: d.message || `JustCall ${r.status}` }, { status: 200 });
      // log it to the file immediately
      await ingestComm({ channel: "sms", direction: "outbound", phone: to, body: b.body, agent_name: me.full_name, sms_sid: String(d.id || d.data?.id || ""), occurred_at: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    } catch (e: any) { return NextResponse.json({ error: String(e?.message ?? e) }, { status: 200 }); }
  }

  if (b.op === "call") {
    // JustCall click-to-call dials the agent's device then the contact.
    try {
      const r = await fetch("https://api.justcall.io/v2/calls/new", {
        method: "POST", headers: { "Authorization": authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ contact_number: to, agent_email: me.full_name ? undefined : undefined }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok) return NextResponse.json({ error: d.message || `JustCall ${r.status}. You can also dial from the JustCall app.` }, { status: 200 });
      return NextResponse.json({ ok: true });
    } catch (e: any) { return NextResponse.json({ error: String(e?.message ?? e) }, { status: 200 }); }
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
