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

// Set status on every claim under the given lead ids (claims hold status).
export async function setClaimStatusForLeads(opts: {
  leadIds: string[];
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

  const { error } = await admin.from("claims").update(patch).in("lead_id", opts.leadIds);
  if (error) return { ok: false, error: error.message };

  // Keep the QA-queue flag in sync with the status phase so the QA queue and the
  // agent fix-inbox stay accurate without a separate write at every call site.
  if (def.phase === "in_qa") {
    const isWip = def.key === "wip" || def.key === "signed_wip";
    const patch2: any = { qa_pending: !isWip, wip_pending: isWip };
    if (!isWip) patch2.qa_entered_at = new Date().toISOString();
    // Mark signed_at when entering the signed track for the first time.
    if (def.key === "signed_grievous") patch2.signed_at = new Date().toISOString();
    await admin.from("leads").update(patch2).in("id", opts.leadIds);
  } else if (def.phase === "post_qa" || def.phase === "terminal") {
    await admin.from("leads").update({ qa_pending: false, wip_pending: false, qa_entered_at: null }).in("id", opts.leadIds);
  }

  // Activity Log per lead.
  let reasonLabel = "";
  if (def.qualify === "disqualify" && opts.dqReasonKey) {
    const { data: r } = await admin.from("dq_reasons").select("label").eq("key", opts.dqReasonKey).maybeSingle();
    reasonLabel = r?.label ? ` (${r.label})` : "";
  }
  for (const leadId of opts.leadIds) {
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
  }
  return { ok: true };
}
