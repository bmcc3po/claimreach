"use client";
import { useState } from "react";
import { knowledgeFor } from "@/lib/knowledge";

// Agent-assist reference, claim-type aware.
export default function KnowledgePanel({ claimType }: { claimType: string }) {
  const topics = knowledgeFor(claimType);
  const [open, setOpen] = useState<string | null>(null);
  const topic = topics.find((t) => t.id === open);

  return (
    <div className="side-card">
      <h3>Agent assist</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {topics.map((t) => (
          <button key={t.id}
            className={`chip ${open === t.id ? "active" : ""}`}
            onClick={() => setOpen(open === t.id ? null : t.id)}>
            <span style={{ marginRight: 5 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      {topic && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          {topic.body.map((b, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              {b.h && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{b.h}</div>}
              {b.p && <p className="muted" style={{ margin: "0 0 4px", fontSize: 13 }}>{b.p}</p>}
              {b.list && (
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
                  {b.list.map((li, j) => <li key={j} style={{ marginBottom: 3 }}>{li}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
