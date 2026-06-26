import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

// JustCall API v2.1. Keys stay server-side.
// POST { action: 'text' | 'call', lead_id, to, body? }
//  - text: sends SMS from JUSTCALL_DEFAULT_FROM, logs text_out activity
//  - call: initiates click-to-call between agent number and lead, logs call
// Recording stitch is deferred (webhook timing); this initiates + logs.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb.from("app_users")
    .select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.JUSTCALL_API_KEY;
  const apiSecret = process.env.JUSTCALL_API_SECRET;
  const from = process.env.JUSTCALL_DEFAULT_FROM;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "justcall keys missing" }, { status: 500 });
  }
  const authHeader = `${apiKey}:${apiSecret}`;

  const { action, lead_id, to, body } = await req.json();
  if (!lead_id || !to) return NextResponse.json({ error: "lead_id and to required" }, { status: 400 });

  // Comms-safety guard: refuse to contact a monitored line on an unsafe channel.
  const { data: lead } = await sb.from("leads")
    .select("comms_monitored, comms_safe_channels, firm_id")
    .eq("id", lead_id).maybeSingle();
  if (lead?.comms_monitored) {
    const safe: string[] = Array.isArray(lead.comms_safe_channels) ? lead.comms_safe_channels : [];
    const need = action === "text" ? "Text" : "Call";
    if (!safe.includes(need)) {
      return NextResponse.json(
        { error: `blocked: ${need} is not a safe channel for this monitored contact` },
        { status: 409 }
      );
    }
  }

  let jcResp: Response;
  let kind: "text_out" | "call";
  if (action === "text") {
    kind = "text_out";
    jcResp = await fetch("https://api.justcall.io/v2.1/texts/new", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ justcall_number: from, contact_number: to, body: body ?? "" }),
    });
  } else if (action === "call") {
    kind = "call";
    jcResp = await fetch("https://api.justcall.io/v2.1/calls", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ justcall_number: from, contact_number: to, type: "outbound" }),
    });
  } else {
    return NextResponse.json({ error: "action must be text or call" }, { status: 400 });
  }

  const jcData = await jcResp.json().catch(() => ({}));
  if (!jcResp.ok) {
    return NextResponse.json({ error: "justcall error", detail: jcData }, { status: 502 });
  }

  await sb.from("lead_activity").insert({
    firm_id: lead?.firm_id,
    lead_id,
    kind,
    actor: auth.user.id,
    body: action === "text" ? body : null,
    meta: { to, justcall: jcData },
  });

  return NextResponse.json({ ok: true, justcall: jcData });
}
