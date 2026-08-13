"use client";
import { useState, useEffect } from "react";
import { buildPath, stageStates, type PathStage } from "@/lib/path";
import { CAMPAIGNS } from "@/lib/campaigns";

// The one route from new hire to cleared. Stages unlock in order. An agent is
// not cleared for live calls until every stage is green — Records is the proof.

export default function LearningPath({ onGo }: { onGo: (chapter: any) => void }) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [campaign, setCampaign] = useState(CAMPAIGNS[0]?.id ?? "ca-womens-prison");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/training");
        const d = await r.json();
        const done = new Set<string>();
        for (const row of d.progress ?? []) if (row.status === "completed") done.add(row.module_id);
        setCompleted(done);
      } catch (e) {
        console.error("path progress load failed", e);
      }
      setLoading(false);
    })();
  }, []);

  const stages = buildPath(campaign);
  const states = stageStates(stages, completed);
  const doneCount = states.filter((s) => s === "done").length;
  const cleared = doneCount === stages.length;
  const pct = Math.round((doneCount / stages.length) * 100);
  const camp = CAMPAIGNS.find((c) => c.id === campaign);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Your path to live calls</h2>
      <p className="muted" style={{ marginTop: 4 }}>
        Eight stages, in order. Each one opens when the one before it is finished. Clear all eight and you're approved to take calls on this campaign. Everything else in Crissi is reference you pull up while a call is happening.
      </p>

      {CAMPAIGNS.length > 1 && (
        <div className="row" style={{ gap: 8, margin: "14px 0" }}>
          <span className="muted" style={{ fontSize: 13 }}>Training for</span>
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={{ maxWidth: 320 }}>
            {CAMPAIGNS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {loading && <p className="muted">Loading your progress…</p>}

      {!loading && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>
                {cleared ? `Cleared for ${camp?.name}` : `Stage ${doneCount + 1} of ${stages.length}`}
              </strong>
              <span className="badge gold">{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: cleared ? "var(--ok)" : "var(--accent)", transition: "width .3s" }} />
            </div>
          </div>

          {cleared && (
            <div className="card" style={{ padding: 18, marginBottom: 16, borderLeft: "4px solid var(--ok)" }}>
              <strong style={{ fontSize: 16, color: "var(--ok)" }}>✓ You're cleared for {camp?.name}</strong>
              <p style={{ fontSize: 13.5, margin: "6px 0 0" }}>
                Pull the reframe bank up before your first call, or download the PDF and keep it next to the headset. Re-run the drills any time you feel rusty — the scenarios reshuffle.
              </p>
            </div>
          )}

          {stages.map((s: PathStage, i) => {
            const st = states[i];
            const locked = st === "locked";
            return (
              <div key={s.id} className="card"
                style={{
                  padding: 18, marginBottom: 10, opacity: locked ? 0.45 : 1,
                  borderLeft: `4px solid var(--${st === "done" ? "ok" : st === "current" ? "accent" : "line"})`,
                }}>
                <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
                  <span className="academy-num" style={{ color: st === "done" ? "var(--ok)" : undefined }}>
                    {st === "done" ? "✓" : locked ? "🔒" : s.num}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 15 }}>{s.title}</strong>
                      {st === "done" && <span className="badge signed">Done</span>}
                      {st === "current" && <span className="badge stage">You're here</span>}
                      <span className="muted" style={{ fontSize: 12.5 }}>{s.estimate}</span>
                    </div>
                    <p style={{ fontSize: 13.5, margin: "5px 0 0" }}>{s.blurb}</p>
                    {!locked && (
                      <button className={st === "done" ? "btn ghost sm" : "btn sm"} style={{ marginTop: 10 }} onClick={() => onGo(s.chapter)}>
                        {st === "done" ? "Review" : "Start"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="card" style={{ padding: 16, marginTop: 18 }}>
            <div className="section-title" style={{ marginTop: 0 }}>Reference, not stages</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Not part of the path. These are what you open while a call is happening.
            </p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn ghost sm" onClick={() => onGo("method")}>Reframe bank</button>
              <button className="btn ghost sm" onClick={() => onGo("bible")}>The Bible</button>
              <button className="btn ghost sm" onClick={() => onGo("sop")}>Crisis SOP</button>
              <button className="btn ghost sm" onClick={() => onGo("liners")}>Silver Liners</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
