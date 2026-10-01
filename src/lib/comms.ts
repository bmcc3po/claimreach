// Communications ingest + attribution. Phone-only events stay unmatched when
// more than one active file has that number; never guess the newest file.
import { supabaseAdmin } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";

export function normPhone(p?: string | null): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

// JustCall's call_info.type is a call result; call_info.status may instead be
// an archive state such as "Unarchived". Only explicit results can drive a
// no-answer lane. Never infer one from a zero/absent duration.
export function providerCallResult(raw: unknown): "answered" | "unanswered" | "busy" | "voicemail" | "failed" | null {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  // Sales Dialer returns longer result names than the standard dialer.
  if (["answered", "connected", "outgoing_answered_call", "outgoing_human_answered", "call.answered"].includes(value)) return "answered";
  if (["unanswered", "no_answer", "outgoing_unanswered_call", "call.unanswered"].includes(value)) return "unanswered";
  if (value === "busy") return "busy";
  if (value === "voicemail" || value === "outgoing_machine_answered") return "voicemail";
  if (["failed", "outgoing_failed_call", "outgoing_restricted_call", "outgoing_blocked_call", "outgoing_cancelled_call", "outgoing_abandoned_call"].includes(value)) return "failed";
  return null;
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

// Find a unique unarchived file for a phone. A shared number cannot establish
// the right matter, even when one file was updated more recently.
export async function matchLeadByPhone(phone: string, db?: any): Promise<{ lead_id: string | null; firm_id: string | null }> {
  const norm = normPhone(phone);
  if (norm.length < 10) return { lead_id: null, firm_id: null };
  const admin = db ?? supabaseAdmin();
  const { data: candidates, error } = await admin.from("leads")
    .select("id, firm_id, status").eq("phone_norm", norm).is("archived_at", null).limit(2);
  if (error) throw new Error(`Could not match communication to a file: ${error.message}`);
  if (candidates?.length === 1) return { lead_id: candidates[0].id, firm_id: candidates[0].firm_id };
  return { lead_id: null, firm_id: null };
}

// The stored communication a repeated provider event matches.
const PRIOR_COLS = "id, lead_id, duration_sec, occurred_at, created_at, direction, channel";

// Insert a communication, attributing by phone. De-dupes on call_sid / sms_sid.
// Returns the row id; stamp_error when the first-dial metric did not save;
// error when a write failed. opts.db is for offline tests (defaults to the
// service client).
export async function ingestComm(c: {
  channel: "call" | "sms" | "voicemail"; direction: "inbound" | "outbound"; call_kind?: string;
  provider_call_result?: ReturnType<typeof providerCallResult>;
  phone?: string; agent_name?: string; agent_email?: string; body?: string; duration_sec?: number;
  recording_url?: string; transcript?: string; jc_summary?: string; jc_sentiment?: string; jc_insights?: any;
  call_sid?: string; sms_sid?: string; external_ref?: string; occurred_at?: string;
}, opts: { db?: any; onlyExisting?: boolean } = {}) {
  const admin = opts.db ?? supabaseAdmin();
  // de-dupe
  // A duplicate reports the lead and time the first delivery was filed under,
  // so callers (texted-in media) see the same answer on every repeat.
  if (c.call_sid) { const { data } = await admin.from("communications").select(PRIOR_COLS).eq("call_sid", c.call_sid).maybeSingle(); if (data) return await update(admin, data.id, c, data); }
  if (c.sms_sid) { const { data } = await admin.from("communications").select(PRIOR_COLS).eq("sms_sid", c.sms_sid).maybeSingle(); if (data) return await update(admin, data.id, c, data); }
  if (opts.onlyExisting) return { deferred: true };

  const { lead_id, firm_id } = await matchLeadByPhone(c.phone || "", admin);
  const row: any = {
    lead_id, firm_id, channel: c.channel, direction: c.direction, call_kind: c.call_kind ?? null,
    provider_call_result: c.provider_call_result ?? null,
    phone_raw: c.phone ?? null, phone_norm: normPhone(c.phone), agent_name: c.agent_name ?? null, agent_email: c.agent_email ?? null,
    body: c.body ?? null, duration_sec: c.duration_sec ?? null, recording_url: c.recording_url ?? null, transcript: c.transcript ?? null,
    jc_summary: c.jc_summary ?? null, jc_sentiment: c.jc_sentiment ?? null, jc_insights: c.jc_insights ?? {},
    call_sid: c.call_sid ?? null, sms_sid: c.sms_sid ?? null, external_ref: c.external_ref ?? null,
    occurred_at: c.occurred_at ?? new Date().toISOString(),
  };
  const { data, error } = await admin.from("communications").insert(row).select("id, lead_id").single();
  if (error) return { error: error.message };

  // Speed to lead, dial side: the FIRST outbound call or voicemail attempt to
  // this lead stamps leads.first_dialed_at with the call's own time. Guarded
  // so the first event wins and a call that predates the lead (orphans
  // reconciled later) never produces a negative speed.
  let stampError: string | undefined;
  if (data.lead_id && c.direction === "outbound" && (c.channel === "call" || c.channel === "voicemail")) {
    const st = await stampFirstDial(admin, data.lead_id, row.occurred_at);
    if (!st.ok) stampError = st.error;
  }

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

  return { id: data.id, lead_id: data.lead_id, matched: !!data.lead_id, occurred_at: row.occurred_at as string, ...(stampError ? { stamp_error: stampError } : {}) };
}


// Speed to lead, dial side: the first outbound call or voicemail attempt
// stamps leads.first_dialed_at with the call's own time. Guarded so a call
// that predates the lead never produces a negative speed, and an earlier
// call arriving late CORRECTS a later stamp instead of being ignored.
// A failed write is logged and returned, never swallowed (Astra round 6):
// the caller reports it, and a repeated event retries it.
export async function stampFirstDial(admin: any, leadId: string, occurredAt: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const first = await admin.from("leads").update({ first_dialed_at: occurredAt })
      .eq("id", leadId).is("first_dialed_at", null).lte("created_at", occurredAt);
    const earlier = await admin.from("leads").update({ first_dialed_at: occurredAt })
      .eq("id", leadId).gt("first_dialed_at", occurredAt).lte("created_at", occurredAt);
    const err = first?.error?.message || earlier?.error?.message;
    if (err) {
      console.error("first-dial stamp failed", leadId, err);
      return { ok: false, error: `The first-dial time did not save: ${err}` };
    }
    return { ok: true };
  } catch (e: any) {
    const msg = String(e?.message || e || "unknown error");
    console.error("first-dial stamp failed", leadId, msg);
    return { ok: false, error: `The first-dial time did not save: ${msg}` };
  }
}

// Fill in fields on an existing comm (e.g. recording arrives after the call event).
async function update(admin: any, id: string, c: any, prior?: {
  lead_id?: string | null; duration_sec?: number | null; occurred_at?: string | null; created_at?: string | null;
  direction?: string | null; channel?: string | null;
}) {
  // A duplicated event is a second chance for the metric write: if the first
  // event's first-dial stamp failed, the repeat repairs it (Astra round 5).
  // It stamps the ORIGINAL communication's time, never the duplicate's own
  // time or "now": the stored row is what happened (Astra round 6).
  let stampError: string | undefined;
  const direction = prior?.direction ?? c.direction;
  const channel = prior?.channel ?? c.channel;
  const originalAt = prior?.occurred_at ?? prior?.created_at ?? null;
  if (prior?.lead_id && direction === "outbound" && (channel === "call" || channel === "voicemail")) {
    if (originalAt) {
      const st = await stampFirstDial(admin, prior.lead_id, originalAt);
      if (!st.ok) stampError = st.error;
    } else {
      stampError = "The first-dial time was not repaired: the original call has no time on it.";
      console.error("first-dial stamp skipped", prior.lead_id, id, "original communication has no occurred_at");
    }
  }
  const patch: any = {};
  for (const k of ["recording_url", "transcript", "jc_summary", "jc_sentiment", "duration_sec", "body", "provider_call_result"]) if (c[k] != null) patch[k] = c[k];
  if (c.jc_insights) patch.jc_insights = c.jc_insights;
  let writeError: string | undefined;
  if (Object.keys(patch).length) {
    const { error } = await admin.from("communications").update(patch).eq("id", id);
    if (error) {
      writeError = `The call details did not save: ${error.message}`;
      console.error("communication update failed", id, error.message);
    }
  }

  // If this update is the moment duration first becomes known (the call-event came
  // before, with no duration), log the completed call now so it lands once.
  const durationJustArrived = !writeError && (c.duration_sec != null && c.duration_sec > 0) && (!prior?.duration_sec || prior.duration_sec < 1);
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
  // updated:true means "matched an existing row" (the webhook relies on it to
  // skip re-filing media); a failed write rides along as error.
  return { id, updated: true, lead_id: prior?.lead_id ?? null, occurred_at: prior?.occurred_at ?? null, ...(writeError ? { error: writeError } : {}), ...(stampError ? { stamp_error: stampError } : {}) };
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
