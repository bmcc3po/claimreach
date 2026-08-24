export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { filterM6StatusRows, lorShowsOnToday, type Health } from "@/lib/m6";
import { applyM6LeadFilters, getTmpFirmId, M6_STATUS_COLUMNS, requireM6Session } from "@/lib/m6-scope";
import { loadM6ConversationFeed } from "@/lib/m6-file";
import {
  commandGauges, isLorUnsent, moveInputFromToday, nextMove, todayBuckets,
  type CommandGaugeKey, type TodayFile,
} from "@/lib/m6-cadence";
import TodayBoard, { type BoardRow } from "@/components/m6/TodayBoard";

type StatusRow = TodayFile & {
  lead_no: string;
  claimant_name: string | null;
  health: Health;
  last_touch_at?: string | null;
  last_touch_channel?: string | null;
  ladder_step: number | null;
  live_contact_points: number;
  stable_people?: number;
  next_touch_due?: string | null;
  comms_monitored?: boolean;
  phone?: string | null;
};

export default async function TodayPage() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  const tmpFirmId = session.ok ? session.tmpFirmId : await getTmpFirmId(sb);

  const { data, error } = tmpFirmId
    ? await applyM6LeadFilters(
        sb.from("lead_contact_status").select(M6_STATUS_COLUMNS),
        tmpFirmId,
      ).order("days_overdue", { ascending: false }).limit(400)
    : { data: [] as StatusRow[], error: { message: "This app is not available." } };

  const rows = tmpFirmId
    ? filterM6StatusRows((data ?? []) as (StatusRow & {
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

  const { data: lorRows } = tmpFirmId
    ? await sb.from("lead_lor").select("lead_id, status, flagged_today").eq("firm_id", tmpFirmId)
    : { data: [] as { lead_id: string; status: string; flagged_today: boolean }[] };
  const lorOf = new Map((lorRows ?? []).map((r) => [r.lead_id, r]));
  const lorNotSentIds = new Set(
    rows.filter((r) => isLorUnsent(lorOf.get(r.lead_id)?.status ?? null)).map((r) => r.lead_id),
  );

  const withPhone = rows.map((r) => ({ ...r, phone: phoneOf.get(r.lead_id) ?? null }));
  const todayRows: TodayFile[] = withPhone.map((r) => ({
    ...r,
    next_channel_blocked: !!r.comms_monitored && (r.ladder_step === 1 || r.last_touch_channel === "voicemail"),
  }));
  const buckets = todayBuckets(todayRows);
  const gauges = commandGauges(todayRows, { lorNotSentIds });

  const membership = new Map<string, CommandGaugeKey[]>();
  (Object.keys(gauges) as CommandGaugeKey[]).forEach((key) => {
    for (const r of gauges[key]) {
      const list = membership.get(r.lead_id) ?? [];
      list.push(key);
      membership.set(r.lead_id, list);
    }
  });

  const boardRows: BoardRow[] = withPhone.map((r) => {
    const lor = lorOf.get(r.lead_id);
    const move = nextMove(moveInputFromToday({
      ...r,
      lorStatus: lor?.status ?? "not_sent",
      lorFactsReady: lorShowsOnToday(lor),
    }));
    return {
      lead_id: r.lead_id,
      lead_no: r.lead_no,
      claimant_name: r.claimant_name,
      phone: r.phone ?? null,
      health: r.health,
      opted_out: r.opted_out,
      days_overdue: r.days_overdue,
      live_contact_points: r.live_contact_points,
      comms_monitored: r.comms_monitored,
      move,
      gauges: membership.get(r.lead_id) ?? [],
    };
  }).sort((a, b) => a.move.sort - b.move.sort || b.days_overdue - a.days_overdue);

  const nameOf = new Map(rows.map((r) => [r.lead_id, r.claimant_name]));
  const feed = tmpFirmId
    ? await loadM6ConversationFeed(sb, tmpFirmId, ids, nameOf, 20)
    : [];

  const counts = {
    gone_dark: gauges.gone_dark.length,
    replies: gauges.replies.length,
    moving: gauges.moving.length,
    ladder: gauges.ladder.length,
    lor_not_sent: gauges.lor_not_sent.length,
  };

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Today</h1>
        <p className="m6-sub">What is moving. What is falling on its face. What has gone dark.</p>
      </div>

      {error && (
        <p className="m6-error">Could not load the queue: {error.message}</p>
      )}

      <TodayBoard
        rows={boardRows}
        counts={counts}
        neverReached={buckets.neverReached.length}
        feed={feed}
      />
    </div>
  );
}
