export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { HEALTH_LABEL, daysAgo, filterM6StatusRows, lorShowsOnToday, type Health } from "@/lib/m6";
import { applyM6LeadFilters, getTmpFirmId, M6_STATUS_COLUMNS, requireM6Session } from "@/lib/m6-scope";
import { todayBuckets, type TodayFile } from "@/lib/m6-cadence";
import FileActions from "@/components/m6/FileActions";

type Row = TodayFile & {
  lead_no: string; claimant_name: string | null;
  health: Health; last_touch_at?: string | null; last_touch_channel?: string | null;
  ladder_step: number | null; live_contact_points: number;
  next_touch_due?: string | null;
  comms_monitored?: boolean;
  phone?: string | null;
};

function lastTouchLabel(r: Row): string {
  if (r.last_touch_at) {
    const ch = r.last_touch_channel === "sms" ? "text" : r.last_touch_channel === "email" ? "email" : "call";
    return `last ${ch} ${daysAgo(r.last_touch_at)}`;
  }
  if (r.last_two_way_at) return `reached ${daysAgo(r.last_two_way_at)}`;
  return "never reached";
}

function Stack({ title, note, rows, empty, tone = "default" }: {
  title: string; note: string; rows: Row[]; empty: string;
  tone?: "default" | "shout" | "quiet";
}) {
  const shout = tone === "shout" && rows.length > 0;
  return (
    <section className={`m6-stack${shout ? " shout" : tone === "quiet" ? " quiet" : ""}`}>
      <div className="m6-stack-head">
        <h2>{title}</h2>
        <span className="m6-count">{rows.length}</span>
      </div>
      <p className="m6-stack-note">{note}</p>
      {rows.length === 0 ? (
        <p className="m6-empty">{empty}</p>
      ) : (
        <ul className="m6-rows">
          {rows.map((r) => (
            <li key={r.lead_id} className="m6-row-wrap">
              <Link href={`/m6/cases/${r.lead_id}`} className="m6-row">
                <span className={`m6-dot ${r.health}`} aria-hidden="true" />
                <span className="m6-row-main">
                  <span className="m6-row-name">{r.claimant_name || "Unnamed file"}</span>
                  <span className="m6-row-sub">
                    {lastTouchLabel(r)}
                    {" · "}
                    {r.lead_no}
                    {r.live_contact_points === 0 && " · no way to reach them"}
                    {r.opted_out && " · opted out"}
                    {r.comms_monitored && " · safe-contact"}
                  </span>
                </span>
                <span className="m6-row-tag">
                  {r.health === "paused" ? "Paused"
                    : shout && r.days_overdue > 0 ? `${r.days_overdue}d overdue`
                    : r.ladder_step ? `Step ${r.ladder_step}`
                    : HEALTH_LABEL[r.health]}
                </span>
              </Link>
              <FileActions
                file={{
                  id: r.lead_id,
                  name: r.claimant_name || "Unnamed file",
                  phone: r.phone,
                  optedOut: !!r.opted_out,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function TodayPage() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  const tmpFirmId = session.ok ? session.tmpFirmId : await getTmpFirmId(sb);

  const { data, error } = tmpFirmId
    ? await applyM6LeadFilters(
        sb.from("lead_contact_status").select(M6_STATUS_COLUMNS),
        tmpFirmId,
      ).order("days_overdue", { ascending: false }).limit(400)
    : { data: [] as Row[], error: { message: "This app is not available." } };

  const rows = tmpFirmId
    ? filterM6StatusRows((data ?? []) as (Row & {
        firm_id: string;
        campaign?: string | null;
        case_type?: string | null;
        archived_at?: string | null;
      })[], tmpFirmId)
    : [];

  const ids = rows.map((r) => r.lead_id);
  const { data: phones } = tmpFirmId && ids.length
    ? await sb.from("leads").select("id, phone").eq("firm_id", tmpFirmId).in("id", ids)
    : { data: [] as { id: string; phone: string | null }[] };
  const phoneOf = new Map((phones ?? []).map((p) => [p.id, p.phone ?? null]));
  const withPhone = rows.map((r) => ({ ...r, phone: phoneOf.get(r.lead_id) ?? null }));

  const buckets = todayBuckets(withPhone.map((r) => ({
    ...r,
    next_channel_blocked: !!r.comms_monitored && (r.ladder_step === 1 || r.last_touch_channel === "voicemail"),
  })));

  const { data: lorRows } = tmpFirmId
    ? await sb.from("lead_lor").select("lead_id, status, flagged_today").eq("firm_id", tmpFirmId)
    : { data: [] as { lead_id: string; status: string; flagged_today: boolean }[] };
  const lorTodayIds = new Set(
    (lorRows ?? []).filter((r) => lorShowsOnToday(r)).map((r) => r.lead_id),
  );
  const lorToday = withPhone.filter((r) => lorTodayIds.has(r.lead_id));

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Today</h1>
        <p className="m6-sub">
          Last touch first. Silence is what loses them, not slow news.
        </p>
      </div>

      {error && (
        <p className="m6-error">
          Could not load the queue: {error.message}
        </p>
      )}

      <div className="m6-stacks">
        <Stack
          title="Replies waiting"
          note="A reply with a callback time counts as contact and routes straight to the queue."
          rows={buckets.repliesWaiting as Row[]}
          empty="Nothing in the tray. When they write back, it lands here."
        />
        <Stack
          title="Heartbeat overdue"
          note="Every fourteen days for the first ninety, then every thirty. Any two-way contact resets the clock."
          rows={buckets.heartbeatOverdue as Row[]}
          empty="Every check-in is current. Come back tomorrow."
          tone="shout"
        />
        <Stack
          title="Never reached"
          note="An uninterviewed file is the most fragile thing we hold. There is no contact web on it yet."
          rows={buckets.neverReached as Row[]}
          empty="No file is still waiting on a first conversation."
          tone="shout"
        />
        <Stack
          title="Failed / quiet"
          note="Silence is what loses them, not slow news."
          rows={buckets.failedQuiet as Row[]}
          empty="Nothing bounced overnight. Nobody has gone silent."
          tone="shout"
        />
        <Stack
          title="Ladder paused"
          note="Incarceration, treatment, or a client request. The clock is held, not lost."
          rows={buckets.ladderPaused as Row[]}
          empty="No clocks on hold."
          tone="quiet"
        />
        <Stack
          title="Opted out"
          note="STOP or an opt-out on the number. Hard gate — do not send."
          rows={buckets.optedOut as Row[]}
          empty="No STOP on the board."
          tone="quiet"
        />
        <Stack
          title="Safe-contact conflicts"
          note="Monitored comms and the next move would violate the safe-channel rule."
          rows={buckets.safeContactConflicts as Row[]}
          empty="No monitored-comms conflicts."
        />
        <Stack
          title="LOR"
          note="Needs a letter of representation. Send certified mail from the row — one click after you read it."
          rows={lorToday}
          empty="No letters waiting."
        />
      </div>
    </div>
  );
}
