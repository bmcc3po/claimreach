"use client";
import Link from "next/link";
import { daysAgo, formatLocalDateTime } from "@/lib/m6";
import type { M6FeedItem } from "@/lib/m6";

function channelLabel(channel: string): string {
  if (channel === "sms") return "text";
  if (channel === "voicemail") return "voicemail";
  if (channel === "email") return "email";
  if (channel === "letter") return "letter";
  return "call";
}

export function commDirection(direction: string): { who: string; side: "in" | "out" } {
  return direction === "inbound"
    ? { who: "they said", side: "in" }
    : { who: "we said", side: "out" };
}

export default function ConversationFeed({
  items,
  empty = "No messages on the board yet.",
}: {
  items: M6FeedItem[];
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="m6-empty">{empty}</p>;
  }
  return (
    <ul className="m6-feed">
      {items.map((c) => {
        const dir = commDirection(c.direction);
        return (
          <li key={c.id}>
            <Link href={`/m6/cases/${c.lead_id}`} className={`m6-feed-row ${dir.side}`}>
              <span className="m6-feed-who">
                <strong>{c.name}</strong>
                {" · "}
                {dir.who}
                {" · "}
                {channelLabel(c.channel)}
              </span>
              {c.snippet
                ? <span className="m6-feed-snip">{c.snippet}</span>
                : <span className="m6-feed-snip mute">No words on the log.</span>}
              <span className="m6-feed-when">{c.occurred_at ? daysAgo(c.occurred_at) : formatLocalDateTime(c.occurred_at)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
