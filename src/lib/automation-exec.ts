// ============================================================================
// Automation executor. The cron calls drainQueue(); this runs each due step,
// checks stop conditions first, performs the action, then schedules the next
// step (wait adds a delay, branch picks a path). Channel actions reuse existing
// infrastructure (JustCall, claim-status helper, notes/tasks, esign).
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";
import { clampToWindow, conditionsMatch, loadAutomationTarget, automationStepRunAt } from "@/lib/automation-engine";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { manualIntakeStatusAllowed } from "@/lib/statuses";
import { intakeStatusTransitionBlock, signedAgreementStopReason } from "@/lib/intake-status-guard";

interface Step { type: string; config?: any; }

// Read failures are not evidence that no reply/signature exists.
async function shouldStop(admin: any, stops: string[], target: any, startedAt: string, payload: any): Promise<string | null> {
  if (target.blocked) return target.blocked;
  if (!Array.isArray(stops) || stops.some(s => !["on_reply", "on_status_change", "on_sign", "on_dq"].includes(s))) throw new Error("Invalid automation stop conditions.");
  const { lead, claim } = target;
  if (stops.includes("on_reply")) {
    if (!Number.isFinite(Date.parse(startedAt))) throw new Error("Automation start time is missing.");
    const { data, error } = await admin.from("communications").select("id")
      .eq("lead_id", lead.id).eq("direction", "inbound").gte("occurred_at", startedAt).limit(1).maybeSingle();
    if (error) throw new Error("Could not check whether the client replied.");
    if (data) return "client replied";
  }
  if (stops.includes("on_sign")) {
    const signed = await signedAgreementStopReason(admin, target);
    if (signed) return signed;
  }
  if (stops.includes("on_status_change")) {
    if (typeof payload?.start_status !== "string") throw new Error("Automation's starting status is missing; review this legacy run.");
    if (claim.status !== payload.start_status) return "status changed";
  }
  return null;
}

async function runStep(step: Step, ctx: { lead: any; claim: any; soleClaim: boolean; firmId: string | null; origin: string; runId: string; automationId: string }): Promise<any> {
  const admin = supabaseAdmin();
  const { lead, claim, firmId } = ctx;
  switch (step.type) {
    case "send_sms": {
      // /api/justcall requires an operator session; a cron self-request has
      // none. A real service sender must check consent and provider receipt.
      return { error: "Automated SMS delivery is not configured." };
    }
    case "create_task": {
      const { error } = await admin.from("notes").insert({
        firm_id: firmId, lead_id: lead.id, claim_id: claim.id, author_name: "Automation", scope: "file",
        body: `Task: ${step.config?.subject || "Follow up"} (auto-created).`,
      });
      return error ? { error: `Could not create task: ${error.message}` } : { task: "created" };
    }
    case "change_status": {
      const status = step.config?.status;
      const { data: catalog, error } = await admin.from("statuses").select("*");
      if (error || !Array.isArray(catalog)) return { error: "Could not verify available automation statuses." };
      const blocked = await intakeStatusTransitionBlock(admin, { lead, claim, soleClaim: ctx.soleClaim }, catalog);
      if (blocked) return { error: blocked };
      const nextStatus = catalog.find((item: any) => item.key === status);
      if (!nextStatus || nextStatus.active === false) return { error: "Automation requires an active status from the catalog." };
      if (!manualIntakeStatusAllowed(nextStatus)) return { error: "This status requires agreement review, QA, or firm-delivery evidence; a generic automation cannot assign it." };
      const res = await setClaimStatusForLeads({
        leadIds: [lead.id], claimIds: [claim.id], expectedStatus: claim.status, status,
        dqReasonKey: step.config?.dq_reason_key ?? null, actorName: "Automation", statuses: catalog,
      });
      return res.ok ? { status } : { error: res.error || "Status change failed." };
    }
    case "assign": {
      const { data, error } = await admin.from("leads").update({ assigned_agent: step.config?.agent_id ?? null }).eq("id", lead.id).eq("firm_id", firmId).is("archived_at", null).select("id").maybeSingle();
      return error || !data ? { error: "Could not confirm agent assignment." } : { assigned: step.config?.agent_id ?? "unassigned" };
    }
    case "place_call": {
      const { error } = await admin.from("notes").insert({
        firm_id: firmId, lead_id: lead.id, claim_id: claim.id, author_name: "Automation", scope: "file",
        body: `Call task: agent to call ${lead.phone || "lead"} (auto).`,
      });
      return error ? { error: `Could not create call reminder: ${error.message}` } : { call_task: "created" };
    }
    case "send_email": {
      return { error: "Automated email delivery is not configured." };
    }
    case "send_to_firm": {
      // Exact matter only. Automation never forces a duplicate delivery.
      const { deliverLeadToFirm } = await import("@/lib/firm-delivery");
      const res = await deliverLeadToFirm({
        leadId: lead.id, claimId: claim.id, triggeredBy: "automation", actorName: "Automation",
        force: false,
      });
      return res.ok
        ? { firm_delivery: res.skipped ? res.skipped : "sent", to: res.to, claim_id: res.claimId ?? null, warning: res.warning ?? null }
        : { firm_delivery: "failed", error: res.error, claim_id: res.claimId ?? null, ambiguous: !!res.ambiguous };
    }
    case "wait":
    case "branch":
      return { control: step.type };
    default:
      return { error: `Unsupported automation step: ${step.type}` };
  }
}

function nextStepIndex(step: Step, index: number, length: number, target: any): number {
  if (step.type !== "branch") return index + 1;
  const cfg = step.config || {};
  if (!cfg.if || !["case_type", "status", "source", "campaign", "firm_id", "state", "language", "assigned_agent", "tags"].includes(cfg.if.field) ||
    !["is", "is_not", "any_of", "contains", "not_blank", "is_blank"].includes(cfg.if.op)) throw new Error("Invalid automation branch condition.");
  const matches = conditionsMatch({ rules: [cfg.if] }, target.lead, target.claim);
  const next = (matches ? cfg.then_index : cfg.else_index) ?? index + 1;
  if (!Number.isInteger(next) || next <= index || next > length) throw new Error("Automation branches must move forward to a valid step.");
  return next;
}

async function checked(query: any, message: string) {
  const result = await query;
  if (result.error) throw new Error(message);
  return result.data;
}

export async function drainQueue(origin: string, limit = 200): Promise<{ ran: number; stopped: number }> {
  const admin = supabaseAdmin();
  const due = await checked(admin.from("automation_queue_due").select("*").order("run_at").limit(limit), "Could not read due automation work.");
  if (!Array.isArray(due)) throw new Error("Could not verify due automation work.");
  let ran = 0, stopped = 0;
  for (const candidate of due) {
    // Postgres performs this conditional update atomically. Only the worker
    // that gets the row may perform an effect. No TTL resets processing rows:
    // a crashed/uncertain worker requires deliberate review, never a resend.
    const q = await checked(admin.from("automation_queue").update({ state: "processing" })
      .eq("id", candidate.id).eq("state", "pending").lte("run_at", new Date().toISOString()).select("*").maybeSingle(), "Could not claim automation work.");
    if (!q) continue;
    let run: any = null;
    let step: Step | undefined;
    let result: any;
    try {
      run = await checked(admin.from("automation_runs").select("*").eq("id", q.run_id).maybeSingle(), "Could not verify automation run.");
      if (!run || run.state !== "active") {
        await checked(admin.from("automation_queue").update({ state: "skipped" }).eq("id", q.id).eq("state", "processing"), "Could not close inactive automation work.");
        continue;
      }
      if (run.automation_id !== q.automation_id || run.lead_id !== q.lead_id || run.firm_id !== q.firm_id || run.current_step !== q.step_index) throw new Error("Automation run scope or current step changed.");
      const a = await checked(admin.from("automations").select("*").eq("id", q.automation_id).maybeSingle(), "Could not verify automation configuration.");
      if (!a?.active) throw new Error("Automation is no longer active.");
      const target = await loadAutomationTarget(admin, q.lead_id, q.payload?.claim_id);
      if (q.firm_id !== target.lead.firm_id || (a.firm_id && a.firm_id !== q.firm_id) ||
        (q.payload?.claim_id && (q.payload.campaign_id ?? null) !== (target.claim.campaign_id ?? null))) throw new Error("Automation matter or firm scope changed.");
      const stopReason = await shouldStop(admin, a.stop_conditions ?? [], target, run.started_at, q.payload);
      if (stopReason) {
        await checked(admin.from("automation_runs").update({ state: "stopped", stop_reason: stopReason, ended_at: new Date().toISOString() }).eq("id", run.id), "Could not stop automation run.");
        await checked(admin.from("automation_queue").update({ state: "skipped" }).eq("id", q.id).eq("state", "processing"), "Could not skip stopped automation step.");
        await checked(admin.from("automation_events").insert({ run_id: run.id, automation_id: q.automation_id, lead_id: q.lead_id, kind: "stopped", detail: stopReason }), "Could not record automation stop.");
        stopped++; continue;
      }
      // A delayed cron can run after closing time. Re-evaluate NOW, not the
      // original due timestamp, and defer without performing any effect.
      const now = new Date();
      const permitted = clampToWindow(now, a.send_window, target.lead.mail_state ?? target.lead.state, target.lead.client_time_zone);
      if (permitted.getTime() > now.getTime()) {
        await checked(admin.from("automation_queue").update({ state: "pending", run_at: permitted.toISOString() }).eq("id", q.id).eq("state", "processing"), "Could not defer automation into its calling window.");
        continue;
      }
      const steps: Step[] = a.steps;
      if (!Array.isArray(steps) || !Number.isInteger(q.step_index) || q.step_index < 0 || !steps[q.step_index]?.type) throw new Error("Automation step is missing or invalid.");
      step = steps[q.step_index];
      const nextIndex = nextStepIndex(step, q.step_index, steps.length, target);
      // Validate the continuation before an irreversible effect.
      const nextAt = nextIndex < steps.length
        ? clampToWindow(automationStepRunAt(steps[nextIndex], now), a.send_window, target.lead.mail_state ?? target.lead.state, target.lead.client_time_zone) : null;
      result = await runStep(step, { lead: target.lead, claim: target.claim, soleClaim: target.soleClaim, firmId: q.firm_id, origin, runId: run.id, automationId: q.automation_id });
      if (result?.error || result?.firm_delivery === "failed") throw new Error(result.error || "Automation action failed.");
      if (step.type !== "wait" && step.type !== "branch") {
        // The general audit helper intentionally swallows errors. Here audit
        // acknowledgement is part of finishing a queue effect. A failed or
        // lost response holds the run; it never repeats the possible effect.
        const audit = await checked(admin.from("audit_log").insert({
          firm_id: q.firm_id, lead_id: q.lead_id, claim_id: target.claim.id, actor_name: "Automation", category: "system",
          description: `Automation step: ${step.type}.`, meta: { ...result, automation_id: q.automation_id, run_id: run.id, queue_id: q.id },
        }).select("id").single(), "Automation action may have completed but its audit entry could not be confirmed; review before retrying.");
        if (!audit?.id) throw new Error("Automation action may have completed but its audit entry could not be confirmed; review before retrying.");
      }
      await checked(admin.from("automation_queue").update({ state: "done", ran_at: new Date().toISOString(), result }).eq("id", q.id).eq("state", "processing"), "Automation action completed but its result could not be confirmed; review before retrying.");
      await checked(admin.from("automation_events").insert({ run_id: run.id, automation_id: q.automation_id, lead_id: q.lead_id, kind: "step_run", detail: step.type, meta: result }), "Automation action completed but its history could not be saved.");
      if (nextAt) {
        // A continuation starts held and becomes pending only after the run
        // acknowledges its index. No failed insert is blindly repeated.
        const next = await checked(admin.from("automation_queue").insert({
          run_id: run.id, automation_id: q.automation_id, lead_id: q.lead_id, firm_id: q.firm_id,
          step_index: nextIndex, run_at: nextAt.toISOString(), state: "held",
          payload: { ...q.payload, claim_id: target.claim.id, campaign_id: target.claim.campaign_id ?? null },
        }).select("id").single(), "Could not confirm the next automation step.");
        if (!next?.id) throw new Error("Could not confirm the next automation step.");
        await checked(admin.from("automation_runs").update({ current_step: nextIndex }).eq("id", run.id).eq("state", "active"), "Could not advance the automation run.");
        await checked(admin.from("automation_queue").update({ state: "pending" }).eq("id", next.id).eq("state", "held"), "Could not activate the next automation step.");
      } else {
        await checked(admin.from("automation_runs").update({ state: "done", ended_at: new Date().toISOString() }).eq("id", run.id).eq("state", "active"), "Could not finish the automation run.");
      }
      ran++;
    } catch (error: any) {
      const reason = String(error?.message || "Automation could not be verified.");
      // Any uncertain side effect stays non-runnable. If these writes fail,
      // throw to the cron so monitoring cannot report a false empty success.
      await checked(admin.from("automation_queue").update({ state: "failed", ran_at: new Date().toISOString(), result: { ...(result ?? {}), error: reason } }).eq("id", q.id), "Automation work is held but its failure could not be recorded.");
      if (run) await checked(admin.from("automation_runs").update({ state: "stopped", stop_reason: reason, ended_at: new Date().toISOString() }).eq("id", run.id), "Automation work is held but its run could not be stopped.");
      await checked(admin.from("automation_events").insert({ run_id: q.run_id, automation_id: q.automation_id, lead_id: q.lead_id, kind: "error", detail: step?.type ?? "guard", meta: { error: reason } }), "Automation work is held but its failure history could not be saved.");
      stopped++;
    }
  }
  return { ran, stopped };
}
