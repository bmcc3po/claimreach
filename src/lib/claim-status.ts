// Central claim-status setter. Enforces the rule that any disqualify-type status
// MUST carry a dq_reason_key (non-dismissable on the client, hard-checked here).
// Writes the status, the DQ reason when present, and an Activity Log entry.
//
// Round 7 (Astra round-6 review): every status change is bound to the claim(s)
// it actually changed. Nothing widens silently: no named claim + no explicit
// lead-wide command resolves ONE matter or stops. Queue flags are recomputed
// from all of the person's claims after every transition. The outbound
// webhook and firm delivery run per CHANGED claim, with that claim's own
// answers and campaign, and name a signing only when a signing happened.
import { supabaseAdmin } from "@/lib/supabase-server";
import { needsQaReview, resolveStatus, type StatusDef } from "@/lib/statuses";
import { resolveMatter } from "@/lib/matter";

export interface SetStatusResult { ok: boolean; error?: string; claimIds?: string[]; }

export async function loadStatuses(db?: any): Promise<StatusDef[]> {
  const { data } = await (db ?? supabaseAdmin()).from("statuses").select("*").order("sort");
  return (data ?? []) as StatusDef[];
}

/**
 * The one claim a single-matter action on a lead should touch, or an error.
 * Fails CLOSED: a lookup error, a lead with several claims and no single
 * match on the campaign, or a missing named claim all stop the action rather
 * than widening it (Astra round 6: an empty/undefined scope used to become a
 * lead-wide write). A single-claim lead is unambiguous by definition.
 */
export async function claimScopeFor(
  leadId: string,
  campaignId?: string | null,
  opts: { claimId?: string | null; db?: any } = {},
): Promise<{ ok: true; claimIds: string[] } | { ok: false; error: string }> {
  const db = opts.db ?? supabaseAdmin();
  let camp = campaignId;
  if (camp === undefined && !opts.claimId) {
    const { data: lead, error } = await db.from("leads").select("campaign_id").eq("id", leadId).maybeSingle();
    if (error) return { ok: false, error: `Could not read the file: ${error.message}` };
    camp = lead?.campaign_id ?? null;
  }
  const m = await resolveMatter(db, leadId, { claimId: opts.claimId ?? null, campaignId: camp ?? null });
  if (!m.ok) return { ok: false, error: m.error };
  return { ok: true, claimIds: [m.claim.id] };
}

/** Queue flags for one person, from ALL of their claims (never from one transition). */
export function queueFlagsFor(claimStatuses: (string | null)[], list: StatusDef[]): { qa_pending: boolean; wip_pending: boolean } {
  let qa = false, wip = false;
  for (const st of claimStatuses) {
    const d = resolveStatus(st ?? "", list);
    if (d.phase !== "in_qa") continue;
    if (d.key === "wip" || d.key === "signed_wip") wip = true;
    else if (needsQaReview(d.key, list)) qa = true;
  }
  return { qa_pending: qa, wip_pending: wip };
}

const SIGNED_ENTRY = new Set(["signed", "signed_grievous"]);
const isSignedFamily = (k: string | null | undefined) => {
  const s = String(k ?? "");
  return s === "signed" || s.startsWith("signed_") || s === "delivered" || s === "retained";
};

/**
 * The outbound event for one claim's transition. Disqualification (including
 * a signed file's drop letter) is lead.dq; lead.signed means a signing just
 * happened — entry into the signed track from outside it — never a later QA
 * or WIP move on an already-signed file (Astra round 6).
 */
export function statusEventFor(def: StatusDef, priorStatus: string | null | undefined): string {
  if (def.qualify === "disqualify") return "lead.dq";
  if (SIGNED_ENTRY.has(def.key) && !isSignedFamily(priorStatus)) return "lead.signed";
  if (def.qualify === "qualify") return "lead.qualified";
  return "lead.updated";
}

export interface StatusDeps {
  db?: any;
  audit?: (row: any) => Promise<void>;
  automation?: (evt: any) => Promise<void>;
  webhook?: (firmId: string, evt: string, payload: any, opts: any) => Promise<void>;
  deliver?: (o: { leadId: string; claimId: string; triggeredBy: "auto"; actorName: string }) => Promise<any>;
}

export async function setClaimStatusForLeads(opts: {
  leadIds: string[];
  /** The exact claims to change. Required unless leadWide or a single lead resolves one matter. */
  claimIds?: string[];
  /** An explicit lead-wide command (bulk status): every claim on these leads. */
  leadWide?: boolean;
  status: string;
  dqReasonKey?: string | null;
  dqNote?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  statuses?: StatusDef[];
  /** Single-target compare-and-set; a stale preview must never overwrite a newer decision. */
  expectedStatus?: string | null;
  /** Historical reconciliation is not a new signing or a reason to contact anyone. */
  historical?: boolean;
}, deps: StatusDeps = {}): Promise<SetStatusResult> {
  const db = deps.db ?? supabaseAdmin();
  const audit = deps.audit ?? (async (row: any) => { const { recordAudit } = await import("@/lib/audit"); await recordAudit(row); });
  const automation = deps.automation ?? (async (evt: any) => { const { matchAndStart } = await import("@/lib/automation-engine"); await matchAndStart(evt); });
  const webhook = deps.webhook ?? (async (f: string, e: string, p: any, o: any) => { const { fireEvent } = await import("@/lib/webhook-deliver"); await fireEvent(f, e, p, o); });
  const deliver = deps.deliver ?? (async (o: any) => { const { deliverLeadToFirm } = await import("@/lib/firm-delivery"); return deliverLeadToFirm(o); });

  const list = opts.statuses ?? (await loadStatuses(db));
  const def = resolveStatus(opts.status, list);

  // Staff must select a reason for a new DQ. An imported closed matter stays
  // closed when its source omitted the reason; its dedicated status flags that
  // missing information without inventing a reason or routing it through QA.
  const missingImportedReason = opts.historical === true && def.key === "external_dq_review";
  if (def.qualify === "disqualify" && !opts.dqReasonKey && !missingImportedReason) {
    return { ok: false, error: "A disqualification reason is required for this status." };
  }
  if (!opts.leadIds?.length) return { ok: false, error: "No file named." };

  // ---- Which claims, exactly. Never widen silently. ----
  let targetIds: string[] | null = opts.claimIds?.length ? [...opts.claimIds] : null;
  if (!targetIds && !opts.leadWide) {
    if (opts.leadIds.length !== 1) return { ok: false, error: "Name the matter to change, or use a bulk status command." };
    const scope = await claimScopeFor(opts.leadIds[0], undefined, { db });
    if (!scope.ok) return { ok: false, error: scope.error };
    targetIds = scope.claimIds;
  }

  // Prior state of every target, read BEFORE the write: ownership checks, and
  // the prior status decides whether this is a signing event.
  let pq = db.from("claims").select("id, lead_id, status, campaign_id, campaign, answers, claim_type");
  pq = targetIds ? pq.in("id", targetIds) : pq.in("lead_id", opts.leadIds);
  const { data: priorRows, error: priorErr } = await pq;
  if (priorErr) return { ok: false, error: priorErr.message };
  const prior = (priorRows ?? []) as any[];
  const compareStatus = Object.prototype.hasOwnProperty.call(opts, "expectedStatus");
  if (compareStatus && (prior.length !== 1 || !targetIds || targetIds.length !== 1)) return { ok: false, error: "A status comparison requires one exact matter." };
  if (compareStatus && (prior[0].status ?? null) !== (opts.expectedStatus ?? null)) return { ok: false, error: "This matter's status changed after the preview. Refresh before applying." };
  if (targetIds) {
    // The claim and the lead are ONE identity (Astra rounds 4-5).
    if (prior.length !== targetIds.length) return { ok: false, error: "That claim no longer exists. Refresh the file and try again." };
    const leadSet = new Set(opts.leadIds);
    if (prior.some((r) => !leadSet.has(r.lead_id))) return { ok: false, error: "That claim does not belong to this file. Refresh and try again." };
  }

  const patch: any = { status: opts.status, updated_at: new Date().toISOString() };
  if (def.qualify === "disqualify") {
    patch.dq_reason_key = opts.dqReasonKey ?? null;
    if (opts.dqNote != null) patch.dq_reason = opts.dqNote;
    patch.qualification = "dq";
  } else if (def.qualify === "qualify") {
    patch.qualification = "clear";
  }

  let cq = db.from("claims").update(patch);
  cq = targetIds ? cq.in("id", targetIds) : cq.in("lead_id", opts.leadIds);
  if (compareStatus) cq = opts.expectedStatus == null ? cq.is("status", null) : cq.eq("status", opts.expectedStatus);
  const { data: changed, error } = await cq.select("id, lead_id");
  if (error) return { ok: false, error: error.message };
  if (!changed?.length) {
    return { ok: false, error: "No claim was updated — this file may have no claim, or it was just removed. Refresh and try again." };
  }
  const changedIds = new Set<string>(changed.map((r: any) => String(r.id)));
  const touchedLeadIds: string[] = Array.from(new Set<string>(changed.map((r: any) => String(r.lead_id))));
  const priorById = new Map(prior.map((r) => [String(r.id), r]));

  // ---- Queue flags: recomputed from ALL of the person's claims. ----
  // A sibling still in QA keeps qa_pending; a sibling in WIP keeps
  // wip_pending; both can be true at once. A failed read or write is an
  // error, never a silent "no siblings" (Astra round 6).
  const flagErrors: string[] = [];
  for (const leadId of touchedLeadIds) {
    const { data: sibs, error: sErr } = await db.from("claims").select("id, status").eq("lead_id", leadId);
    if (sErr) { flagErrors.push(sErr.message); continue; }
    const flags: any = queueFlagsFor((sibs ?? []).map((c: any) => c.status), list);
    if (!opts.historical && def.phase === "in_qa" && def.key !== "wip" && def.key !== "signed_wip") flags.qa_entered_at = new Date().toISOString();
    if (!opts.historical && !flags.qa_pending && !flags.wip_pending) flags.qa_entered_at = null;
    // Mark signed_at when entering the signed track for the first time.
    if (def.key === "signed_grievous" && !opts.historical) flags.signed_at = new Date().toISOString();
    // A signed intake is complete, not still "Referral Received" (Astra, Sep 27).
    if (String(def.key).startsWith("signed")) flags.stage = "intake_complete";
    const { error: fErr } = await db.from("leads").update(flags).eq("id", leadId);
    if (fErr) flagErrors.push(fErr.message);
  }

  let reasonLabel = "";
  if (def.qualify === "disqualify" && opts.dqReasonKey) {
    const { data: r } = await db.from("dq_reasons").select("label").eq("key", opts.dqReasonKey).maybeSingle();
    reasonLabel = r?.label ? ` (${r.label})` : "";
  }

  for (const leadId of touchedLeadIds) {
    const mine = prior.filter((r) => r.lead_id === leadId && changedIds.has(String(r.id)));
    try {
      await audit({
        lead_id: leadId, actor: opts.actorId ?? undefined, actor_name: opts.actorName ?? "User",
        category: "status",
        description: `Status set to ${def.label}${reasonLabel}${mine.length === 1 && mine[0].campaign ? ` on ${mine[0].campaign}` : ""}.`,
        meta: { status: opts.status, dq_reason_key: opts.dqReasonKey ?? null, claim_ids: mine.map((r) => r.id) },
      });
    } catch (e) { console.error("status audit failed", e); }
    try { if (!opts.historical) await automation({ type: "status_changed", lead_id: leadId, toStatus: opts.status }); }
    catch (e) { console.error("automation trigger failed", e); }

    // Outbound webhook: ONE event per changed claim, carrying THAT claim's
    // answers, id and campaign (Astra round 6: the oldest sibling's answers
    // were sent under the lead's campaign).
    let row: any = null;
    try {
      const r = await db.from("leads").select("firm_id, campaign_id, lead_no, external_id, first_name, last_name, claimant_name, phone, email, dob, mail_addr1, mail_city, mail_state, mail_zip, case_type, signed_at").eq("id", leadId).maybeSingle();
      row = r.data;
    } catch { row = null; }
    for (const c of mine) {
      if (row?.firm_id && !opts.historical) {
        try {
          const evt = statusEventFor(def, priorById.get(String(c.id))?.status);
          await webhook(row.firm_id, evt,
            { lead_id: leadId, claim_id: c.id, ...row, status: opts.status, previous_status: c.status ?? null, campaign: c.campaign ?? null, campaign_id: c.campaign_id ?? null, claim_type: c.claim_type ?? null },
            { campaignId: c.campaign_id ?? row.campaign_id ?? null, answers: (c.answers ?? {}) as any });
        } catch (e) { console.error("status webhook failed", e); }
      }
      // Auto firm delivery for THIS matter (guarded per claim; respects the
      // campaign master switch). Never blocks the status write.
      if (def.unlocks_firm === true && !opts.historical) {
        try { await deliver({ leadId, claimId: String(c.id), triggeredBy: "auto", actorName: opts.actorName ?? "System" }); }
        catch (e) { console.error("firm delivery trigger failed", e); }
      }
    }
  }

  if (flagErrors.length) {
    return { ok: false, claimIds: Array.from(changedIds), error: `Status changed, but the queue flags did not update: ${flagErrors[0]}. Refresh the file; the QA queue may be out of step.` };
  }
  return { ok: true, claimIds: Array.from(changedIds) };
}
