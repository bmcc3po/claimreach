"use client";
import FileActions from "./FileActions";
import { commDirection } from "./ConversationFeed";
import {
  OUTCOMES, SECONDARY_INTERVIEW_DOC_TYPE, displayName, formatLocalDateTime,
  lorShowsOnToday,
} from "@/lib/m6";
import {
  LADDER_STEPS, STAGE_LABELS, fileFacts, nextMove, resolveCadenceStage,
  type CadenceStage, type FileClock,
} from "@/lib/m6-cadence";

type Point = {
  kind: string; status: string; value?: string | null; person_name?: string | null;
};

type Comm = {
  id: string; channel: string; direction: string; outcome?: string | null;
  purpose?: string | null; body?: string | null; agent_name?: string | null;
  occurred_at: string; ladder_step?: number | null;
};

function clockFromFile(lead: any, status: any, interviewAt: string | null, lastInterviewOutcome: FileClock["lastInterviewOutcome"]): FileClock {
  return {
    arrivedAt: lead.retention_started_at || lead.created_at || new Date().toISOString(),
    interviewAt,
    lastTwoWayAt: status?.last_two_way_at ?? null,
    lastTouchAt: status?.last_touch_at ?? null,
    lastInterviewOutcome,
    retentionStage: lead.retention_stage ?? status?.retention_stage ?? null,
    pausedUntil: lead.retention_paused_until ?? status?.retention_paused_until ?? null,
    now: new Date().toISOString(),
  };
}

function channelWord(channel: string): string {
  if (channel === "sms") return "Text";
  if (channel === "email") return "Email";
  if (channel === "voicemail") return "Voicemail";
  return "Call";
}

export default function FileCommand({
  lead, status, points, comms, docs, lor,
}: {
  lead: any;
  status: any;
  points: Point[];
  comms: Comm[];
  docs: any[];
  lor: any;
}) {
  const name = displayName(lead);
  const interview = (docs ?? []).find((d) => d.doc_type === SECONDARY_INTERVIEW_DOC_TYPE);
  const interviewComm = (comms ?? []).find((c) =>
    (c.purpose === "interview" || c.purpose === "onboarding") && c.outcome,
  );
  const interviewAt = interview?.created_at
    ?? (interviewComm?.outcome === "two_way" ? interviewComm.occurred_at : null);
  const clock = clockFromFile(
    lead,
    status,
    interviewAt,
    (interviewComm?.outcome as FileClock["lastInterviewOutcome"]) ?? null,
  );
  const resolved = resolveCadenceStage(clock);
  const live = (points ?? []).filter((p) => p.status !== "dead" && p.status !== "opted_out");
  const livePhones = live.filter((p) => p.kind === "mobile" || p.kind === "landline").length
    + (lead.phone ? 1 : 0);
  const hasStablePerson = live.some((p) => p.kind === "person") || !!lead.ec_name;
  const move = nextMove({
    name,
    inboundWaiting: !!status?.inbound_waiting,
    lastTwoWayAt: status?.last_two_way_at ?? null,
    interviewAt,
    hasInterview: !!interviewAt,
    retentionStage: clock.retentionStage,
    ladderStep: resolved.ladderStep ?? status?.ladder_step ?? null,
    enterLadder: resolved.enterLadder,
    pausedUntil: clock.pausedUntil,
    heartbeatOverdue: resolved.heartbeatOverdue,
    daysOverdue: status?.days_overdue ?? 0,
    lorStatus: lor?.status ?? "not_sent",
    lorFactsReady: lorShowsOnToday(lor),
    liveContactPoints: live.length || livePhones,
    hasStablePerson,
    commsMonitored: !!lead.comms_monitored,
    nextTouchDue: resolved.heartbeatDueAt ?? status?.next_touch_due ?? null,
  });
  const facts = fileFacts({
    hasInterview: !!interviewAt,
    livePhones: Math.max(livePhones, live.filter((p) => p.kind === "mobile" || p.kind === "landline").length),
    hasStablePerson,
    lorSent: lor?.status === "sent" || lor?.status === "received",
    hasTwoWay: !!status?.last_two_way_at,
    commsMonitored: !!lead.comms_monitored,
  });
  const lacking = facts.filter((f) => !f.done);
  const done = facts.filter((f) => f.done);
  const stages = Object.keys(STAGE_LABELS) as CadenceStage[];
  const phone = lead.phone || live.find((p) => p.kind === "mobile" || p.kind === "landline")?.value || null;

  return (
    <>
      <section className={`m6-next${move.alarm ? " alarm" : ""}`}>
        <div className="m6-next-copy">
          <span className="m6-next-kicker">Next move</span>
          <p>{move.headline}</p>
        </div>
        <div className="m6-next-act">
          <FileActions
            file={{ id: lead.id, name, phone, optedOut: !!status?.opted_out }}
            primary={move.action === "none" ? undefined : move.action}
          />
        </div>
      </section>

      <section className="m6-rail-card">
        <ol className="m6-stage-rail" aria-label="Cadence stage">
          {stages.map((s) => {
            const current = resolved.stage === s;
            const past = Number(s) < Number(resolved.stage);
            return (
              <li key={s} className={`m6-stage${current ? " on" : ""}${past ? " done" : ""}`}>
                <span className="m6-stage-num">{past ? "✓" : s}</span>
                <span className="m6-stage-name">{STAGE_LABELS[s]}</span>
              </li>
            );
          })}
        </ol>

        {resolved.stage === "06" && (
          <ol className="m6-ladder-rail" aria-label="Missed-contact ladder">
            {LADDER_STEPS.map((step) => {
              const current = (resolved.ladderStep ?? 1) === step.step;
              const past = (resolved.ladderStep ?? 1) > step.step;
              return (
                <li key={step.step} className={`m6-lad${current ? " on" : ""}${past ? " done" : ""}`}>
                  <span>{past ? "✓" : step.step}</span>
                  <em>{step.label}</em>
                </li>
              );
            })}
          </ol>
        )}

        <div className="m6-facts">
          <div className="m6-facts-col lack">
            <h3>Lacking</h3>
            {lacking.length === 0 ? (
              <p className="m6-empty">Nothing missing on the web.</p>
            ) : (
              <ul>
                {lacking.map((f) => (
                  <li key={f.id}>{f.id === "interview" ? "No interview"
                    : f.id === "two_way" ? "No two-way ever"
                    : f.id === "second_number" ? "No second number"
                    : f.id === "stable_person" ? "No stable person"
                    : f.id === "lor" ? "No LOR sent"
                    : "Comms monitored (no voicemail)"}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="m6-facts-col done">
            <h3>Done</h3>
            {done.length === 0 ? (
              <p className="m6-empty">Nothing is locked in yet.</p>
            ) : (
              <ul>
                {done.map((f) => <li key={f.id}>{f.label}</li>)}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="m6-card m6-convo">
        <h2>Conversation</h2>
        <p className="m6-hint">We said / they said. Both desks see this.</p>
        {comms.length === 0 ? (
          <p className="m6-empty">Nothing logged. The last touch starts here.</p>
        ) : (
          <ul className="m6-comms m6-comms-live">
            {comms.slice(0, 20).map((c) => {
              const dir = commDirection(c.direction);
              return (
                <li key={c.id} className={`${dir.side}${c.outcome === "two_way" ? " hit" : ""}`}>
                  <span className="m6-comm-when">{formatLocalDateTime(c.occurred_at)}</span>
                  <span className="m6-comm-what">
                    {dir.who}
                    {" · "}
                    {channelWord(c.channel)}
                    {c.outcome && ` · ${OUTCOMES.find((o) => o.value === c.outcome)?.label ?? c.outcome}`}
                    {c.agent_name && ` · ${c.agent_name}`}
                  </span>
                  {c.body && <span className="m6-comm-body">{c.body}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
