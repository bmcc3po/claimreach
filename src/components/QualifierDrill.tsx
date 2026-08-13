"use client";
import { useState, useMemo } from "react";
import type { Campaign, Scenario } from "@/lib/campaigns";

// The qualifier drill. Multiple choice proves they read the sheet. This proves
// they can call a verdict on a fact pattern the way they'd have to live.
// Ten scenarios pulled at random, immediate feedback, 90% to pass.

const ROUND = 10;
const PASS = 90;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QualifierDrill({ camp, onPass }: { camp: Campaign; onPass: (score: number, total: number) => void }) {
  const [seed, setSeed] = useState(0);
  const round = useMemo(() => shuffle(camp.scenarios).slice(0, Math.min(ROUND, camp.scenarios.length)), [camp.id, seed]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<"sign" | "dq" | "review" | null>(null);
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(false);

  const total = round.length;
  const s: Scenario | undefined = round[i];

  function choose(v: "sign" | "dq" | "review") {
    if (picked) return;
    setPicked(v);
    if (v === s!.verdict) setRight((r) => r + 1);
  }

  function next() {
    if (i + 1 >= total) {
      const score = Math.round((right / total) * 100);
      setDone(true);
      if (score >= PASS) onPass(score, total);
      return;
    }
    setI(i + 1);
    setPicked(null);
  }

  function restart() {
    setSeed((x) => x + 1);
    setI(0); setPicked(null); setRight(0); setDone(false);
  }

  if (done) {
    const score = Math.round((right / total) * 100);
    const passed = score >= PASS;
    return (
      <div className="card" style={{ padding: 20 }}>
        <strong style={{ fontSize: 18 }}>{passed ? "✓ Drill passed" : "Not there yet"} — {score}%</strong>
        <p className="muted" style={{ fontSize: 13.5 }}>
          {right} of {total} verdicts called correctly.{" "}
          {passed
            ? "You can call this campaign live. Run it again before every shift you're rusty."
            : `You need ${PASS}%. Go back to the criteria board, then run a fresh round — the scenarios reshuffle.`}
        </p>
        <button className="btn" onClick={restart}>Run another round</button>
      </div>
    );
  }

  if (!s) return <p className="muted">No scenarios loaded for this campaign yet.</p>;

  const correct = picked === s.verdict;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span className="muted" style={{ fontSize: 13 }}>Scenario {i + 1} of {total}</span>
        <span className="badge count">{right} correct</span>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: 0 }}>{s.text}</p>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {(["sign", "review", "dq"] as const).map((v) => {
          const isAnswer = picked && v === s.verdict;
          const isWrongPick = picked === v && v !== s.verdict;
          return (
            <button
              key={v}
              className={`quiz-opt ${picked === v ? "chosen" : ""} ${isAnswer ? "right" : ""} ${isWrongPick ? "wrong" : ""}`}
              style={{ flex: "1 1 180px" }}
              onClick={() => choose(v)}
              disabled={!!picked}
            >
              {camp.verdicts[v]}{isAnswer ? "  ✓" : isWrongPick ? "  ✗" : ""}
            </button>
          );
        })}
      </div>

      {picked && (
        <div className="card" style={{ padding: 16, marginTop: 12, borderLeft: `4px solid var(--${correct ? "ok" : "danger"})` }}>
          <strong style={{ color: `var(--${correct ? "ok" : "danger"})` }}>
            {correct ? "Correct" : `Wrong — the call is ${camp.verdicts[s.verdict]}`}
          </strong>
          <p style={{ fontSize: 13.5, margin: "6px 0 0" }}>{s.why}</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={next}>
            {i + 1 >= total ? "See your score" : "Next scenario →"}
          </button>
        </div>
      )}
    </div>
  );
}
