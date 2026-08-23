// Shared vocabulary for the retention app. Defined once so a health colour
// never means one thing on the Today screen and something else on the file.

import { isInternalRole } from "@/lib/permissions";
import { TMP_SLUG, isM6LeadShape } from "./lawruler-email";

export {
  M6_CAMPAIGN, M6_CASE_TYPE, TMP_SLUG,
  SECONDARY_INTERVIEW_DOC_TYPE, SECONDARY_INTERVIEW_TITLE,
  parseLrFilenameLeadId, classifyLrAttachment, lrAttachmentPlan,
  pickSecondaryInterviewPdf, authenticateIntakeEmail,
  parseM6IntakeSubject, senderDomainAllowed, tokenAccepted,
} from "./lawruler-email";
export type { LrAttachmentKind, LrAttachmentPlan } from "./lawruler-email";

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

// Viewer locale + timezone. Messages, touches, and contact history always
// show date AND time. Relative wording (daysAgo) stays on the lists.
export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatLocalDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

// Date-only input → timestamptz at local noon so YYYY-MM-DD is not parsed
// as UTC midnight (which shows as the previous evening in US timezones).
export function dueAtFromDateInput(yyyyMmDd: string): string | null {
  const m = String(yyyyMmDd ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return isNaN(d.getTime()) ? null : d.toISOString();
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
  { value: "landline", label: "Landline" },
  { value: "email",    label: "Email" },
  { value: "person",   label: "Person who can reach them" },
  { value: "social",   label: "Social handle" },
  { value: "address",  label: "Address" },
] as const;

export const SOCIAL_PLATFORMS = [
  { value: "facebook",  label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "other",     label: "Other" },
] as const;

// ---------------------------------------------------------------------------
// Tenant fence. Defined once so Today, Cases, the file, and /api/m6/* cannot
// disagree about what an m6 row is. Verified against production firms.slug:
// TMP is 'tmp'. Staff and firm users are both TMP-only in this portal.
// ---------------------------------------------------------------------------

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
  const dest = bouncePath("/m6", {
    signedIn: !!actor,
    role: actor?.role ?? null,
    isM6Recipient: false,
    firmSlug: actor?.firmSlug ?? null,
  });
  if (!dest) return "allow";
  if (dest === "/firm-login") return "firm-login";
  if (dest === "/dashboard") return "dashboard";
  return "portal";
}

export function isM6Lead(row: Pick<M6LeadRow, "campaign" | "case_type" | "archived_at">): boolean {
  return isM6LeadShape(row);
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
}): string | null {
  const deep = isSafeFirmNext(opts.requestedNext);
  if (deep) return deep;
  if (isInternalRole(opts.role)) return "/dashboard";
  if (opts.role === "firm" && opts.isM6Recipient) return "/m6";
  if (opts.role === "firm") return "/portal";
  // Unknown role: do not guess /dashboard. That fights (internal)/layout,
  // which kicks missing profiles and firm users off /dashboard.
  return null;
}

export type RedirectActor = {
  signedIn: boolean;
  role: string | null | undefined;
  isM6Recipient: boolean;
  firmSlug?: string | null;
};

function pathZone(path: string):
  | "auth" | "login" | "firm-login" | "m6" | "portal"
  | "internal" | "root" | "other" {
  if (path.startsWith("/auth")) return "auth";
  if (path === "/login") return "login";
  if (path === "/firm-login") return "firm-login";
  if (path === "/m6" || path.startsWith("/m6/")) return "m6";
  if (path === "/portal" || path.startsWith("/portal/")) return "portal";
  if (path === "/dashboard" || path.startsWith("/dashboard/")) return "internal";
  if (path === "/leads" || path.startsWith("/leads/")) return "internal";
  if (path === "/") return "root";
  return "other";
}

// Single redirect map for callback, middleware, and layouts. Returns null
// when this actor may stay. A route must never bounce to a route that
// bounces back here.
export function bouncePath(path: string, actor: RedirectActor): string | null {
  const zone = pathZone(path);

  if (!actor.signedIn) {
    if (zone === "login" || zone === "firm-login" || zone === "auth") return null;
    if (zone === "m6" || zone === "portal") return "/firm-login";
    return "/login";
  }

  const home = firmLandingPath({
    role: actor.role,
    isM6Recipient: actor.isM6Recipient,
  });

  if (zone === "login" || zone === "firm-login") {
    if (!home || home === path) return null;
    return home;
  }

  if (zone === "auth") return null;

  if (zone === "internal" || zone === "root") {
    if (isInternalRole(actor.role)) {
      if (zone === "root") return "/dashboard";
      return null;
    }
    if (home) return home === path ? null : home;
    return "/firm-login";
  }

  if (zone === "m6") {
    if (actor.role && canEnterM6App({ role: actor.role, firmSlug: actor.firmSlug ?? null })) {
      return null;
    }
    if (actor.role === "firm") return "/portal";
    if (isInternalRole(actor.role)) return "/dashboard";
    return "/firm-login";
  }

  if (zone === "portal") {
    if (actor.role === "firm") return null;
    if (!actor.role) return "/firm-login";
    return "/leads";
  }

  return null;
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

// 0089: m6_log_touch RPC fence. Staff or TMP firm, live motel file only.
export function canCallM6LogTouch(opts: {
  actor: M6Actor;
  actorFirmId: string | null;
  lead: M6LeadRow | null;
  tmpFirmId: string;
}): boolean {
  if (!opts.lead || !isM6PortalLead(opts.lead, opts.tmpFirmId)) return false;
  if (isInternalRole(opts.actor.role)) return true;
  return canFirmInsertM6Comm({ ...opts, logged_manually: true });
}

// Mirrors firm_stage_only_guard (0089 + 0091). last_two_way_at / next_touch_due /
// health are view-derived — they are not lead columns, so a firm JWT cannot
// UPDATE them. Nested two_way may move retention_stage only. Direct firm
// UPDATE still allows pipeline `stage` + updated_at, never current_status.
// full_name / phone_norm are STORED generated columns. BEFORE UPDATE sees
// uncomputed NEW values, so the SQL guard strips them from the jsonb diff.
export const LEADS_GENERATED_COLS = ["full_name", "phone_norm"] as const;
export const FIRM_DIRECT_LEAD_ALLOW = ["stage", "updated_at"] as const;
export const FIRM_NESTED_TOUCH_LEAD_ALLOW = ["retention_stage", "updated_at"] as const;
export const FIRM_TOUCH_CLOCK_LEAD_COLS = [
  "retention_stage", "last_two_way_at", "next_touch_due", "health", "current_status", "current_stage",
] as const;

export function firmMayUpdateLeadColumns(opts: {
  changed: string[];
  nestedTrigger: boolean;
}): boolean {
  const allow = new Set<string>([
    ...LEADS_GENERATED_COLS,
    ...(opts.nestedTrigger ? FIRM_NESTED_TOUCH_LEAD_ALLOW : FIRM_DIRECT_LEAD_ALLOW),
  ]);
  return opts.changed.every((c) => allow.has(c));
}
