import { acquisitionClaimForRow, isAcquisitionEligible, type MvaAcquisitionSignal } from "../lawruler-mva-status";
import { isSignedKey, resolveStatus, SIGNED_QA_RETURN_STATUS, type StatusDef } from "../statuses";
import { agreementName } from "./agreement-names";
import { paxParentId } from "../linked-files";
import type { DeskTab, DeskRow, DeskQueues } from "./desk-types";
import { placeOutreach, type DialSummary } from "./outreach-stage";
import { activeCallPresence } from "../call-presence";
const stamp = (row: any) => row?.created_at || row?.sent_at || row?.signed_at || "";

/** Read every matching row; active work never ages out or falls behind a row limit. */
export async function readDeskRows(query: () => any): Promise<{ data: any[]; error: any }> {
  const data: any[] = [], size = 500;
  for (let offset = 0; ; offset += size) {
    const result = await query().order("id", { ascending: true }).range(offset, offset + size - 1);
    if (result.error) return { data: [], error: result.error };
    if (!Array.isArray(result.data)) return { data: [], error: { message: "Queue data could not be read." } };
    data.push(...result.data);
    if (result.data.length < size) return { data, error: null };
  }
}

/** One matter belongs to one active Desk queue. A signed file stays here through
 * review/office completion. Only a real delivery/closure removes it; only an
 * explicit QA return (signed_wip) puts it in WIP. */
export function buildDeskQueues(opts: {
  leads: any[]; calls: any[]; agreements: any[]; campaignIds: string[];
  statuses: StatusDef[]; holds: Map<string, MvaAcquisitionSignal>; acquisitionReady: boolean;
  dialSummaries?: Map<string, DialSummary>;
}): DeskQueues {
  const queues: DeskQueues = { due: [], wait: [], callbacks: [], sent: [], signed: [], wip: [], review: [] };
  const allowed = new Set(opts.campaignIds);
  for (const lead of opts.leads) {
    if (!lead?.id || lead.archived_at) continue;
    const calls = opts.calls.filter(row => row.lead_id === lead.id);
    const agreements = opts.agreements.filter(row => row.lead_id === lead.id);
    for (const claim of lead.claims || []) {
      if (claim.lead_id !== lead.id || claim.firm_id !== lead.firm_id || claim.claim_type !== "mva" || !allowed.has(claim.campaign_id)) continue;
      // Imported LawRuler packets are allegations of signing until QA verifies
      // the actual document. They belong in QA, never the Signed eSign tab.
      if (claim.status === "external_signed_review") continue;
      const def = resolveStatus(claim.status, opts.statuses);
      if (def.qualify === "disqualify" || def.phase === "terminal" || (def.is_final && claim.status !== "external_signed_review") || ["delivered", "retained"].includes(claim.status)) continue;
      const hold = opts.holds.get(claim.id);
      if (hold?.acquisition_hold && hold.lead_id === lead.id && hold.firm_id === claim.firm_id && hold.campaign_id === claim.campaign_id &&
        resolveStatus(hold.mapped_status || "", opts.statuses).qualify === "disqualify") continue;
      const matterCalls = calls.filter(row => acquisitionClaimForRow(lead, row)?.id === claim.id).sort((a, b) => stamp(b).localeCompare(stamp(a)));
      const matterAgreements = agreements.filter(row => row.firm_id === claim.firm_id && acquisitionClaimForRow(lead, row)?.id === claim.id && (paxParentId(lead.external_id) || row.pax_index == null))
        .sort((a, b) => stamp(b).localeCompare(stamp(a)));
      // Match the signing screen: a voided newest envelope never revives an
      // older one. A passenger's signature belongs to their own linked file.
      const newest = matterAgreements[0];
      const active = newest && !newest.voided_at && !newest.replacement_requested_at && ["sent", "opened", "signed", "completed"].includes(newest.status) ? newest : null;
      const latestCall = matterCalls[0];
      const summary = opts.dialSummaries?.get(lead.id);
      const row: DeskRow = { id: lead.id, claimId: claim.id, name: lead.claimant_name, phone: lead.phone,
        sub: [lead.marketing_source, claim.campaign || lead.campaign].filter(Boolean).join(", "),
        at: claim.updated_at || lead.last_called_at || lead.created_at, receivedAt: lead.created_at, href: `/app/${lead.id}?claim=${claim.id}`,
        callCount: summary?.total_dials ?? null, lastCallAt: summary?.last_call_at ?? null,
        onPhoneBy: activeCallPresence(claim.answers?.mva_live_call)?.by_name ?? null };
      let bucket: DeskTab;
      if (claim.status === SIGNED_QA_RETURN_STATUS) {
        bucket = "wip"; row.tag = "QA returned"; row.sub = "Signed file returned by QA for corrections";
      } else if (active && ["signed", "completed"].includes(active.status)) {
        bucket = "signed"; row.at = active.signed_at || active.sent_at || row.at;
        row.tag = active.status === "completed" ? "Packet complete" : active.agent_reviewed_at ? "Office step pending" : "Review signature";
        row.sub = `${agreementName(active.template_key)} · ${row.tag}`;
        row.href += `&review=${active.id}`;
      } else if (active && ["sent", "opened"].includes(active.status)) {
        bucket = "sent"; row.tag = active.status === "opened" ? "Opened" : "Sent";
        row.at = active.sent_at || row.at; row.sub = agreementName(active.template_key);
      } else if (isSignedKey(claim.status, opts.statuses) && lead.signed_at) {
        bucket = "signed"; row.tag = "Signed";
      } else {
        if (!opts.acquisitionReady || !isAcquisitionEligible(lead, claim, { statuses: opts.statuses, holds: opts.holds })) continue;
        if (claim.status === "esign_sent" && matterAgreements.length === 0) {
          bucket = "sent"; row.tag = "Sent";
        } else if (lead.perm_call === false) {
          bucket = "review"; row.tag = "Do not call"; row.sub = "Calling is disabled for this number. Review the contact preference.";
        } else if (latestCall?.disposition === "callback" && latestCall.callback_at) {
          bucket = "callbacks"; row.tag = "Call back"; row.due = latestCall.callback_at; row.at = latestCall.callback_at;
          row.sub = [latestCall.reason, latestCall.agent_name].filter(Boolean).join(", ");
        } else {
          const matters = (lead.claims || []).filter((c: any) => c.firm_id === lead.firm_id && c.campaign_id === claim.campaign_id && c.claim_type === "mva");
          row.outreach = placeOutreach(summary ?? null, lead.first_dialed_at ?? null, matters.length, lead.created_at);
          if (lead.perm_text === false) row.outreach.textPrompt = false;
          bucket = row.outreach.stage;
          row.tag = row.outreach.overdue ? "Overdue" : row.outreach.badge === "new" ? "New" : row.outreach.stage === "review" ? "Review" : row.outreach.stage === "wait" ? "Not yet due" : "Call now";
          row.due = row.outreach.dueAt;
          row.at = row.outreach.dueAt || latestCall?.created_at || row.at;
        }
      }
      queues[bucket].push(row);
    }
  }
  for (const [key, rows] of Object.entries(queues)) rows.sort((a, b) => ["callbacks", "due", "wait"].includes(key)
    ? String(a.due || "").localeCompare(String(b.due || "")) : String(b.at || "").localeCompare(String(a.at || "")));
  return queues;
}

