import { pacificDay, shiftWeek } from "./packet-worklist";

export type CallActivityRow = {
  id: string;
  leadId: string;
  leadNo: string;
  claimant: string;
  campaign: string;
  direction: "inbound" | "outbound";
  agent: string;
  occurredAt: string;
  durationSec: number | null;
  inboundOutcome: "answered" | "missed" | "voicemail" | "abandoned" | "unknown";
};

export type AgentCallActivity = {
  agent: string;
  inbound: number;
  inboundAnswered: number;
  outbound: number;
  files: number;
  withDuration: number;
  lastCall: string;
};

export function justcallInboundOutcomes(events: any[]): Map<string, CallActivityRow["inboundOutcome"]> {
  const outcomes = new Map<string, CallActivityRow["inboundOutcome"]>();
  for (const event of events) {
    if (event.event_type !== "justcall.call.completed" || event.status !== "received") continue;
    const data = event.payload?.data;
    if (String(data?.call_info?.direction || "").toLowerCase() !== "incoming") continue;
    const sid = String(data?.call_sid || data?.id || "").trim();
    if (!sid) continue;
    const type = String(data.call_info?.type || "").toLowerCase();
    const outcome = type === "answered" ? "answered" : type === "missed" ? "missed"
      : type === "voicemail" ? "voicemail" : type === "abandoned before ringing" ? "abandoned" : "unknown";
    outcomes.set(sid, outcome);
  }
  return outcomes;
}

export function linkedCallActivity(comms: any[], leads: any[], monday: string, inboundOutcomes = new Map<string, CallActivityRow["inboundOutcome"]>()): CallActivityRow[] {
  const byLead = new Map(leads.map((lead) => [lead.id, lead]));
  const next = shiftWeek(monday, 1);
  return comms.flatMap((call) => {
    const lead = byLead.get(call.lead_id);
    if (!lead || call.channel !== "call" || !["inbound", "outbound"].includes(call.direction) || !call.occurred_at) return [];
    const day = pacificDay(call.occurred_at);
    if (day < monday || day >= next) return [];
    return [{
      id: call.id,
      leadId: lead.id,
      leadNo: lead.lead_no || "File",
      claimant: lead.claimant_name || "Name missing",
      campaign: lead.campaign || lead.case_type || "Unmapped case",
      direction: call.direction as "inbound" | "outbound",
      agent: call.agent_name?.trim() || "Agent not recorded",
      occurredAt: call.occurred_at,
      durationSec: Number.isFinite(call.duration_sec) ? call.duration_sec : null,
      inboundOutcome: call.direction === "inbound" ? inboundOutcomes.get(String(call.call_sid || "")) || "unknown" : "unknown",
    }];
  }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function summarizeCallActivity(rows: CallActivityRow[]): AgentCallActivity[] {
  const groups = new Map<string, { inbound: number; inboundAnswered: number; outbound: number; files: Set<string>; withDuration: number; lastCall: string }>();
  for (const row of rows) {
    const group = groups.get(row.agent) || { inbound: 0, inboundAnswered: 0, outbound: 0, files: new Set<string>(), withDuration: 0, lastCall: "" };
    group[row.direction]++;
    if (row.direction === "inbound" && row.inboundOutcome === "answered") group.inboundAnswered++;
    group.files.add(row.leadId);
    if (row.durationSec != null && row.durationSec > 0) group.withDuration++;
    if (row.occurredAt > group.lastCall) group.lastCall = row.occurredAt;
    groups.set(row.agent, group);
  }
  return [...groups.entries()].map(([agent, group]) => ({
    agent, inbound: group.inbound, inboundAnswered: group.inboundAnswered, outbound: group.outbound, files: group.files.size,
    withDuration: group.withDuration, lastCall: group.lastCall,
  })).sort((a, b) => b.inbound + b.outbound - a.inbound - a.outbound || a.agent.localeCompare(b.agent));
}

export function missedInboundFollowups(rows: CallActivityRow[]) {
  return rows.filter((row) => row.direction === "inbound" && row.inboundOutcome === "missed").map((missed) => ({
    missed,
    followup: rows.filter((row) => row.leadId === missed.leadId && row.occurredAt > missed.occurredAt
      && (row.direction === "outbound" || row.inboundOutcome === "answered"))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0] || null,
  }));
}
