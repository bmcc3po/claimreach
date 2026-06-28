import { NextRequest, NextResponse } from "next/server";
import { ingestComm } from "@/lib/comms";
import { supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// JustCall webhook receiver. Handles call, SMS, and voicemail events.
// JustCall payloads vary by event; we normalize the common shapes.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let p: any;
  try { p = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  // optional shared-secret check (set JUSTCALL_WEBHOOK_SECRET to enforce)
  const want = process.env.JUSTCALL_WEBHOOK_SECRET;
  if (want) {
    const got = req.headers.get("x-justcall-secret") || new URL(req.url).searchParams.get("secret");
    if (got !== want) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const evt = (p.type || p.event || p.event_type || "").toLowerCase();
  const data = p.data || p;

  try {
    // ---- SMS ----
    if (evt.includes("sms") || data.sms_info || data.message) {
      const dir = (data.direction || data.sms_direction || (evt.includes("inbound") ? "inbound" : "outbound")).toLowerCase().includes("in") ? "inbound" : "outbound";
      const phone = dir === "inbound" ? (data.contact_number || data.from || data.sender) : (data.contact_number || data.to || data.receiver);
      await ingestComm({
        channel: "sms", direction: dir, phone,
        body: data.body || data.message || data.text || "",
        agent_name: data.agent_name, agent_email: data.agent_email,
        sms_sid: String(data.id || data.sms_id || data.message_id || ""),
        occurred_at: data.datetime || data.created_at,
      });
      return NextResponse.json({ ok: true, kind: "sms" });
    }

    // ---- Voicemail ----
    if (evt.includes("voicemail") || data.voicemail || data.voicemail_url) {
      await ingestComm({
        channel: "voicemail", direction: "inbound", phone: data.contact_number || data.from,
        recording_url: data.voicemail_url || data.recording || data.recording_url,
        transcript: data.transcription || data.transcript,
        agent_name: data.agent_name, agent_email: data.agent_email,
        call_sid: String(data.call_sid || data.id || ""),
        occurred_at: data.datetime || data.created_at,
      });
      return NextResponse.json({ ok: true, kind: "voicemail" });
    }

    // ---- Call (inbound / outbound / sales dialer) ----
    // dialer calls carry a campaign/dialer marker; otherwise use direction.
    const dirRaw = (data.direction || data.call_direction || "").toLowerCase();
    const isDialer = !!(data.dialer || data.campaign_id || data.sales_dialer || (data.call_type || "").toLowerCase().includes("dialer"));
    const direction = dirRaw.includes("in") ? "inbound" : "outbound";
    const call_kind = isDialer ? "dialer" : direction;
    await ingestComm({
      channel: "call", direction, call_kind,
      phone: data.contact_number || data.client_number || data.from || data.to,
      duration_sec: Number(data.call_duration || data.duration || 0) || undefined,
      recording_url: data.recording_url || data.recording || (data.call_info && data.call_info.recording) || undefined,
      transcript: data.transcription || data.transcript || undefined,
      jc_summary: data.ai_summary || (data.ai && data.ai.summary) || undefined,
      jc_sentiment: data.sentiment || (data.ai && data.ai.sentiment) || undefined,
      jc_insights: data.ai || data.ai_insights || undefined,
      agent_name: data.agent_name, agent_email: data.agent_email,
      call_sid: String(data.call_sid || data.id || data.unique_id || ""),
      occurred_at: data.datetime || data.call_date || data.created_at,
    });
    return NextResponse.json({ ok: true, kind: "call", dialer: isDialer });
  } catch (e: any) {
    try { await supabaseAdmin().from("webhook_events").insert({ direction: "inbound", event_type: "justcall." + evt, status: "failed", payload: p, error: String(e?.message ?? e) }); } catch {}
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
