import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { M6_CAMPAIGN, M6_CASE_TYPE, TMP_SLUG } from "@/lib/m6";
import {
  enterLadderOnInterviewMiss, walkCadence, type FileClock,
} from "@/lib/m6-cadence";
export const runtime = "edge";

// Walker only. Enrolls, advances, and records due items. Does not live-send.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: firm } = await admin.from("firms").select("id").eq("slug", TMP_SLUG).maybeSingle();
  if (!firm?.id) return NextResponse.json({ error: "tmp firm missing" }, { status: 503 });

  const { data: leads } = await admin.from("leads")
    .select("id, firm_id, created_at, retention_started_at, retention_stage, retention_paused_until, campaign, case_type, archived_at")
    .eq("firm_id", firm.id)
    .is("archived_at", null)
    .or(`campaign.eq.${M6_CAMPAIGN},case_type.eq.${M6_CASE_TYPE}`)
    .limit(500);

  const { data: rules } = await admin.from("drip_rules")
    .select("id, step_key, delay_days")
    .eq("campaign", "motel6")
    .eq("active", true);

  const now = new Date().toISOString();
  let enrolled = 0;
  let due = 0;
  let laddered = 0;

  for (const lead of leads ?? []) {
    if (rules?.length) {
      for (const r of rules) {
        const { data: exists } = await admin.from("drip_enrollments")
          .select("id").eq("lead_id", lead.id).eq("rule_id", r.id).maybeSingle();
        if (exists) continue;
        const delay = r.delay_days ?? 0;
        const start = new Date(lead.retention_started_at || lead.created_at);
        start.setUTCDate(start.getUTCDate() + Math.max(delay, 0));
        await admin.from("drip_enrollments").insert({
          firm_id: lead.firm_id, lead_id: lead.id, rule_id: r.id,
          next_due: start.toISOString().slice(0, 10), active: true,
        });
        enrolled++;
      }
    }

    const [{ data: twoWay }, { data: lastTouch }, { data: interview }] = await Promise.all([
      admin.from("communications").select("occurred_at").eq("lead_id", lead.id).eq("outcome", "two_way")
        .order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("communications").select("occurred_at").eq("lead_id", lead.id)
        .order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("communications").select("occurred_at, outcome, purpose").eq("lead_id", lead.id)
        .in("purpose", ["interview", "onboarding"])
        .order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const interviewDone = interview?.outcome === "two_way" ? interview.occurred_at : null;
    const clock: FileClock = {
      arrivedAt: lead.retention_started_at || lead.created_at,
      interviewAt: interviewDone,
      lastTwoWayAt: twoWay?.occurred_at ?? null,
      lastTouchAt: lastTouch?.occurred_at ?? null,
      lastInterviewOutcome: (interview?.outcome as FileClock["lastInterviewOutcome"]) ?? null,
      retentionStage: lead.retention_stage,
      pausedUntil: lead.retention_paused_until,
      now,
    };

    if (enterLadderOnInterviewMiss(interview?.outcome) && lead.retention_stage !== "escalation" && !twoWay?.occurred_at) {
      await admin.from("leads").update({ retention_stage: "escalation" }).eq("id", lead.id);
      laddered++;
    }

    const { data: sentRows } = await admin.from("communications")
      .select("template_key").eq("lead_id", lead.id).not("template_key", "is", null);
    const sent = (sentRows ?? []).map((r: any) => r.template_key).filter(Boolean);
    const actions = walkCadence(clock, sent);
    due += actions.length;

    for (const a of actions.filter((x) => x.kind === "call")) {
      const { data: open } = await admin.from("call_schedule")
        .select("id").eq("lead_id", lead.id).eq("status", "open").eq("kind", a.stage === "06" ? "escalation" : "heartbeat")
        .limit(1).maybeSingle();
      if (open) continue;
      await admin.from("call_schedule").insert({
        firm_id: lead.firm_id,
        lead_id: lead.id,
        due_at: a.dueAt,
        kind: a.stage === "06" ? "escalation" : a.stage === "02" ? "onboarding" : "heartbeat",
        note: `Cadence ${a.templateKey}`,
        status: "open",
      });
    }
  }

  return NextResponse.json({
    ok: true, enrolled, due, laddered, files: (leads ?? []).length, ran_at: now,
    live_sends: 0,
  });
}
