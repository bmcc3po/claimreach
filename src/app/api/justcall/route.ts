import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
import { requireStaff } from '@/lib/mva-call/server';
import { outboundContact } from '@/lib/outbound-contact';

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
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Open this action from ClaimReach.' }, { status: 403 });
  const sb = await supabaseServer();
  const actor = await requireStaff(sb);
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b || !['text','call'].includes(b.action)) return NextResponse.json({ error: 'action must be text or call' }, { status: 400 });
  const { action, lead_id, body } = b;
  if (action === 'text' && (typeof body !== 'string' || !body.trim() || body.length > 1000)) return NextResponse.json({ error: 'Enter a message under 1,000 characters.' }, { status: 400 });
  const contact = await outboundContact(sb, actor, lead_id, b.to, action === 'text' ? 'Text' : 'Call');
  if ('error' in contact) return NextResponse.json({ error: contact.error }, { status: contact.status });
  const { lead, to } = contact;

  const apiKey = process.env.JUSTCALL_API_KEY;
  const apiSecret = process.env.JUSTCALL_API_SECRET;
  const from = process.env.JUSTCALL_DEFAULT_FROM;
  if (!apiKey || !apiSecret || !from) {
    return NextResponse.json({ error: "justcall keys missing" }, { status: 500 });
  }
  const authHeader = `${apiKey}:${apiSecret}`;

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

  const saved = await sb.from("lead_activity").insert({
    firm_id: lead?.firm_id,
    lead_id,
    kind,
    actor: actor.id,
    body: action === "text" ? body : null,
    meta: { to, justcall: jcData },
  });
  if (saved.error) return NextResponse.json({ error: 'The provider accepted the action, but its file history did not save. Do not retry it.' }, { status: 503 });

  // Activity Log entry so SMS sends and calls placed show up alongside everything else.
  if (action === "text") {
    const preview = (body || "").trim();
    await recordAudit({
      firm_id: lead?.firm_id ?? null,
      lead_id,
      actor: actor.id,
      actor_name: actor.name ?? "User",
      category: "sms",
      description: `Texted ${fmtPhone(to)}${preview ? `: "${preview.slice(0, 80)}${preview.length > 80 ? "…" : ""}"` : ""}.`,
      meta: { to, channel: "sms" },
    });
  } else {
    await recordAudit({
      firm_id: lead?.firm_id ?? null,
      lead_id,
      actor: actor.id,
      actor_name: actor.name ?? "User",
      category: "call",
      description: `Placed a call to ${fmtPhone(to)}.`,
      meta: { to, channel: "call" },
    });
  }

  return NextResponse.json({ ok: true, justcall: jcData });
}
