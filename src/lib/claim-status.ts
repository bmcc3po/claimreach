// Central claim-status setter. Enforces the rule that any disqualify-type status
// MUST carry a dq_reason_key (non-dismissable on the client, hard-checked here).
// Writes the status, the DQ reason when present, and an Activity Log entry.
import { supabaseAdmin } from "@/lib/supabase-server";
import { resolveStatus, type StatusDef } from "@/lib/statuses";
import { recordAudit } from "@/lib/audit";
import { matchAndStart } from "@/lib/automation-engine";

export interface SetStatusResult { ok: boolean; error?: string; }

export async function loadStatuses(): Promise<StatusDef[]> {
  const { data } = await supabaseAdmin().from("statuses").select("*").order("sort");
  return (data ?? []) as StatusDef[];
}

/**
 * The claim ids one campaign-scoped action should touch on a lead: the lead's
 * claims on that campaign, or every claim when none matches (a legacy
 * single-matter file whose claim predates campaign ids). Undefined only when
 * the lead has no claims at all. Callers that know the exact claim pass it
 * directly instead (Astra rounds 4-5: an MVA action must never move the Motel
 * matter on the same person).
 */
export async function claimScopeFor(leadId: string, campaignId?: string | null): Promise<string[] | undefined> {
  const admin = supabaseAdmin();
  let camp = campaignId;
  if (camp === undefined) {
    const { data: lead } = await admin.from("leads").select("campaign_id").eq("id", leadId).maybeSingle();
    camp = lead?.campaign_id ?? null;
  }
  const { data } = await admin.from("claims").select("id, campaign_id").eq("lead_id", leadId);
  const all = data ?? [];
  if (!all.length) return undefined;
  const hit = camp ? all.filter((c: any) => c.campaign_id === camp) : [];
  return (hit.length ? hit : all).map((c: any) => c.id);
}

// Set status on every claim under the given lead ids (claims hold status).
export async function setClaimStatusForLeads(opts: {
  leadIds: string[];
  /** When set, only these claims change; the lead-level flags still sync. */
  claimIds?: string[];
  status: string;
  dqReasonKey?: string | null;
  dqNote?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  statuses?: StatusDef[];
}): Promise<SetStatusResult> {
  const admin = supabaseAdmin();
  const list = opts.statuses ?? (await loadStatuses());
  const def = resolveStatus(opts.status, list);

  // Hard gate: disqualify status requires a reason key.
  if (def.qualify === "disqualify" && !opts.dqReasonKey) {
    return { ok: false, error: "A disqualification reason is required for this status." };
  }

  const patch: any = { status: opts.status, updated_at: new Date().toISOString() };
  if (def.qualify === "disqualify") {
    patch.dq_reason_key = opts.dqReasonKey ?? null;
    if (opts.dqNote != null) patch.dq_reason = opts.dqNote;
    patch.qualification = "dq";
  } else if (def.qualify === "qualify") {
    patch.qualification = "clear";
  }

  // The claim and the lead are ONE identity, never two independent inputs
  // (Astra rounds 4-5: supplied claim A + lead B changed A's status and then
  // ran B's side effects; a nonexistent claim still "succeeded"). Every
  // supplied claim must exist and belong to a supplied lead, the update must
  // actually hit rows, and everything after runs only for the leads whose
  // claims really changed.
  if (opts.claimIds?.length) {
    const { data: owned, error: ownErr } = await admin.from("claims").select("id, lead_id").in("id", opts.claimIds);
    if (ownErr) return { ok: false, error: ownErr.message };
    const rows = owned ?? [];
    if (rows.length !== opts.claimIds.length) {
      return { ok: false, error: "That claim no longer exists. Refresh the file and try again." };
    }
    const leadSet = new Set(opts.leadIds);
    if (rows.some((r: any) => !leadSet.has(r.lead_id))) {
      return { ok: false, error: "That claim does not belong to this file. Refresh and try again." };
    }
  }

  // Claim scope: a claim-specific action changes THAT claim, never every
  // claim on the lead (Astra round 4: an MVA dispo was flipping the Motel
  // claim on the same person). Lead-wide remains for lead-level operations.
  let cq = admin.from("claims").update(patch);
  cq = opts.claimIds?.length ? cq.in("id", opts.claimIds) : cq.in("lead_id", opts.leadIds);
  const { data: changed, error } = await cq.select("id, lead_id");
  if (error) return { ok: false, error: error.message };
  if (!changed?.length) {
    return { ok: false, error: "No claim was updated — this file may have no claim, or it was just removed. Refresh and try again." };
  }
  const touchedLeadIds = Array.from(new Set(changed.map((r: any) => String(r.lead_id))));

  // Keep the QA-queue flag in sync with the status phase so the QA queue and the
  // agent fix-inbox stay accurate without a separate write at every call site.
  // The flags are LEAD-level aggregates: a sibling matter still in QA keeps the
  // person's flags up even when this matter leaves QA (Astra round 5).
  if (def.phase === "in_qa") {
    const isWip = def.key === "wip" || def.key === "signed_wip";
    const patch2: any = { qa_pending: !isWip, wip_pending: isWip };
    if (!isWip) patch2.qa_entered_at = new Date().toISOString();
    // Mark signed_at when entering the signed track for the first time.
    if (def.key === "signed_grievous") patch2.signed_at = new Date().toISOString();
    // Keep the pipeline stage honest: a signed intake is complete, not still
    // "Referral Received" in My Queue (Astra audit, Sep 27).
    if (String(def.key).startsWith("signed")) patch2.stage = "intake_complete";
    await admin.from("leads").update(patch2).in("id", touchedLeadIds);
  } else if (def.phase === "post_qa" || def.phase === "terminal") {
    for (const leadId of touchedLeadIds) {
      const { data: sibs } = await admin.from("claims").select("id, status").eq("lead_id", leadId);
      const live = (sibs ?? []).filter((c: any) => resolveStatus(c.status, list).phase === "in_qa");
      if (!live.length) {
        await admin.from("leads").update({ qa_pending: false, wip_pending: false, qa_entered_at: null }).eq("id", leadId);
      } else {
        // Something on this person still needs QA: recompute which inbox.
        const allWip = live.every((c: any) => { const k = resolveStatus(c.status, list).key; return k === "wip" || k === "signed_wip"; });
        await admin.from("leads").update({ qa_pending: !allWip, wip_pending: allWip }).eq("id", leadId);
      }
    }
  }

  // Activity Log per lead — only leads whose claims actually changed.
  let reasonLabel = "";
  if (def.qualify === "disqualify" && opts.dqReasonKey) {
    const { data: r } = await admin.from("dq_reasons").select("label").eq("key", opts.dqReasonKey).maybeSingle();
    reasonLabel = r?.label ? ` (${r.label})` : "";
  }
  for (const leadId of touchedLeadIds) {
    await recordAudit({
      lead_id: leadId,
      actor: opts.actorId ?? undefined,
      actor_name: opts.actorName ?? "User",
      category: "status",
      description: `Status set to ${def.label}${reasonLabel}.`,
      meta: { status: opts.status, dq_reason_key: opts.dqReasonKey ?? null },
    });
    // Fire any status_changed automations for this lead (never blocks the write).
    try {
      await matchAndStart({ type: "status_changed", lead_id: leadId, toStatus: opts.status });
    } catch (e) {
      console.error("automation trigger failed", e);
    }
    // Outbound webhook so connected firms/CRMs stay in sync. Lives HERE, on
    // the one path every status change takes — it used to fire only from the
    // generic save route, which no longer carries status.
    try {
      const { fireEvent } = await import("@/lib/webhook-deliver");
      const { data: row } = await admin.from("leads").select("firm_id, campaign_id, lead_no, external_id, status, first_name, last_name, claimant_name, phone, email, dob, mail_address1, mail_city, mail_state, mail_zip, case_type, signed_at").eq("id", leadId).maybeSingle();
      if (row?.firm_id) {
        const evt = opts.status === "signed" || String(opts.status).startsWith("signed_") ? "lead.signed"
          : def.qualify === "disqualify" ? "lead.dq"
          : def.qualify === "qualify" ? "lead.qualified" : "lead.updated";
        const { data: claim } = await admin.from("claims")
          .select("answers, claim_type, campaign").eq("lead_id", leadId)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        await fireEvent(row.firm_id, evt, { lead_id: leadId, ...row, status: opts.status, campaign: claim?.campaign ?? null },
          { campaignId: row.campaign_id ?? null, answers: (claim?.answers ?? {}) as any });
      }
    } catch (e) {
      console.error("status webhook failed", e);
    }
    // Auto firm delivery: when a file reaches an unlocks_firm status, hand it to
    // the firm (guarded so it sends once; respects the campaign master switch).
    // Never blocks the status write.
    if (def.unlocks_firm === true) {
      try {
        const { deliverLeadToFirm } = await import("@/lib/firm-delivery");
        await deliverLeadToFirm({ leadId, triggeredBy: "auto", actorName: opts.actorName ?? "System" });
      } catch (e) {
        console.error("firm delivery trigger failed", e);
      }
    }
  }
  return { ok: true };
}
