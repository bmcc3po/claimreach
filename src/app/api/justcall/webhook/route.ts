import { NextRequest, NextResponse } from "next/server";
import { ingestComm } from "@/lib/comms";
import { supabaseAdmin } from "@/lib/supabase-server";
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
      const dir = String(d.direction || "").toLowerCase().includes("in") ? "inbound" : "outbound";
      const r = await ingestComm({
        channel: "sms", direction: dir,
        phone: d.contact_number,
        body: d.sms_info?.body || d.body || "",
        agent_name: d.agent_name, agent_email: d.agent_email,
        sms_sid: String(d.id || ""),
        occurred_at: joinDT(d.sms_date, d.sms_time),
      });
      // A texted-in photo or document (accident report, license, insurance
      // card, car photos) files itself: when the sender's number is on a
      // file, every MMS attachment lands in that case's Documents (Brett,
      // Sep 28 — global, every campaign). A duplicated event returns
      // updated:true and is skipped, so nothing stores twice.
      const leadId = (r as any)?.lead_id ?? null;
      if (dir === "inbound" && leadId && !(r as any)?.updated) {
        await storeInboundMedia(leadId, d, String(d.id || ""));
      }
      return NextResponse.json({ ok: true, kind: "sms", media_saved: dir === "inbound" && leadId ? true : undefined });
    }

    // ---- Sales Dialer calls (sd.*) ----
    if (type.startsWith("sd.")) {
      const ci = d.call_info || {};
      const ai = d.justcall_ai || {};
      await ingestComm({
        channel: "call", direction: String(ci.direction || "Outgoing").toLowerCase().includes("in") ? "inbound" : "outbound",
        call_kind: "dialer",
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
      return NextResponse.json({ ok: true, kind: "sd_call" });
    }

    // ---- JustCall calls + voicemail + AI report (call.* / jc.call_ai_generated) ----
    if (type.startsWith("call.") || type === "jc.call_ai_generated") {
      const ci = d.call_info || {};
      const cd = d.call_duration || {};
      const ai = d.justcall_ai || {};
      const isVoicemail = type === "call.voicemail" || String(ci.type).toLowerCase() === "voicemail";
      const direction = String(ci.direction || "").toLowerCase().includes("out") ? "outbound" : "inbound";

      await ingestComm({
        channel: isVoicemail ? "voicemail" : "call",
        direction,
        call_kind: direction,
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

// Every MMS attachment on an inbound text from a number on file goes into the
// case's Documents. JustCall spells the media list a few ways across payload
// versions, so harvest defensively; a photo is a client_photo, a PDF a
// client_doc, anything else a client_file.
function harvestMedia(d: any): { url: string; type: string }[] {
  const raw: any[] = []
    .concat(Array.isArray(d?.sms_info?.mms) ? d.sms_info.mms : [])
    .concat(Array.isArray(d?.mms) ? d.mms : [])
    .concat(Array.isArray(d?.media) ? d.media : []);
  const out: { url: string; type: string }[] = [];
  for (const m of raw) {
    const url = typeof m === "string" ? m : String(m?.media_url || m?.url || m?.link || "");
    if (!/^https?:\/\//.test(url)) continue;
    const type = typeof m === "object" ? String(m?.content_type || m?.type || "") : "";
    if (!out.some((x) => x.url === url)) out.push({ url, type });
  }
  return out.slice(0, 10);
}

function extOf(url: string, type: string): string {
  const t = type.toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("png")) return "png";
  if (t.includes("gif")) return "gif";
  if (t.includes("webp")) return "webp";
  if (t.includes("heic")) return "heic";
  if (t.includes("pdf")) return "pdf";
  const m = url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "bin";
}

async function storeInboundMedia(leadId: string, d: any, smsId: string): Promise<void> {
  const media = harvestMedia(d);
  if (!media.length) return;
  const admin = supabaseAdmin();
  const { data: lead } = await admin.from("leads").select("id, firm_id").eq("id", leadId).maybeSingle();
  if (!lead) return;
  const saved: string[] = [];
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    try {
      const res = await fetch(m.url);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.length > 25 * 1024 * 1024) continue;
      const type = m.type || res.headers.get("content-type") || "application/octet-stream";
      const ext = extOf(m.url, type);
      const isImage = /^image\//i.test(type) || ["jpg", "png", "gif", "webp", "heic"].includes(ext);
      const stamp = new Date().toISOString().slice(0, 10);
      const fileName = `texted_in_${stamp}_${i + 1}.${ext}`;
      const path = `${lead.firm_id}/${lead.id}/mms_${smsId || Date.now()}_${i}_${fileName}`;
      const up = await admin.storage.from("case-docs").upload(path, bytes, { contentType: type, upsert: false });
      if (up.error) continue;
      await admin.from("case_documents").insert({
        firm_id: lead.firm_id, lead_id: lead.id,
        doc_type: isImage ? "client_photo" : ext === "pdf" ? "client_doc" : "client_file",
        file_name: fileName, storage_path: path,
        uploaded_by_name: "Texted in by the PNC",
      });
      saved.push(fileName);
    } catch { /* one bad attachment never blocks the rest */ }
  }
  if (saved.length) {
    try {
      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({
        firm_id: lead.firm_id, lead_id: lead.id, actor_name: "PNC (text)", category: "docs",
        description: `Texted in ${saved.length} file${saved.length === 1 ? "" : "s"} — saved to Documents.`,
        meta: { files: saved, sms_id: smsId || null },
      });
    } catch {}
  }
}
