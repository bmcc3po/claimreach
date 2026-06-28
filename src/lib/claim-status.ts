// Central claim-status setter. Enforces the rule that any disqualify-type status
// MUST carry a dq_reason_key (non-dismissable on the client, hard-checked here).
// Writes the status, the DQ reason when present, and an Activity Log entry.
import { supabaseAdmin } from "@/lib/supabase-server";
import { resolveStatus, type StatusDef } from "@/lib/statuses";
import { recordAudit } from "@/lib/audit";

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
  }
  return { ok: true };
}
