import { NextRequest, NextResponse } from "next/server";
import { ingestComm, normPhone, providerCallResult } from "@/lib/comms";
import { isSmsRevocation } from "@/lib/sms-opt-out";
import { supabaseAdmin } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
import {
  harvestMedia, mediaEventId, mediaHostsFromEnv, processInboundMedia, smsDirection, supabaseMediaStore,
  type MediaSummary,
} from "@/lib/inbound-media";
export const runtime = "edge";

// JustCall v2.1 webhook receiver. Field paths match JustCall's documented
// payloads exactly (call.* , jc.call_ai_generated, sd.* , sms.*).
// Events arrive out of order + duplicated; we de-dupe + update on call_sid/sms id.

function flattenTranscript(ai: any): string {
  const t = ai?.call_transcription;
  if (Array.isArray(t) && t.length) {
    return t.map((x: any) => `${x.speaker_id === 0 ? "Agent" : "Caller"}: ${x.sentence}`).join("\n");
  }
  return "";
}

// JustCall no longer posts here directly. It posts to the justcall-filter
// function in Supabase, which drops everything that is not ours (the whole
// account's dialer traffic) and passes the rest here with the key. So the key
// is required: no key set in Cloudflare, or a wrong or missing key, and the
// post is refused before anything is written.
function keyOk(got: string, want: string | undefined): boolean {
  if (!want || !got || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const got = req.headers.get("x-justcall-secret") || new URL(req.url).searchParams.get("secret") || "";
  if (!keyOk(got, process.env.JUSTCALL_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  let p: any;
  try { p = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  // Log what came through the filter so delivery and field mapping stay checkable.
  try { await supabaseAdmin().from("webhook_events").insert({ direction: "inbound", event_type: "justcall." + (p.type || "unknown"), status: "received", payload: p }); } catch {}

  const type: string = (p.type || "").toLowerCase();
  const d = p.data || {};

  try {
    // ---- SMS events (sms.sent / sms.received / message.*) ----
    if (type.startsWith("sms") || type.includes("message") || d.sms_info) {
      // JustCall says "Incoming" / "Outgoing"; "outgoing" contains "in", so
      // the old includes("in") test logged every sent text as inbound.
      const dir = smsDirection(type, d.direction);
      const r: any = await ingestComm({
        channel: "sms", direction: dir,
        phone: d.contact_number,
        body: d.sms_info?.body || d.body || "",
        agent_name: d.agent_name, agent_email: d.agent_email,
        sms_sid: String(d.id || ""),
        occurred_at: joinDT(d.sms_date, d.sms_time),
      });
      // A texted-in photo or document (accident report, license, insurance
      // card, car photos) files itself onto the one file that has the
      // sender's number (Brett, Sep 28: global, every campaign). Each
      // attachment is tracked on its own (src/lib/inbound-media.ts), so a
      // repeated delivery retries what failed and never files twice, and an
      // unknown or shared number waits for staff instead of being guessed.
      let media: MediaSummary | undefined;
      if (dir === "inbound") {
        const { items, ignored } = harvestMedia(d);
        if (items.length || ignored) {
          const admin = supabaseAdmin();
          const eventId = await mediaEventId(d, items);
          media = await processInboundMedia({
            store: supabaseMediaStore(admin, recordAudit),
            fetch: (u, init) => fetch(u, init),
            allowHosts: mediaHostsFromEnv(process.env.JUSTCALL_MEDIA_HOSTS),
          }, { provider: "justcall", eventId, phone: d.contact_number, items, ignored, occurredAt: r?.occurred_at ?? null });
          if (media.failed || media.rejected || media.errors.length) {
            // No claimant data in this log line: the event id, counts, reasons.
            const { errors, ...counts } = media;
            try {
              await admin.from("webhook_events").insert({
                direction: "inbound", event_type: "justcall.media", status: media.failed ? "failed" : "partial",
                payload: { event_id: eventId, ...counts }, error: errors.join(" | ").slice(0, 2000) || null,
              });
            } catch {}
          }
        }
      }
      // The response says what actually happened: a message that was not
      // recorded is an error, and the media counts are per attachment state.
      const mediaOut = media
        ? { attachments: media.attachments, saved: media.saved, quarantined: media.quarantined, failed: media.failed, rejected: media.rejected, in_progress: media.in_progress, ignored: media.ignored }
        : undefined;
      if (r?.error) {
        try { await supabaseAdmin().from("webhook_events").insert({ direction: "inbound", event_type: "justcall." + type, status: "failed", payload: p, error: String(r.error) }); } catch {}
        return NextResponse.json({ ok: false, kind: "sms", error: "message not recorded", media: mediaOut }, { status: 500 });
      }
      if (dir === "inbound" && isSmsRevocation(d.sms_info?.body || d.body || "")) {
        const phone = normPhone(d.contact_number);
        if (phone.length !== 10) return NextResponse.json({ error: "opt-out number could not be verified" }, { status: 500 });
        const admin = supabaseAdmin();
        // A shared number revokes texting across all files. Duplicate webhook
        // deliveries are idempotent; a failed update gets retried by provider.
        const { error: leadOptError } = await admin.from("leads").update({ perm_text: false }).eq("phone_norm", phone);
        const { error: pointOptError } = await admin.from("contact_points").update({ status: "opted_out" }).eq("kind", "mobile").eq("value", d.contact_number);
        if (leadOptError || pointOptError) return NextResponse.json({ error: "opt-out could not be saved" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, kind: "sms", media: mediaOut });
    }

    // ---- Sales Dialer calls (sd.*) ----
    if (type.startsWith("sd.")) {
      // A ringing/answered/update event is not a completed dial. Waiting for
      // the terminal event also prevents an early SID-only update from taking
      // the completed event's unique call SID without its phone or result.
      if (type !== "sd.call_completed") return NextResponse.json({ ok: true, kind: "sd_update_deferred" });
      const ci = d.call_info || {};
      const ai = d.justcall_ai || {};
      // A Sales Dialer update may contain only a SID and changed notes. If it
      // arrives before the completed event, creating a phone-less call would
      // permanently prevent attribution of the later completed event.
      if (!d.contact_number || !ci.direction || !d.call_date || !d.call_time || !(d.call_sid || d.call_id)) {
        if (type.endsWith("updated")) return NextResponse.json({ ok: true, kind: "sd_update_deferred" });
        return NextResponse.json({ error: "call identity or time missing" }, { status: 500 });
      }
      const r = await ingestComm({
        channel: "call", direction: String(ci.direction || "Outgoing").toLowerCase().includes("in") ? "inbound" : "outbound",
        call_kind: "dialer",
        provider_call_result: providerCallResult(ci.type || ci.status),
        phone: d.contact_number,
        duration_sec: Number(ci.duration || 0) || undefined,
        recording_url: ci.recording || undefined,
        transcript: flattenTranscript(ai) || undefined,
        jc_summary: ai.call_summary || undefined,
        jc_sentiment: ai.customer_sentiment || undefined,
        jc_insights: ai && Object.keys(ai).length ? ai : undefined,
        agent_name: d.agent_name, agent_email: d.agent_email,
        call_sid: String(d.call_sid || d.call_id || ""),
        occurred_at: joinDT(d.call_date, d.call_time),
      });
      if (r.error || ("stamp_error" in r && r.stamp_error)) return NextResponse.json({ error: "call not fully recorded" }, { status: 500 });
      return NextResponse.json({ ok: true, kind: "sd_call" });
    }

    // ---- JustCall calls + voicemail + AI report (call.* / jc.call_ai_generated) ----
    if (type.startsWith("call.") || type === "jc.call_ai_generated") {
      if (type === "jc.call_ai_generated") {
        // Enrich a completed call when it is already present. AI delivery can
        // precede completion, so it must never create a counted dial by itself.
        const ai = d.justcall_ai || {};
        if (!(d.call_sid || d.id)) return NextResponse.json({ ok: true, kind: "call_ai_deferred" });
        const enriched = await ingestComm({ channel: "call", direction: "inbound",
          call_sid: String(d.call_sid || d.id), phone: d.contact_number,
          transcript: flattenTranscript(ai) || undefined,
          jc_summary: ai.call_summary || undefined,
          jc_sentiment: ai.customer_sentiment || undefined,
          jc_insights: ai && Object.keys(ai).length ? ai : undefined,
        }, { onlyExisting: true });
        if (enriched.error || ("stamp_error" in enriched && enriched.stamp_error))
          return NextResponse.json({ error: "AI details not fully recorded" }, { status: 500 });
        return NextResponse.json({ ok: true, kind: "deferred" in enriched && enriched.deferred ? "call_ai_deferred" : "call_ai_enriched" });
      }
      if (type !== "call.completed" && type !== "call.voicemail")
        return NextResponse.json({ ok: true, kind: "call_update_deferred" });
      const ci = d.call_info || {};
      const cd = d.call_duration || {};
      const ai = d.justcall_ai || {};
      if (!d.contact_number || !ci.direction || !d.call_date || !d.call_time || !(d.call_sid || d.id)) {
        if (type !== "call.completed" && type !== "call.voicemail")
          return NextResponse.json({ ok: true, kind: "call_update_deferred" });
        return NextResponse.json({ error: "call identity or time missing" }, { status: 500 });
      }
      const isVoicemail = type === "call.voicemail" || String(ci.type).toLowerCase() === "voicemail";
      const direction = String(ci.direction || "").toLowerCase().includes("out") ? "outbound" : "inbound";

      const r = await ingestComm({
        channel: isVoicemail ? "voicemail" : "call",
        direction,
        call_kind: direction,
        provider_call_result: isVoicemail ? "voicemail" : providerCallResult(ci.type),
        phone: d.contact_number,
        duration_sec: Number(cd.total_duration ?? cd.conversation_time ?? 0) || undefined,
        recording_url: ci.recording || undefined,
        transcript: flattenTranscript(ai) || ci.voicemail_transcription || undefined,
        jc_summary: ai.call_summary || undefined,
        jc_sentiment: ai.customer_sentiment || undefined,
        jc_insights: ai && (ai.call_score || ai.call_summary || (ai.call_transcription || []).length) ? ai : undefined,
        agent_name: d.agent_name, agent_email: d.agent_email,
        call_sid: String(d.call_sid || d.id || ""),
        occurred_at: joinDT(d.call_date, d.call_time),
      });
      if (r.error || ("stamp_error" in r && r.stamp_error)) return NextResponse.json({ error: "call not fully recorded" }, { status: 500 });
      return NextResponse.json({ ok: true, kind: isVoicemail ? "voicemail" : "call" });
    }

    return NextResponse.json({ ok: true, kind: "ignored", type });
  } catch (e: any) {
    try { await supabaseAdmin().from("webhook_events").insert({ direction: "inbound", event_type: "justcall." + type, status: "failed", payload: p, error: String(e?.message ?? e) }); } catch {}
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}

function joinDT(date?: string, time?: string): string | undefined {
  if (!date) return undefined;
  return `${date}T${time || "00:00:00"}Z`;
}
