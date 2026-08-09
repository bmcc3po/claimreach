// ============================================================================
// Automation executor. The cron calls drainQueue(); this runs each due step,
// checks stop conditions first, performs the action, then schedules the next
// step (wait adds a delay, branch picks a path). Channel actions reuse existing
// infrastructure (JustCall, claim-status helper, notes/tasks, esign).
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";
import { clampToWindow } from "@/lib/automation-engine";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";

interface Step { type: string; config?: any; }

// Has a stop condition been met since the run started?
async function shouldStop(stops: string[], runId: string, leadId: string, startedAt: string): Promise<string | null> {
  if (!stops || stops.length === 0) return null;
  const admin = supabaseAdmin();

  if (stops.includes("on_reply")) {
    const { data } = await admin.from("communications").select("id")
      .eq("lead_id", leadId).eq("direction", "inbound").gte("occurred_at", startedAt).limit(1).maybeSingle();
    if (data) return "client replied";
  }
  if (stops.includes("on_status_change") || stops.includes("on_sign") || stops.includes("on_dq")) {
    const { data: claim } = await admin.from("claims").select("status, updated_at")
      .eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (claim) {
      if (stops.includes("on_sign") && /signed|retained|approved/.test(claim.status || "")) return "file signed";
      if (stops.includes("on_dq") && /dq|dropped|declined|dead/.test(claim.status || "")) return "file disqualified";
      if (stops.includes("on_status_change") && claim.updated_at > startedAt) return "status changed";
    }
  }
  return null;
}

// Merge basic tokens into message bodies.
function fillTokens(body: string, lead: any): string {
  return (body || "")
    .replace(/\{\{first_name\}\}/gi, lead.first_name || (lead.claimant_name || "").split(" ")[0] || "")
    .replace(/\{\{full_name\}\}/gi, lead.claimant_name || "")
    .replace(/\{\{phone\}\}/gi, lead.phone || "");
}

async function runStep(step: Step, ctx: { lead: any; firmId: string | null; origin: string; runId: string; automationId: string }): Promise<any> {
  const admin = supabaseAdmin();
  const { lead, firmId } = ctx;
  switch (step.type) {
    case "send_sms": {
      const body = fillTokens(step.config?.body || "", lead);
      if (!lead.phone) return { skipped: "no phone" };
      const r = await fetch(`${ctx.origin}/api/justcall`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-automation": "1" },
        body: JSON.stringify({ action: "text", lead_id: lead.id, to: lead.phone, body }),
      }).catch(() => null);
      return { sms: r?.ok ? "sent" : "failed" };
    }
    case "create_task": {
      await admin.from("notes").insert({
        firm_id: firmId, lead_id: lead.id, author_name: "Automation", scope: "file",
        body: `Task: ${step.config?.subject || "Follow up"} (auto-created).`,
      });
      return { task: "created" };
    }
    case "change_status": {
      const res = await setClaimStatusForLeads({
        leadIds: [lead.id], status: step.config?.status,
        dqReasonKey: step.config?.dq_reason_key ?? null, actorName: "Automation",
      });
      return { status: res.ok ? step.config?.status : res.error };
    }
    case "assign": {
      await admin.from("leads").update({ assigned_agent: step.config?.agent_id ?? null }).eq("id", lead.id);
      return { assigned: step.config?.agent_id ?? "unassigned" };
    }
    case "place_call": {
      await admin.from("notes").insert({
        firm_id: firmId, lead_id: lead.id, author_name: "Automation", scope: "file",
        body: `Call task: agent to call ${lead.phone || "lead"} (auto).`,
      });
      return { call_task: "created" };
    }
    case "send_email": {
      // Email send wires to the notify/email path in Channels zip; log for now.
      await admin.from("notes").insert({
        firm_id: firmId, lead_id: lead.id, author_name: "Automation", scope: "file",
        body: `Email queued: ${step.config?.subject || "(no subject)"}.`,
      });
      return { email: "queued" };
    }
    case "send_to_firm": {
      // Assemble the campaign's firm packet and email it. force resends past guard.
      const { deliverLeadToFirm } = await import("@/lib/firm-delivery");
      const res = await deliverLeadToFirm({
        leadId: lead.id, triggeredBy: "automation", actorName: "Automation",
        force: step.config?.force === true,
      });
      return res.ok ? { firm_delivery: res.skipped ? res.skipped : "sent", to: res.to } : { firm_delivery: "failed", error: res.error };
    }
    case "wait":
    case "branch":
      return { control: step.type };
    default:
      return { unknown: step.type };
  }
}

// Compute the run_at for the next step given a wait config.
function nextRunAt(step: Step | undefined, base: Date): Date {
  if (step?.type === "wait") {
    const c = step.config || {};
    const ms = (c.minutes || 0) * 60000 + (c.hours || 0) * 3600000 + (c.days || 0) * 86400000;
    return new Date(base.getTime() + ms);
  }
  return base;
}

export async function drainQueue(origin: string, limit = 200): Promise<{ ran: number; stopped: number }> {
  const admin = supabaseAdmin();
  const { data: due } = await admin.from("automation_queue_due").select("*").order("run_at").limit(limit);
  let ran = 0, stopped = 0;
  for (const q of due ?? []) {
    const { data: run } = await admin.from("automation_runs").select("*").eq("id", q.run_id).maybeSingle();
    if (!run || run.state !== "active") { await admin.from("automation_queue").update({ state: "skipped" }).eq("id", q.id); continue; }

    const stops: string[] = q.stop_conditions ?? [];
    const stopReason = await shouldStop(stops, run.id, q.lead_id, run.started_at);
    if (stopReason) {
      await admin.from("automation_runs").update({ state: "stopped", stop_reason: stopReason, ended_at: new Date().toISOString() }).eq("id", run.id);
      await admin.from("automation_queue").update({ state: "skipped" }).eq("id", q.id);
      await admin.from("automation_events").insert({ run_id: run.id, automation_id: q.automation_id, lead_id: q.lead_id, kind: "stopped", detail: stopReason });
      stopped++;
      continue;
    }

    const steps: Step[] = q.steps ?? [];
    const step = steps[q.step_index];
    if (!step) {
      await admin.from("automation_runs").update({ state: "done", ended_at: new Date().toISOString() }).eq("id", run.id);
      await admin.from("automation_queue").update({ state: "done", ran_at: new Date().toISOString() }).eq("id", q.id);
      continue;
    }

    const { data: lead } = await admin.from("leads").select("*").eq("id", q.lead_id).maybeSingle();
    let result: any = { skipped: "no lead" };
    if (lead) {
      result = await runStep(step, { lead, firmId: q.firm_id, origin, runId: run.id, automationId: q.automation_id }).catch((e: any) => ({ error: String(e?.message ?? e) }));
      if (step.type !== "wait" && step.type !== "branch") {
        await recordAudit({
          firm_id: q.firm_id, lead_id: q.lead_id, actor_name: "Automation",
          category: "system", description: `Automation step: ${step.type}.`, meta: result,
        });
      }
    }

    await admin.from("automation_queue").update({ state: "done", ran_at: new Date().toISOString(), result }).eq("id", q.id);
    await admin.from("automation_events").insert({ run_id: run.id, automation_id: q.automation_id, lead_id: q.lead_id, kind: "step_run", detail: step.type, meta: result });

    // Schedule the next step. branch picks the next index; default is +1.
    let nextIndex = q.step_index + 1;
    if (step.type === "branch") {
      // config: { if:{field,op,value}, then_index, else_index }
      // Minimal v1: evaluate a simple equality on a comm/status signal handled later;
      // for now follow then_index when present, else else_index, else +1.
      const cfg = step.config || {};
      nextIndex = (cfg.then_index ?? nextIndex);
    }
    if (nextIndex < steps.length) {
      const waitStep = steps[nextIndex]?.type === "wait" ? steps[nextIndex] : undefined;
      const base = nextRunAt(waitStep, new Date());
      const runAt = clampToWindow(base, q.send_window, (lead?.mail_state ?? lead?.state));
      await admin.from("automation_runs").update({ current_step: nextIndex }).eq("id", run.id);
      await admin.from("automation_queue").insert({
        run_id: run.id, automation_id: q.automation_id, lead_id: q.lead_id, firm_id: q.firm_id,
        step_index: nextIndex, run_at: runAt.toISOString(), state: "pending",
      });
    } else {
      await admin.from("automation_runs").update({ state: "done", ended_at: new Date().toISOString() }).eq("id", run.id);
    }
    ran++;
  }
  return { ran, stopped };
}
