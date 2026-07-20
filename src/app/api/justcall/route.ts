import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";

export const runtime = "edge";

// Local phone formatter so we don't import from a client component into this edge route.
function fmtPhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (d.length !== 10) return raw || "";
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

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
    .select("role, firm_id, full_name").eq("id", auth.user.id).maybeSingle();
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

  // Activity Log entry so SMS sends and calls placed show up alongside everything else.
  if (action === "text") {
    const preview = (body || "").trim();
    await recordAudit({
      firm_id: lead?.firm_id ?? null,
      lead_id,
      actor: auth.user.id,
      actor_name: me.full_name ?? "User",
      category: "sms",
      description: `Texted ${fmtPhone(to)}${preview ? `: "${preview.slice(0, 80)}${preview.length > 80 ? "…" : ""}"` : ""}.`,
      meta: { to, channel: "sms" },
    });
  } else {
    await recordAudit({
      firm_id: lead?.firm_id ?? null,
      lead_id,
      actor: auth.user.id,
      actor_name: me.full_name ?? "User",
      category: "call",
      description: `Placed a call to ${fmtPhone(to)}.`,
      meta: { to, channel: "call" },
    });
  }

  return NextResponse.json({ ok: true, justcall: jcData });
}
