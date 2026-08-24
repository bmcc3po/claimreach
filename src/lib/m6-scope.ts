// Server-only m6 fence. Do not import this from a "use client" file — it
// pulls gateUser / the session. Predicates live in m6.ts so the client
// components and the tests share one definition.

import { gateUser, type GatedUser } from "@/lib/gate";
import {
  M6_CAMPAIGN, M6_CASE_TYPE, TMP_SLUG,
  canEnterM6App, m6LayoutDestination, m6WriteAccess,
  type M6Actor,
} from "@/lib/m6";

export { M6_CAMPAIGN, M6_CASE_TYPE, TMP_SLUG };

export async function getTmpFirmId(sb: any): Promise<string | null> {
  const { data } = await sb.from("firms").select("id").eq("slug", TMP_SLUG).maybeSingle();
  return data?.id ?? null;
}

export async function firmSlugFor(sb: any, firmId: string | null): Promise<string | null> {
  if (!firmId) return null;
  const { data } = await sb.from("firms").select("slug").eq("id", firmId).maybeSingle();
  return data?.slug ?? null;
}

export function applyM6LeadFilters(query: any, tmpFirmId: string) {
  return query
    .eq("firm_id", tmpFirmId)
    .or(`campaign.eq.${M6_CAMPAIGN},case_type.eq.${M6_CASE_TYPE}`)
    .is("archived_at", null);
}

export async function loadM6Actor(sb: any): Promise<M6Actor | null> {
  const user = await gateUser(sb);
  if (!user) return null;
  return { role: user.role, firmSlug: await firmSlugFor(sb, user.firmId) };
}

export async function requireM6Session(sb: any): Promise<
  | { ok: true; user: GatedUser; actor: M6Actor; tmpFirmId: string }
  | { ok: false; status: 401 | 403; error: string; dest: "firm-login" | "portal" | "dashboard" }
> {
  const user = await gateUser(sb);
  if (!user) {
    return { ok: false, status: 401, error: "Sign in again.", dest: "firm-login" };
  }
  const actor: M6Actor = { role: user.role, firmSlug: await firmSlugFor(sb, user.firmId) };
  const dest = m6LayoutDestination(actor);
  if (dest !== "allow") {
    return {
      ok: false,
      status: dest === "firm-login" ? 401 : 403,
      error: "This app is for TMP Motel 6 files only.",
      dest,
    };
  }
  const tmpFirmId = await getTmpFirmId(sb);
  if (!tmpFirmId) {
    return {
      ok: false,
      status: 403,
      error: "This app is not available.",
      dest: actor.role === "firm" ? "portal" : "dashboard",
    };
  }
  if (!canEnterM6App(actor)) {
    return { ok: false, status: 403, error: "This app is for TMP Motel 6 files only.", dest: "portal" };
  }
  return { ok: true, user, actor, tmpFirmId };
}

export async function loadM6Lead(
  sb: any,
  leadId: string,
  tmpFirmId: string,
  select = "id, firm_id, campaign, case_type, archived_at, phone",
) {
  const { data } = await applyM6LeadFilters(
    sb.from("leads").select(select).eq("id", leadId),
    tmpFirmId,
  ).maybeSingle();
  return data;
}

export async function assertM6Write(
  sb: any,
  leadId: string,
  extraSelect = "id, firm_id, campaign, case_type, archived_at, phone",
): Promise<
  | { ok: true; user: GatedUser; lead: any; tmpFirmId: string }
  | { ok: false; status: 401 | 403 | 404; error: string }
> {
  const session = await requireM6Session(sb);
  if (!session.ok) {
    return { ok: false, status: session.status, error: session.error };
  }
  const lead = await loadM6Lead(sb, leadId, session.tmpFirmId, extraSelect);
  const verdict = m6WriteAccess(session.actor, lead, session.tmpFirmId);
  if (verdict === "forbidden") {
    return { ok: false, status: 403, error: "This app is for TMP Motel 6 files only." };
  }
  if (verdict !== "ok") {
    return { ok: false, status: 404, error: "That file is not available to you." };
  }
  return { ok: true, user: session.user, lead, tmpFirmId: session.tmpFirmId };
}

export const M6_STATUS_COLUMNS =
  "lead_id, lead_no, claimant_name, health, days_overdue, days_since_contact, last_two_way_at, last_touch_at, last_touch_channel, last_touch_direction, next_touch_due, ladder_step, retention_owner, live_contact_points, stable_people, inbound_waiting, last_send_failed, opted_out, comms_monitored, retention_stage, retention_paused_until, firm_id, campaign, case_type, archived_at";
