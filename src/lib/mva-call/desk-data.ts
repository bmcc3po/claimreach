import { APP_CASE_TYPES } from "./links";
import { buildDeskQueues, readDeskRows } from "./desk-queue";
import { loadMvaAcquisitionHolds, type MvaAcquisitionSignal } from "../lawruler-mva-status";
import type { StatusDef } from "../statuses";

/** Shared by the Desk and app-wide call alerts. Always pass the session/RLS
 * client; never a service-role client or a cache shared across users. */
export async function loadDeskWork(sb: any, role: string) {
  const [campRes, firmRes, statusRes] = await Promise.all([
    sb.from("campaigns").select("id, name, firm_id, case_type").in("case_type", APP_CASE_TYPES).eq("active", true).order("name"),
    sb.from("firms").select("id, slug, name"),
    sb.from("statuses").select("*"),
  ]);
  const notes: string[] = [];
  const pilot = role !== "owner";
  const firmById = new Map((firmRes.data ?? []).map((f: any) => [f.id, f]));
  const campaigns = (campRes.data ?? []).filter((c: any) => c.name !== "NETFLY ONTAKE" && (!pilot ||
    (c.name === "INNO MVA" && c.case_type === "mva" && (firmById.get(c.firm_id) as any)?.slug === "tmp")));
  const campIds = campaigns.map((c: any) => c.id);
  const [leadRes] = await Promise.all([
    campIds.length ? readDeskRows(() => sb.from("leads")
      .select("id, firm_id, external_id, archived_at, lead_no, claimant_name, phone, campaign_id, campaign, created_at, last_called_at, signed_at, marketing_source, claims(id, lead_id, firm_id, campaign_id, campaign, claim_type, status, created_at, updated_at)")
      .in("campaign_id", campIds).is("archived_at", null)) : { data: [], error: null },
  ]);
  const leads = leadRes.data ?? [], allLeads = new Map<string, any>(leads.map((lead: any) => [lead.id, lead]));
  const leadIds = [...allLeads.keys()];
  // Batch the identity filters so a larger roster does not exceed URL limits.
  const calls: any[] = [], agreements: any[] = [];
  let acquisitionReady = !statusRes.error && !leadRes.error;
  let signingReady = !leadRes.error;
  for (let start = 0; start < leadIds.length; start += 100) {
    const ids = leadIds.slice(start, start + 100);
    const [callRes, agreementRes] = await Promise.all([
      readDeskRows(() => sb.from("intake_calls").select("id, lead_id, claim_id, campaign_id, status, disposition, callback_at, agent_name, reason, created_at").in("lead_id", ids)),
      readDeskRows(() => sb.from("esign_submissions").select("id, lead_id, claim_id, campaign_id, firm_id, pax_index, status, created_at, sent_at, signed_at, voided_at, replacement_requested_at, agent_reviewed_at, template_key").in("lead_id", ids)),
    ]);
    if (callRes.error) acquisitionReady = false;
    else calls.push(...callRes.data);
    if (agreementRes.error) signingReady = false;
    else agreements.push(...agreementRes.data);
  }
  if (campRes.error || firmRes.error) notes.push("Campaigns did not load. Do not assume your work queues are empty.");
  if (leadRes.error) notes.push("Files did not load. Retry before assuming there are no files to work.");
  if (!acquisitionReady) notes.push("Current call or status data did not load. Calling queues are paused until it can be checked.");
  if (!signingReady) notes.push("Agreements did not load. Signature-dependent queues may be incomplete; retry before assuming they are empty.");
  let holds = new Map<string, MvaAcquisitionSignal>();
  try { holds = await loadMvaAcquisitionHolds(sb, leadIds); }
  catch (error) { acquisitionReady = false; notes.push(error instanceof Error ? error.message : "Could not check external contact holds."); }
  const queues = buildDeskQueues({ leads, calls, agreements, campaignIds: campIds, statuses: (statusRes.data || []) as StatusDef[], holds, acquisitionReady: acquisitionReady && signingReady });
  return { campaigns, firmById, campIds, pilot, allLeads, holds, queues, notes,
    ready: !campRes.error && !firmRes.error && acquisitionReady && signingReady };
}
