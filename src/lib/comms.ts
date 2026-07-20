// Communications ingest + attribution. Given a phone number, find the right file:
// newest OPEN lead with that number wins; no match -> unmatched (lead_id null).
import { supabaseAdmin } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";

export function normPhone(p?: string | null): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

function fmtDuration(sec?: number): string {
  if (!sec || sec < 1) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtPhoneComm(raw?: string): string {
  const d = (raw || "").replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (d.length !== 10) return raw || "";
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const OPEN_STATUSES = ["new", "in_progress", "qualified", "wip", "pending"];

// Find the file for an inbound/outbound comm by phone. Newest open file wins;
// if none open, newest file of any status; if none, null (unmatched).
export async function matchLeadByPhone(phone: string): Promise<{ lead_id: string | null; firm_id: string | null }> {
  const norm = normPhone(phone);
  if (norm.length < 10) return { lead_id: null, firm_id: null };
  const admin = supabaseAdmin();
  // prefer open files
  const { data: open } = await admin.from("leads")
    .select("id, firm_id, status, created_at").eq("phone_norm", norm)
    .in("status", OPEN_STATUSES).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (open) return { lead_id: open.id, firm_id: open.firm_id };
  const { data: any1 } = await admin.from("leads")
    .select("id, firm_id, created_at").eq("phone_norm", norm).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (any1) return { lead_id: any1.id, firm_id: any1.firm_id };
  return { lead_id: null, firm_id: null };
}

// Insert a communication, attributing by phone. De-dupes on call_sid / sms_sid.
export async function ingestComm(c: {
  channel: "call" | "sms" | "voicemail"; direction: "inbound" | "outbound"; call_kind?: string;
  phone?: string; agent_name?: string; agent_email?: string; body?: string; duration_sec?: number;
  recording_url?: string; transcript?: string; jc_summary?: string; jc_sentiment?: string; jc_insights?: any;
  call_sid?: string; sms_sid?: string; external_ref?: string; occurred_at?: string;
}) {
  const admin = supabaseAdmin();
  // de-dupe
  if (c.call_sid) { const { data } = await admin.from("communications").select("id, lead_id, duration_sec").eq("call_sid", c.call_sid).maybeSingle(); if (data) return await update(admin, data.id, c, data); }
  if (c.sms_sid) { const { data } = await admin.from("communications").select("id, lead_id, duration_sec").eq("sms_sid", c.sms_sid).maybeSingle(); if (data) return await update(admin, data.id, c, data); }

  const { lead_id, firm_id } = await matchLeadByPhone(c.phone || "");
  const row: any = {
    lead_id, firm_id, channel: c.channel, direction: c.direction, call_kind: c.call_kind ?? null,
    phone_raw: c.phone ?? null, phone_norm: normPhone(c.phone), agent_name: c.agent_name ?? null, agent_email: c.agent_email ?? null,
    body: c.body ?? null, duration_sec: c.duration_sec ?? null, recording_url: c.recording_url ?? null, transcript: c.transcript ?? null,
    jc_summary: c.jc_summary ?? null, jc_sentiment: c.jc_sentiment ?? null, jc_insights: c.jc_insights ?? {},
    call_sid: c.call_sid ?? null, sms_sid: c.sms_sid ?? null, external_ref: c.external_ref ?? null,
    occurred_at: c.occurred_at ?? new Date().toISOString(),
  };
  const { data, error } = await admin.from("communications").insert(row).select("id, lead_id").single();
  if (error) return { error: error.message };

  // Activity Log: log completed calls/voicemails (with duration when known) so the
  // file timeline shows "Call to (702) 555-1234, 1:03" alongside everything else.
  if (data.lead_id && (c.channel === "call" || c.channel === "voicemail")) {
    const dur = fmtDuration(c.duration_sec);
    const dirWord = c.direction === "inbound" ? "Inbound call from" : "Call to";
    const label = c.channel === "voicemail"
      ? `Voicemail ${c.direction === "inbound" ? "from" : "to"} ${fmtPhoneComm(c.phone)}.`
      : `${dirWord} ${fmtPhoneComm(c.phone)}${dur ? `, ${dur}` : ""}.`;
    await recordAudit({
      firm_id, lead_id: data.lead_id,
      actor_name: c.agent_name || "JustCall",
      category: "call",
      description: label,
      meta: { call_sid: c.call_sid, duration_sec: c.duration_sec ?? null, channel: c.channel, direction: c.direction },
    });
  }

  return { id: data.id, lead_id: data.lead_id, matched: !!data.lead_id };
}

// Fill in fields on an existing comm (e.g. recording arrives after the call event).
async function update(admin: any, id: string, c: any, prior?: { lead_id?: string | null; duration_sec?: number | null }) {
  const patch: any = {};
  for (const k of ["recording_url", "transcript", "jc_summary", "jc_sentiment", "duration_sec", "body"]) if (c[k] != null) patch[k] = c[k];
  if (c.jc_insights) patch.jc_insights = c.jc_insights;
  if (Object.keys(patch).length) await admin.from("communications").update(patch).eq("id", id);

  // If this update is the moment duration first becomes known (the call-event came
  // before, with no duration), log the completed call now so it lands once.
  const durationJustArrived = (c.duration_sec != null && c.duration_sec > 0) && (!prior?.duration_sec || prior.duration_sec < 1);
  if (durationJustArrived && prior?.lead_id && (c.channel === "call" || c.channel === "voicemail")) {
    const dur = fmtDuration(c.duration_sec);
    const dirWord = c.direction === "inbound" ? "Inbound call from" : "Call to";
    await recordAudit({
      lead_id: prior.lead_id,
      actor_name: c.agent_name || "JustCall",
      category: "call",
      description: `${dirWord} ${fmtPhoneComm(c.phone)}${dur ? `, ${dur}` : ""}.`,
      meta: { call_sid: c.call_sid, duration_sec: c.duration_sec, channel: c.channel, direction: c.direction },
    });
  }
  return { id, updated: true };
}

// When a new lead is created, sweep the unmatched inbox and attach orphaned
// comms that share its phone number.
export async function reconcileUnmatched(leadId: string, phone: string, firmId: string | null) {
  const norm = normPhone(phone);
  if (norm.length < 10) return 0;
  const admin = supabaseAdmin();
  const { data } = await admin.from("communications").update({ lead_id: leadId, firm_id: firmId }).is("lead_id", null).eq("phone_norm", norm).select("id");
  return data?.length ?? 0;
}
