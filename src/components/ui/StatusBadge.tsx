"use client";
// The single source of truth for status color. Every status string in the app
// maps to ONE of five meanings, so color is always information, never decoration.
type Tone = "good" | "bad" | "warn" | "info" | "neut";

const MAP: Record<string, { tone: Tone; label: string }> = {
  signed: { tone: "good", label: "Signed" },
  signed_retained: { tone: "good", label: "Signed & retained" },
  qualified: { tone: "good", label: "Qualified" },
  approved: { tone: "good", label: "Approved" },
  paid: { tone: "good", label: "Paid" },
  dq: { tone: "bad", label: "Disqualified" },
  disqualified: { tone: "bad", label: "Disqualified" },
  dead: { tone: "bad", label: "Dead" },
  declined: { tone: "bad", label: "Declined" },
  rejected: { tone: "bad", label: "Rejected" },
  overdue: { tone: "bad", label: "Overdue" },
  flag: { tone: "warn", label: "Flagged" },
  wip: { tone: "warn", label: "Work in progress" },
  re_qa: { tone: "warn", label: "Re-QA" },
  pending_review: { tone: "warn", label: "Pending review" },
  limbo: { tone: "warn", label: "Limbo" },
  represented: { tone: "warn", label: "Already represented" },
  sent: { tone: "info", label: "Sent" },
  delivered: { tone: "info", label: "Delivered to firm" },
  ready_to_send: { tone: "info", label: "Ready to send" },
  viewed: { tone: "info", label: "Viewed" },
  new: { tone: "neut", label: "New" },
  pending: { tone: "neut", label: "Pending" },
  draft: { tone: "neut", label: "Draft" },
};

export function statusTone(status?: string): Tone {
  return MAP[(status || "").toLowerCase()]?.tone ?? "neut";
}

export default function StatusBadge({ status, label }: { status?: string; label?: string }) {
  const key = (status || "").toLowerCase();
  const m = MAP[key];
  const tone = m?.tone ?? "neut";
  const text = label || m?.label || status || "—";
  return <span className={`sb ${tone}`}>{text}</span>;
}
