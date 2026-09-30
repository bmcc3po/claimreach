// ============================================================================
// Automation engine core.
//   - matchAndStart: given an event, find active automations whose trigger +
//     conditions fit the lead, open runs, enqueue step 0 at its computed run_at.
//   - condition evaluation, send-window/timezone gating, and the queue insert
//     all live here. The step EXECUTOR (draining the queue) lives in
//     automation-exec.ts so the cron stays thin.
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";

export type TriggerType =
  | "status_changed" | "lead_created" | "no_contact_timer"
  | "client_replied" | "esign_sent" | "esign_viewed" | "esign_signed" | "time_of_day";

export interface AutomationRow {
  id: string; firm_id: string | null; name: string; active: boolean;
  trigger_type: TriggerType; trigger_config: any; conditions: any;
  steps: any[]; stop_conditions: string[]; send_window: any; retrigger: boolean;
}

// ---- timezone from state (Brett's rotation: East/Central/Mountain/Pacific) ----
const STATE_TZ: Record<string, string> = {
  // Eastern
  CT: "America/New_York", DE: "America/New_York", FL: "America/New_York", GA: "America/New_York",
  IN: "America/New_York", ME: "America/New_York", MD: "America/New_York", MA: "America/New_York",
  MI: "America/New_York", NH: "America/New_York", NJ: "America/New_York", NY: "America/New_York",
  NC: "America/New_York", OH: "America/New_York", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", VT: "America/New_York", VA: "America/New_York", WV: "America/New_York", DC: "America/New_York",
  // Central
  AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago", IA: "America/Chicago",
  KS: "America/Chicago", KY: "America/Chicago", LA: "America/Chicago", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", NE: "America/Chicago", ND: "America/Chicago",
  OK: "America/Chicago", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", WI: "America/Chicago",
  // Mountain
  AZ: "America/Phoenix", CO: "America/Denver", ID: "America/Denver", MT: "America/Denver",
  NM: "America/Denver", UT: "America/Denver", WY: "America/Denver",
  // Pacific
  CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  // Alaska / Hawaii
  AK: "America/Anchorage", HI: "Pacific/Honolulu",
};

export function tzForState(state?: string | null): string {
  const key = (state || "").trim().toUpperCase();
  if (["AK", "AZ", "FL", "ID", "IN", "KS", "KY", "MI", "NE", "ND", "OR", "SD", "TN", "TX"].includes(key)) throw new Error("This state spans time zones; verify the client time zone first.");
  const tz = STATE_TZ[key];
  if (!tz) throw new Error("A verified client time zone is required for this automation.");
  return tz;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Never fall back to "send now" on invalid configuration. Empty configuration
// is deliberately unscheduled (for internal steps); outbound remains disabled.
export function clampToWindow(desired: Date, window: any, leadState?: string | null, clientTimeZone?: string | null): Date {
  if (!Number.isFinite(desired.getTime())) throw new Error("Invalid automation date.");
  if (window == null || (typeof window === "object" && !Array.isArray(window) && Object.keys(window).length === 0)) return new Date(desired);
  const clock = (value: unknown) => {
    if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Invalid automation calling window.");
    const [h, m] = value.split(":").map(Number); return h * 60 + m;
  };
  const start = clock(window.start), end = clock(window.end);
  if (start >= end) throw new Error("Automation windows must start before they end.");
  if (window.mode !== "fixed" && window.mode !== "lead_tz") throw new Error("Invalid automation time-zone mode.");
  const tz = window.mode === "fixed" ? window.tz : (clientTimeZone || tzForState(leadState));
  if (typeof tz !== "string" || !tz) throw new Error("An automation time zone is required.");
  const days = window.days === undefined ? DAY_KEYS.slice(1, 6) : window.days;
  if (!Array.isArray(days) || !days.length || days.some(d => !DAY_KEYS.includes(d))) throw new Error("Invalid automation calling days.");
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const allowed = (d: Date) => {
    const parts = fmt.formatToParts(d);
    const value = (type: string) => parts.find(p => p.type === type)?.value;
    const mins = Number(value("hour")) * 60 + Number(value("minute"));
    return days.includes(String(value("weekday")).toLowerCase()) && mins >= start && mins < end;
  };
  if (allowed(desired)) return new Date(desired);
  // Test exact minute boundaries in UTC: this respects DST gaps/repeats and
  // reaches 08:00 even when the desired instant was 07:59:37 or 21:04:12.
  const firstMinute = Math.floor(desired.getTime() / 60000) * 60000 + 60000;
  for (let i = 0; i < 8 * 24 * 60; i++) {
    const t = new Date(firstMinute + i * 60000);
    if (allowed(t)) return t;
  }
  throw new Error("No permitted automation window was found.");
}

export function automationStepRunAt(step: { type: string; config?: any } | undefined, base: Date): Date {
  if (step?.type !== "wait") return base;
  const c = step.config || {};
  const values = [c.minutes ?? 0, c.hours ?? 0, c.days ?? 0];
  if (values.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0)) throw new Error("Invalid automation wait duration.");
  const ms = values[0] * 60000 + values[1] * 3600000 + values[2] * 86400000;
  const next = new Date(base.getTime() + ms);
  if (!Number.isFinite(next.getTime())) throw new Error("Invalid automation wait date.");
  return next;
}

// ---- condition evaluation ----
function getField(lead: any, claim: any, field: string): any {
  switch (field) {
    case "case_type": return claim?.claim_type ?? lead.case_type;
    case "status": return claim?.status;
    case "source": return lead.source;
    case "campaign": return claim?.campaign;
    case "firm_id": return lead.firm_id;
    case "state": return lead.mail_state ?? lead.state;
    case "language": return lead.language;
    case "assigned_agent": return lead.assigned_agent;
    case "tags": return lead.tags;
    default: return undefined;
  }
}

export function conditionsMatch(conditions: any, lead: any, claim: any): boolean {
  const rules: any[] = conditions?.rules ?? [];
  if (!Array.isArray(rules)) throw new Error("Invalid automation conditions.");
  if (rules.length === 0) return true;
  const match = conditions.match === "any" ? "any" : "all";
  const evalRule = (r: any) => {
    if (!r || !["case_type", "status", "source", "campaign", "firm_id", "state", "language", "assigned_agent", "tags"].includes(r.field)) throw new Error("Invalid automation condition field.");
    const v = getField(lead, claim, r.field);
    switch (r.op) {
      case "is": return String(v ?? "") === String(r.value ?? "");
      case "is_not": return String(v ?? "") !== String(r.value ?? "");
      case "any_of": return Array.isArray(r.values) && r.values.map(String).includes(String(v ?? ""));
      case "contains": return String(v ?? "").toLowerCase().includes(String(r.value ?? "").toLowerCase());
      case "not_blank": return v != null && String(v).trim() !== "";
      case "is_blank": return v == null || String(v).trim() === "";
      default: return false;
    }
  };
  return match === "all" ? rules.every(evalRule) : rules.some(evalRule);
}

// Does this automation's trigger fit the event?
function triggerFits(a: AutomationRow, ev: { type: TriggerType; toStatus?: string; fromStatus?: string }): boolean {
  if (a.trigger_type !== ev.type) return false;
  if (ev.type === "status_changed") {
    const cfg = a.trigger_config || {};
    if (cfg.to && cfg.to !== ev.toStatus) return false;
    if (cfg.from && cfg.from !== ev.fromStatus) return false;
  }
  return true;
}

// All queue effects use one explicit matter, never whichever sibling changed
// most recently. Legacy unbound events may resolve only a genuinely sole claim.
export async function loadAutomationTarget(admin: any, leadId: string, claimId?: string | null) {
  const { data: lead, error: le } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (le || !lead?.firm_id) throw new Error("Could not verify the automation's file and firm.");
  const { data: claims, error: ce } = await admin.from("claims").select("*").eq("lead_id", leadId);
  if (ce || !Array.isArray(claims)) throw new Error("Could not verify the automation's matter.");
  const claim = claimId ? claims.find((c: any) => c.id === claimId) : claims.length === 1 ? claims[0] : null;
  if (!claim || claim.firm_id !== lead.firm_id) throw new Error("Automation matter is missing, ambiguous, or belongs to a different firm.");
  if (!claim.status) throw new Error("Could not verify the automation's matter status.");
  const { data: definition, error: se } = await admin.from("statuses").select("key,qualify,phase,requires_esign")
    .eq("key", claim.status).maybeSingle();
  if (se || !definition) throw new Error("Could not verify automation status rules.");
  const key = String(claim.status).toLowerCase();
  const blocked = lead.archived_at ? "file archived" :
    lead.is_test === true || key === "test" || key === "test_lead" ? "test file" :
    definition?.qualify === "disqualify" || definition?.phase === "terminal" ||
      /^(?:dq(?:_|$)|external_dq_review$|signed_dropped$|not_interested$|dnc$|duplicate$|dead$|declined$|dropped$|wrong_number$|already_represented$)/.test(key) ? "file disqualified or closed" : null;
  return { lead, claim, soleClaim: claims.length === 1, blocked, statusDefinition: definition };
}

// Existing PK gives concurrent non-retrigger starts one durable owner without
// a new schema dependency. Old random-ID runs remain covered by the lookup.
async function onceRunId(firmId: string, automationId: string, leadId: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["claimreach.automation.once.v1", firmId, automationId, leadId])));
  const h = Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32).split("");
  h[12] = "5"; h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  const v = h.join(""); return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}

export async function matchAndStart(ev: {
  type: TriggerType; lead_id: string; claim_id?: string | null; toStatus?: string; fromStatus?: string;
}): Promise<{ started: number }> {
  const admin = supabaseAdmin();
  const { data: automations, error: ae } = await admin.from("automations")
    .select("*").eq("active", true).eq("trigger_type", ev.type);
  if (ae || !Array.isArray(automations)) throw new Error("Could not read active automations.");
  if (!automations.length) return { started: 0 };
  const { lead, claim, blocked } = await loadAutomationTarget(admin, ev.lead_id, ev.claim_id);
  if (blocked) return { started: 0 };
  if (ev.type === "status_changed" && ev.toStatus && claim.status !== ev.toStatus) return { started: 0 };

  let started = 0;
  for (const a of automations as AutomationRow[]) {
    if (a.firm_id && a.firm_id !== lead.firm_id) continue;
    if (!triggerFits(a, ev) || !conditionsMatch(a.conditions, lead, claim)) continue;
    if (!Array.isArray(a.steps) || !a.steps.length) continue;
    // Compute and validate before reserving a run. Malformed windows never
    // create a runnable row at the original out-of-window time.
    const runAt = clampToWindow(automationStepRunAt(a.steps[0], new Date()), a.send_window, lead.mail_state ?? lead.state, lead.client_time_zone);
    let id: string | undefined;
    if (!a.retrigger) {
      const { data: existing, error } = await admin.from("automation_runs")
        .select("id").eq("automation_id", a.id).eq("lead_id", ev.lead_id).limit(1).maybeSingle();
      if (error) throw new Error("Could not verify previous automation runs.");
      if (existing) continue;
      id = await onceRunId(lead.firm_id, a.id, lead.id);
    }
    const { data: run, error: re } = await admin.from("automation_runs")
      .insert({ ...(id ? { id } : {}), automation_id: a.id, firm_id: lead.firm_id, lead_id: ev.lead_id, state: "preparing", current_step: 0 })
      .select("id").single();
    if (re?.code === "23505" && id) continue; // the other start owns enqueueing
    if (re || !run?.id) throw new Error("Automation run could not be confirmed; no step was queued.");
    const payload = { claim_id: claim.id, campaign_id: claim.campaign_id ?? null, start_status: claim.status };
    const { data: queued, error: qe } = await admin.from("automation_queue").insert({
      run_id: run.id, automation_id: a.id, lead_id: lead.id, firm_id: lead.firm_id,
      step_index: 0, run_at: runAt.toISOString(), state: "held", payload,
    }).select("id").single();
    if (qe || !queued?.id) {
      // Even if a failed response followed a commit, the row is held and
      // the run is still preparing. Neither is runnable; no re-enqueue.
      await admin.from("automation_runs").update({ state: "stopped", stop_reason: "Initial queue write was not confirmed.", ended_at: new Date().toISOString() }).eq("id", run.id);
      throw new Error("Automation queue write could not be confirmed; the run needs review.");
    }
    const { error: ee } = await admin.from("automation_events").insert({
      run_id: run.id, automation_id: a.id, lead_id: lead.id, kind: "enqueued",
      detail: `Automation "${a.name}" started`, meta: { trigger: ev.type, claim_id: claim.id, run_at: runAt.toISOString() },
    });
    if (ee) throw new Error("The automation was queued but its event log could not be saved.");
    const { data: activated, error: activationError } = await admin.from("automation_runs")
      .update({ state: "active" }).eq("id", run.id).eq("state", "preparing").select("id").maybeSingle();
    if (activationError || !activated) throw new Error("Automation activation could not be confirmed; review the existing run before retrying.");
    const { data: ready, error: readyError } = await admin.from("automation_queue")
      .update({ state: "pending" }).eq("id", queued.id).eq("state", "held").select("id").maybeSingle();
    if (readyError || !ready) throw new Error("Automation scheduling could not be confirmed; review the existing run before retrying.");
    started++;
  }
  return { started };
}
