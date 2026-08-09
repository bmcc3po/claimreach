"use client";

// In-house case timeline. Renders the file's chronological story from the audit
// log (status changes, calls, SMS, retainer, QA, contact edits). Read-only.
const ICONS: Record<string, string> = {
  status: "●", sms: "✉", call: "☎", retainer: "✓", contact: "✎", system: "⚙",
  access: "🔒", entered: "+", deleted: "✕", change: "•",
};

function toneFor(cat: string): string {
  if (cat === "status") return "info";
  if (cat === "sms" || cat === "call") return "good";
  if (cat === "deleted") return "bad";
  if (cat === "retainer") return "info";
  return "neut";
}

export default function CaseTimeline({ entries }: { entries: any[] }) {
  if (!entries || entries.length === 0) {
    return <p className="muted">No timeline events yet. As the file moves, calls, texts, status changes, and QA actions appear here.</p>;
  }
  // entries arrive newest-first; timeline reads top-down newest to oldest.
  return (
    <div className="timeline">
      {entries.map((e, i) => (
        <div key={e.id ?? i} className="tl-row">
          <div className={`tl-dot ${toneFor(e.category)}`}>{ICONS[e.category] ?? "•"}</div>
          <div className="tl-body">
            <div className="tl-line"><span className="tl-desc">{e.description}</span></div>
            <div className="tl-meta">{e.actor_name ?? "System"} · {new Date(e.created_at).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
