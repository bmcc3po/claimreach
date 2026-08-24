"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import FileActions from "./FileActions";
import ConversationFeed from "./ConversationFeed";
import type { Health, M6FeedItem } from "@/lib/m6";
import {
  QUEUE_PREVIEW,
  type CommandGaugeKey,
  type NextMove,
} from "@/lib/m6-cadence";

export type BoardRow = {
  lead_id: string;
  lead_no: string;
  claimant_name: string | null;
  phone: string | null;
  health: Health;
  opted_out?: boolean;
  days_overdue: number;
  live_contact_points: number;
  comms_monitored?: boolean;
  move: NextMove;
  gauges: CommandGaugeKey[];
};

const GAUGES: {
  key: CommandGaugeKey;
  label: string;
  tone: "red" | "amber" | "green";
  hint: string;
}[] = [
  { key: "gone_dark", label: "Gone dark", tone: "red", hint: "Never reached, late, or on the ladder." },
  { key: "replies", label: "Replies waiting", tone: "amber", hint: "They wrote. Answer them." },
  { key: "moving", label: "Moving", tone: "green", hint: "Two-way in the last 7 days." },
  { key: "ladder", label: "Ladder", tone: "red", hint: "Stage 06. A step is due." },
  { key: "lor_not_sent", label: "LOR not sent", tone: "amber", hint: "Letter of representation still sitting." },
];

export default function TodayBoard({
  rows,
  counts,
  neverReached,
  feed,
}: {
  rows: BoardRow[];
  counts: Record<CommandGaugeKey, number>;
  neverReached: number;
  feed: M6FeedItem[];
}) {
  const [filter, setFilter] = useState<CommandGaugeKey | null>(null);
  const [openStack, setOpenStack] = useState(false);

  const filtered = useMemo(() => {
    const list = filter ? rows.filter((r) => r.gauges.includes(filter)) : rows;
    return [...list].sort((a, b) => a.move.sort - b.move.sort || b.days_overdue - a.days_overdue);
  }, [rows, filter]);

  const visible = openStack ? filtered : filtered.slice(0, QUEUE_PREVIEW);
  const hidden = Math.max(0, filtered.length - visible.length);
  const goneDarkOn = (counts.gone_dark ?? 0) > 0;

  return (
    <div className="m6-command">
      {neverReached > 0 && (
        <div className="m6-shout-banner">
          <span className="m6-shout-num">{neverReached}</span>
          <p>
            {neverReached} files have never been reached. An uninterviewed file is the
            most fragile thing we hold.
          </p>
        </div>
      )}

      <div className="m6-gauges" role="tablist" aria-label="Today gauges">
        {GAUGES.map((g) => {
          const n = counts[g.key] ?? 0;
          const on = filter === g.key;
          const alarm = g.tone === "red" && n > 0;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={on}
              className={`m6-gauge ${g.tone}${alarm ? " alarm" : ""}${on ? " on" : ""}`}
              onClick={() => { setFilter(on ? null : g.key); setOpenStack(false); }}
            >
              <span className="m6-gauge-num">{n}</span>
              <span className="m6-gauge-label">{g.label}</span>
              <span className="m6-gauge-hint">{g.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="m6-board">
        <section className="m6-board-col">
          <div className="m6-board-head">
            <h2>{filter ? GAUGES.find((g) => g.key === filter)?.label : "Work queue"}</h2>
            <span className="m6-count">{filtered.length}</span>
          </div>
          <p className="m6-stack-note">
            The next move is the line. Do that. Do not hunt for a task.
          </p>
          {filtered.length === 0 ? (
            <p className="m6-empty">
              {filter === "moving" ? "Nobody has talked back in the last week." : "This stack is clear."}
            </p>
          ) : (
            <ul className="m6-rows">
              {visible.map((r) => (
                <li key={r.lead_id} className={`m6-row-wrap${r.move.alarm ? " alarm" : ""}`}>
                  <Link href={`/m6/cases/${r.lead_id}`} className="m6-row">
                    <span className={`m6-dot ${r.health}`} aria-hidden="true" />
                    <span className="m6-row-main">
                      <span className="m6-row-move">
                        <strong>{(r.claimant_name || "Unnamed file").toUpperCase()}</strong>
                        {" — "}
                        {r.move.line}
                      </span>
                      <span className="m6-row-sub">
                        {r.lead_no}
                        {r.live_contact_points === 0 && " · no way to reach them"}
                        {r.opted_out && " · opted out"}
                        {r.comms_monitored && " · safe-contact"}
                      </span>
                    </span>
                  </Link>
                  <FileActions
                    file={{
                      id: r.lead_id,
                      name: r.claimant_name || "Unnamed file",
                      phone: r.phone,
                      optedOut: !!r.opted_out,
                    }}
                    primary={r.move.action === "none" ? undefined : r.move.action}
                  />
                </li>
              ))}
            </ul>
          )}
          {hidden > 0 && (
            <button type="button" className="m6-stack-more" onClick={() => setOpenStack(true)}>
              {neverReached > 0 && (filter === "gone_dark" || !filter)
                ? `${neverReached} never reached — open the stack`
                : `Show ${hidden} more`}
            </button>
          )}
          {goneDarkOn && filter !== "gone_dark" && neverReached > QUEUE_PREVIEW && !openStack && (
            <button
              type="button"
              className="m6-stack-more shout"
              onClick={() => { setFilter("gone_dark"); setOpenStack(true); }}
            >
              {neverReached} never reached — open the stack
            </button>
          )}
        </section>

        <section className="m6-board-col m6-feed-col">
          <div className="m6-board-head">
            <h2>Recent conversation</h2>
            <span className="m6-count">{feed.length}</span>
          </div>
          <p className="m6-stack-note">What we said. What they said back.</p>
          <ConversationFeed items={feed} empty="The board is quiet. First touch starts the feed." />
        </section>
      </div>
    </div>
  );
}
