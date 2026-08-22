// Shared vocabulary for the retention app. Defined once so a health colour
// never means one thing on the Today screen and something else on the file.

import { isInternalRole } from "@/lib/permissions";

export type Health = "green" | "yellow" | "red" | "lost" | "paused";

export const HEALTH_LABEL: Record<Health, string> = {
  green: "In touch",
  yellow: "Overdue",
  red: "Hard to reach",
  lost: "Lost contact",
  paused: "Paused",
};

// Said out loud on a call, not read off a dashboard. "Verified 9 days ago"
// is something a person can act on; a raw timestamp is not.
export function daysAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export function dueWording(iso: string | null | undefined): string {
  if (!iso) return "not scheduled";
  const ms = new Date(iso).getTime() - Date.now();
  const d = Math.round(ms / 86400000);
  if (d < -1) return `${Math.abs(d)} days late`;
  if (d === -1 || (d === 0 && ms < 0)) return "due today";
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  return `due in ${d} days`;
}

export function displayName(l: {
  claimant_name?: string | null; full_name?: string | null;
  first_name?: string | null; last_name?: string | null;
}): string {
  const joined = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
  return l.claimant_name || l.full_name || joined || "Unnamed file";
}

// The four ways a contact attempt ends. Only two_way resets the clock, which
// is why the prompt after every call is worth the one tap it costs.
export const OUTCOMES = [
  { value: "two_way",    label: "Reached",    hint: "Spoke with the client" },
  { value: "no_answer",  label: "No answer",  hint: "Rang out, no voicemail left" },
  { value: "voicemail",  label: "Voicemail",  hint: "Left a message" },
  { value: "bad_number", label: "Bad number", hint: "Disconnected or wrong person" },
] as const;

export const PURPOSES = [
  { value: "heartbeat",  label: "Check in" },
  { value: "escalation", label: "Escalation" },
  { value: "onboarding", label: "Onboarding" },
  { value: "inbound",    label: "They called us" },
  { value: "ad_hoc",     label: "Other" },
] as const;

export const POINT_KINDS = [
  { value: "mobile",   label: "Phone" },
  { value: "email",    label: "Email" },
  { value: "person",   label: "Person who can reach them" },
  { value: "social",   label: "Social handle" },
  { value: "address",  label: "Address" },
] as const;

// ---------------------------------------------------------------------------
// Tenant fence. Defined once so Today, Cases, the file, and /api/m6/* cannot
// disagree about what an m6 row is. Verified against production firms.slug:
// TMP is 'tmp'. Staff and firm users are both TMP-only in this portal.
// ---------------------------------------------------------------------------

export const M6_CAMPAIGN = "motel6";
export const M6_CASE_TYPE = "motel_trafficking";
export const TMP_SLUG = "tmp";

export type M6Actor = {
  role: string;
  firmSlug: string | null;
};

export type M6LeadRow = {
  id: string;
  firm_id: string;
  campaign?: string | null;
  case_type?: string | null;
  archived_at?: string | null;
};

export function canEnterM6App(actor: M6Actor): boolean {
  if (isInternalRole(actor.role)) return true;
  return actor.role === "firm" && actor.firmSlug === TMP_SLUG;
}

export function m6LayoutDestination(actor: M6Actor | null): "allow" | "firm-login" | "portal" | "dashboard" {
  if (!actor) return "firm-login";
  if (canEnterM6App(actor)) return "allow";
  return actor.role === "firm" ? "portal" : "dashboard";
}

export function isM6Lead(row: Pick<M6LeadRow, "campaign" | "case_type" | "archived_at">): boolean {
  if (row.archived_at) return false;
  return row.campaign === M6_CAMPAIGN || row.case_type === M6_CASE_TYPE;
}

export function isM6PortalLead(row: M6LeadRow, tmpFirmId: string): boolean {
  return row.firm_id === tmpFirmId && isM6Lead(row);
}

// /m6/cases/<uuid> never renders a non-m6 file. Wrong uuid, wrong type, wrong
// firm, archived, or an actor who should not be in this app: notFound. No
// empty shell, no "you don't have access" that confirms the file exists.
export function m6CaseAccess(
  actor: M6Actor,
  lead: M6LeadRow | null,
  tmpFirmId: string,
): "ok" | "notFound" {
  if (!canEnterM6App(actor)) return "notFound";
  if (!lead) return "notFound";
  if (!isM6PortalLead(lead, tmpFirmId)) return "notFound";
  return "ok";
}

export function m6WriteAccess(
  actor: M6Actor,
  lead: M6LeadRow | null,
  tmpFirmId: string,
): "ok" | "forbidden" | "notFound" {
  if (!canEnterM6App(actor)) return "forbidden";
  if (!lead || !isM6PortalLead(lead, tmpFirmId)) return "notFound";
  return "ok";
}

export function filterM6StatusRows<T extends {
  firm_id: string;
  campaign?: string | null;
  case_type?: string | null;
  archived_at?: string | null;
}>(rows: T[], tmpFirmId: string): T[] {
  return rows.filter((r) => isM6PortalLead({
    id: "row",
    firm_id: r.firm_id,
    campaign: r.campaign ?? null,
    case_type: r.case_type ?? null,
    archived_at: r.archived_at ?? null,
  }, tmpFirmId));
}

// ---------------------------------------------------------------------------
// LOR (Phase G, launch week). Sidecar on the file — not a pipeline status,
// not current_status, not the later PostGrid lor_sends table.
// ---------------------------------------------------------------------------

export const LOR_STATUSES = [
  { value: "not_sent", label: "Not sent" },
  { value: "ready",    label: "Needs LOR" },
  { value: "sent",     label: "Sent" },
  { value: "received", label: "Received" },
] as const;

export type LorStatus = typeof LOR_STATUSES[number]["value"];

export const LOR_SENT_TO = [
  { value: "g6",        label: "G6 Hospitality" },
  { value: "motel6",    label: "Motel 6" },
  { value: "sedgwick",  label: "Sedgwick" },
  { value: "other",     label: "Other" },
] as const;

export const LOR_READY_STATUS = "secondary intake ok sent to firm";

export function isLorStatus(v: unknown): v is LorStatus {
  return LOR_STATUSES.some((s) => s.value === v);
}

export function isLorReadyStatus(raw: string | null | undefined): boolean {
  return (raw ?? "").trim().toLowerCase() === LOR_READY_STATUS;
}

export type LorRow = {
  status?: string | null;
  flagged_today?: boolean | null;
};

export function lorShowsOnToday(row: LorRow | null | undefined): boolean {
  if (!row) return false;
  if (row.status === "sent" || row.status === "received") return false;
  return !!row.flagged_today || row.status === "ready";
}

// Webhook replay must not pull a sent file back to ready.
export function mergeLorIngest(
  existing: LorRow | null,
  incoming: { status?: LorStatus | null; flagged_today?: boolean | null },
): { status: LorStatus; flagged_today: boolean } {
  const alreadySent = existing?.status === "sent" || existing?.status === "received";
  const status: LorStatus = alreadySent
    ? (existing!.status as LorStatus)
    : (incoming.status ?? (existing?.status as LorStatus) ?? "not_sent");
  const flagged_today = alreadySent
    ? false
    : (incoming.flagged_today ?? existing?.flagged_today ?? status === "ready");
  return { status, flagged_today };
}

// ---------------------------------------------------------------------------
// Firm login landing. Adding an m6 firm user = inserting their lowercase
// email into retention_alert_recipients (campaign = 'motel6', active).
// firm_access still provisions the account; that table is NOT the landing flag.
// ---------------------------------------------------------------------------

export function isSafeFirmNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) return null;
  if (next.startsWith("/m6/") || next === "/m6") return next;
  if (next.startsWith("/portal/")) return next;
  return null;
}

export function firmLandingPath(opts: {
  role: string | null | undefined;
  isM6Recipient: boolean;
  requestedNext?: string | null;
}): string {
  const deep = isSafeFirmNext(opts.requestedNext);
  if (deep) return deep;
  if (isInternalRole(opts.role)) return "/dashboard";
  if (opts.role === "firm" && opts.isM6Recipient) return "/m6";
  if (opts.role === "firm") return "/portal";
  return "/dashboard";
}

// 0087: firm INSERT on communications. Mirrors the WITH CHECK. Staff still
// use comm_internal. No firm UPDATE/DELETE.
export function canFirmInsertM6Comm(opts: {
  actor: M6Actor;
  actorFirmId: string | null;
  lead: M6LeadRow | null;
  tmpFirmId: string;
  logged_manually: boolean;
}): boolean {
  if (opts.actor.role !== "firm") return false;
  if (opts.actor.firmSlug !== TMP_SLUG) return false;
  if (!opts.logged_manually) return false;
  if (!opts.actorFirmId || opts.actorFirmId !== opts.tmpFirmId) return false;
  if (!opts.lead) return false;
  return isM6PortalLead(opts.lead, opts.tmpFirmId);
}
