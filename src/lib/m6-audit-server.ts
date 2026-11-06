// Server-only loaders for Josh's audit board. Reads through the signed-in
// user's client so RLS still fences every row; admin is used only to resolve
// author names and the Motel 6 drip wording (drip_rules is internal-only RLS),
// both scoped to the TMP firm and the motel6 campaign.

import { supabaseAdmin } from "@/lib/supabase-server";
import { filterM6StatusRows } from "@/lib/m6";
import { applyM6LeadFilters, loadM6Lead, M6_STATUS_COLUMNS } from "@/lib/m6-scope";
import { M6_DRIP_CAMPAIGN, sortDripRules } from "@/lib/drip-rules";
import {
  aggregateAuditStats, auditFlags, auditSeverity, buildAuditTimeline, emptyAuditStats,
  neosMatterUrl, type AuditBoardRow, type AuditTimelineItem,
} from "@/lib/m6-audit";

const CHUNK = 120;

function chunks<T>(xs: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export function neosTemplate(): string | null {
  return (process.env.M6_NEOS_MATTER_URL || "").trim() || null;
}

// neos_matter_no arrives with migration 0133. Read it on its own so the board
// still loads (and says so) if the column is not there yet. One phantom column
// in a shared select would sink every other field.
async function loadNeosNumbers(sb: any, tmpFirmId: string, ids: string[]): Promise<{ ready: boolean; byLead: Map<string, string | null> }> {
  const byLead = new Map<string, string | null>();
  if (!ids.length) return { ready: true, byLead };
  for (const part of chunks(ids)) {
    const { data, error } = await sb.from("leads").select("id, neos_matter_no").eq("firm_id", tmpFirmId).in("id", part);
    if (error) return { ready: false, byLead: new Map() };
    for (const r of data ?? []) byLead.set(r.id, r.neos_matter_no ?? null);
  }
  return { ready: true, byLead };
}

async function authorNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const want = [...new Set(ids.filter(Boolean))];
  if (!want.length) return names;
  const { data } = await supabaseAdmin().from("app_users").select("id, full_name").in("id", want);
  for (const u of data ?? []) if (u.full_name) names.set(u.id, u.full_name);
  return names;
}

export type AuditBoardData = {
  rows: AuditBoardRow[];
  neosReady: boolean;
  neosLinked: boolean;
  error: string | null;
};

export async function loadAuditBoard(sb: any, tmpFirmId: string, nowIso: string): Promise<AuditBoardData> {
  const { data: status, error } = await applyM6LeadFilters(
    sb.from("lead_contact_status").select(M6_STATUS_COLUMNS),
    tmpFirmId,
  ).order("days_overdue", { ascending: false }).limit(1000);
  if (error) return { rows: [], neosReady: true, neosLinked: !!neosTemplate(), error: error.message };

  const files = filterM6StatusRows((status ?? []) as any[], tmpFirmId);
  const ids = files.map((f: any) => f.lead_id);

  const leads: any[] = [];
  const comms: any[] = [];
  const deskNotes: any[] = [];
  const staffNotes: any[] = [];
  for (const part of chunks(ids)) {
    const [l, c, d, s] = await Promise.all([
      sb.from("leads").select("id, created_at, retention_started_at, full_name, first_name, last_name")
        .eq("firm_id", tmpFirmId).in("id", part),
      sb.from("communications").select("lead_id, channel, direction, send_status, outcome, occurred_at")
        .eq("firm_id", tmpFirmId).in("lead_id", part).order("occurred_at", { ascending: false }).limit(5000),
      sb.from("lead_notes").select("lead_id, source, body, created_at, author")
        .eq("firm_id", tmpFirmId).in("lead_id", part).order("created_at", { ascending: false }).limit(5000),
      sb.from("notes").select("lead_id, body, created_at, author_name")
        .in("lead_id", part).order("created_at", { ascending: false }).limit(5000),
    ]);
    leads.push(...(l.data ?? []));
    comms.push(...(c.data ?? []));
    deskNotes.push(...(d.data ?? []));
    staffNotes.push(...(s.data ?? []));
  }

  const names = await authorNames(deskNotes.map((n) => n.author));
  const notes = [
    ...deskNotes.map((n) => ({ ...n, author_name: names.get(n.author) ?? null })),
    ...staffNotes.map((n) => ({ ...n, source: "staff" })),
  ];
  const stats = aggregateAuditStats(comms, notes, nowIso);
  const leadOf = new Map(leads.map((l) => [l.id, l]));
  const neos = await loadNeosNumbers(sb, tmpFirmId, ids);
  const template = neosTemplate();

  const rows: AuditBoardRow[] = files.map((f: any) => {
    const l = leadOf.get(f.lead_id) ?? {};
    const st = stats.get(f.lead_id) ?? emptyAuditStats();
    const neosNo = neos.byLead.get(f.lead_id) ?? null;
    return {
      lead_id: f.lead_id,
      lead_no: f.lead_no,
      name: f.claimant_name || l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed file",
      neos_no: neosNo,
      neos_url: neosMatterUrl(template, neosNo),
      last_two_way_at: f.last_two_way_at ?? null,
      last_touch_at: f.last_touch_at ?? null,
      next_touch_due: f.next_touch_due ?? null,
      stats: st,
      flags: auditFlags({
        last_two_way_at: f.last_two_way_at ?? null,
        days_since_contact: f.days_since_contact ?? null,
        inbound_waiting: f.inbound_waiting,
        last_send_failed: f.last_send_failed,
        opted_out: f.opted_out,
        started_at: l.retention_started_at || l.created_at || null,
      }, st, nowIso),
    };
  }).sort((a, b) =>
    auditSeverity(a.flags) - auditSeverity(b.flags) ||
    b.flags.length - a.flags.length ||
    a.name.localeCompare(b.name),
  );

  return { rows, neosReady: neos.ready, neosLinked: !!template, error: null };
}

export type AuditFileData = {
  lead: { id: string; lead_no: string; name: string; neos_no: string | null; neos_url: string | null };
  row: AuditBoardRow | null;
  timeline: AuditTimelineItem[];
  upcoming: { id: string; due_at: string; kind: string | null; note: string | null }[];
  neosReady: boolean;
  neosLinked: boolean;
};

export async function loadAuditFile(sb: any, leadId: string, tmpFirmId: string, nowIso: string): Promise<AuditFileData | null> {
  const lead = await loadM6Lead(sb, leadId, tmpFirmId,
    "id, firm_id, campaign, case_type, archived_at, lead_no, claimant_name, full_name, first_name, last_name, created_at, retention_started_at");
  if (!lead) return null;

  const [{ data: status }, { data: comms }, { data: deskNotes }, { data: staffNotes }, { data: upcoming }] = await Promise.all([
    applyM6LeadFilters(sb.from("lead_contact_status").select(M6_STATUS_COLUMNS).eq("lead_id", leadId), tmpFirmId).maybeSingle(),
    sb.from("communications")
      .select("id, channel, direction, body, jc_summary, agent_name, occurred_at, created_at, send_status, outcome, blocked_reason, template_key, purpose")
      .eq("lead_id", leadId).eq("firm_id", tmpFirmId).order("occurred_at", { ascending: false }).limit(500),
    sb.from("lead_notes").select("id, lead_id, body, created_at, author, source")
      .eq("lead_id", leadId).eq("firm_id", tmpFirmId).order("created_at", { ascending: false }).limit(300),
    sb.from("notes").select("id, lead_id, body, created_at, author_name")
      .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(300),
    sb.from("call_schedule").select("id, due_at, kind, note")
      .eq("lead_id", leadId).eq("firm_id", tmpFirmId).eq("status", "open").order("due_at").limit(20),
  ]);

  const names = await authorNames((deskNotes ?? []).map((n: any) => n.author));
  const notes = [
    ...(deskNotes ?? []).map((n: any) => ({ ...n, author_name: names.get(n.author) ?? null })),
    ...(staffNotes ?? []).map((n: any) => ({ ...n, source: "staff" })),
  ];
  const neos = await loadNeosNumbers(sb, tmpFirmId, [leadId]);
  const template = neosTemplate();
  const neosNo = neos.byLead.get(leadId) ?? null;
  const name = lead.claimant_name || lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed file";

  let row: AuditBoardRow | null = null;
  if (status) {
    const stats = aggregateAuditStats(
      (comms ?? []).map((c: any) => ({ ...c, lead_id: leadId })),
      notes,
      nowIso,
    ).get(leadId) ?? emptyAuditStats();
    row = {
      lead_id: leadId,
      lead_no: lead.lead_no,
      name,
      neos_no: neosNo,
      neos_url: neosMatterUrl(template, neosNo),
      last_two_way_at: status.last_two_way_at ?? null,
      last_touch_at: status.last_touch_at ?? null,
      next_touch_due: status.next_touch_due ?? null,
      stats,
      flags: auditFlags({
        last_two_way_at: status.last_two_way_at ?? null,
        days_since_contact: status.days_since_contact ?? null,
        inbound_waiting: status.inbound_waiting,
        last_send_failed: status.last_send_failed,
        opted_out: status.opted_out,
        started_at: lead.retention_started_at || lead.created_at || null,
      }, stats, nowIso),
    };
  }

  return {
    lead: { id: leadId, lead_no: lead.lead_no, name, neos_no: neosNo, neos_url: neosMatterUrl(template, neosNo) },
    row,
    timeline: buildAuditTimeline(comms ?? [], notes),
    upcoming: upcoming ?? [],
    neosReady: neos.ready,
    neosLinked: !!template,
  };
}

export type DripWording = {
  id: string;
  stage: string | null;
  name: string;
  channel: string | null;
  timing: string;
  active: boolean;
  approved: boolean;
  subject: string | null;
  body: string;
};

export async function loadM6DripWording(tmpFirmId: string): Promise<DripWording[]> {
  const { data } = await supabaseAdmin().from("drip_rules")
    .select("id, stage, name, channel, delay_days, every_days, fire_once, active, approved_by_firm, subject, template")
    .eq("campaign", M6_DRIP_CAMPAIGN)
    .eq("firm_id", tmpFirmId);
  return sortDripRules((data ?? []) as any[]).map((r: any) => {
    const d = r.delay_days ?? r.every_days ?? 0;
    const timing = r.fire_once
      ? (d === 0 ? "Once, the day the file arrives" : `Once, day ${d}`)
      : `Every ${r.every_days ?? d} days`;
    return {
      id: r.id,
      stage: r.stage ?? null,
      name: r.name ?? "Untitled step",
      channel: r.channel ?? null,
      timing,
      active: !!r.active,
      approved: !!r.approved_by_firm,
      subject: r.subject ?? null,
      body: String(r.template ?? ""),
    };
  });
}
