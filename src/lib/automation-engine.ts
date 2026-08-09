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
  return STATE_TZ[(state || "").toUpperCase()] || "America/Los_Angeles";
}

// Get hour+minute+weekday for a given instant in a timezone (no extra deps).
function partsInTz(d: Date, tz: string): { hour: number; minute: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const wk = parts.find((p) => p.type === "weekday")?.value || "Mon";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wk);
  return { hour, minute, dow };
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Given a desired run instant and a send window, push it forward to the next
// allowed slot (business hours, allowed days, in the lead's timezone). Hard wall.
export function clampToWindow(desired: Date, window: any, leadState?: string | null): Date {
  if (!window || !window.start || !window.end) return desired;
  const tz = window.mode === "fixed" ? (window.tz || "America/Los_Angeles") : tzForState(leadState);
  const [sH, sM] = String(window.start).split(":").map((x: string) => parseInt(x, 10));
  const [eH, eM] = String(window.end).split(":").map((x: string) => parseInt(x, 10));
  const days: string[] = Array.isArray(window.days) && window.days.length ? window.days : DAY_KEYS.slice(1, 6);

  // Step forward in 15-min increments until we land in an allowed day + window.
  let t = new Date(desired);
  for (let i = 0; i < 8 * 24 * 4; i++) { // up to 8 days of slots
    const { hour, minute, dow } = partsInTz(t, tz);
    const mins = hour * 60 + minute;
    const startM = sH * 60 + sM, endM = eH * 60 + eM;
    const dayOk = days.includes(DAY_KEYS[dow]);
    if (dayOk && mins >= startM && mins <= endM) return t;
    t = new Date(t.getTime() + 15 * 60 * 1000);
  }
  return desired; // give up after 8 days, send as-is
}

// ---- condition evaluation ----
function getField(lead: any, claim: any, field: string): any {
  switch (field) {
    case "case_type": return lead.case_type ?? claim?.claim_type;
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
  if (rules.length === 0) return true;
  const match = conditions.match === "any" ? "any" : "all";
  const evalRule = (r: any) => {
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

// Main entry: an event happened for a lead. Open runs + enqueue step 0.
export async function matchAndStart(ev: {
  type: TriggerType; lead_id: string; toStatus?: string; fromStatus?: string;
}): Promise<{ started: number }> {
  const admin = supabaseAdmin();
  const { data: automations } = await admin.from("automations")
    .select("*").eq("active", true).eq("trigger_type", ev.type);
  if (!automations || automations.length === 0) return { started: 0 };

  const { data: lead } = await admin.from("leads").select("*").eq("id", ev.lead_id).maybeSingle();
  if (!lead) return { started: 0 };
  const { data: claim } = await admin.from("claims").select("*").eq("lead_id", ev.lead_id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  let started = 0;
  for (const a of automations as AutomationRow[]) {
    if (!triggerFits(a, ev)) continue;
    if (!conditionsMatch(a.conditions, lead, claim)) continue;

    // Once-per-lead unless retrigger.
    if (!a.retrigger) {
      const { data: existing } = await admin.from("automation_runs")
        .select("id").eq("automation_id", a.id).eq("lead_id", ev.lead_id).limit(1).maybeSingle();
      if (existing) continue;
    }

    const { data: run } = await admin.from("automation_runs")
      .insert({ automation_id: a.id, firm_id: a.firm_id ?? lead.firm_id, lead_id: ev.lead_id, state: "active", current_step: 0 })
      .select("id").single();
    if (!run) continue;

    const runAt = clampToWindow(new Date(), a.send_window, lead.mail_state ?? lead.state);
    await admin.from("automation_queue").insert({
      run_id: run.id, automation_id: a.id, lead_id: ev.lead_id, firm_id: a.firm_id ?? lead.firm_id,
      step_index: 0, run_at: runAt.toISOString(), state: "pending",
    });
    await admin.from("automation_events").insert({
      run_id: run.id, automation_id: a.id, lead_id: ev.lead_id, kind: "enqueued",
      detail: `Automation "${a.name}" started`, meta: { trigger: ev.type, run_at: runAt.toISOString() },
    });
    started++;
  }
  return { started };
}
