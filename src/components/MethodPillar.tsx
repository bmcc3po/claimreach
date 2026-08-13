"use client";
import { useState, useEffect } from "react";
import { METHOD, FAULT_CODES } from "@/lib/method";
import { REFRAMES } from "@/lib/reframes";
import { itemsForCampaign, responseDrillModuleId, type ResponseItem, type DrillTurn } from "@/lib/response-drill";
import { CAMPAIGNS } from "@/lib/campaigns";

type Tab = "doctrine" | "reframes" | "drill" | "codes";

export default function MethodPillar() {
  const [tab, setTab] = useState<Tab>("doctrine");
  return (
    <div>
      <div className="seg-toggle" style={{ margin: "12px 0" }}>
        <button className={tab === "doctrine" ? "active" : ""} onClick={() => setTab("doctrine")}>The Method</button>
        <button className={tab === "reframes" ? "active" : ""} onClick={() => setTab("reframes")}>Reframe bank</button>
        <button className={tab === "drill" ? "active" : ""} onClick={() => setTab("drill")}>Response drill</button>
        <button className={tab === "codes" ? "active" : ""} onClick={() => setTab("codes")}>Fault codes</button>
      </div>
      {tab === "doctrine" && <Doctrine />}
      {tab === "reframes" && <ReframeBank />}
      {tab === "drill" && <ResponseDrill />}
      {tab === "codes" && <Codes />}
    </div>
  );
}

/* ------------------------------------------------------------- The doctrine */

function Doctrine() {
  return (
    <div>
      <div className="escalate-line" style={{ marginBottom: 14 }}>
        Least harm is the goal. Get what the file needs, take nothing extra, and leave her in one piece. This applies to every campaign, every call, every time.
      </div>
      {METHOD.map((s) => (
        <div key={s.id} className="card" style={{ padding: 20, marginBottom: 12 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <span className="academy-num">{s.num}</span>
            <h3 style={{ margin: 0 }}>{s.title}</h3>
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, marginTop: 8, marginBottom: 10 }}>{s.lead}</p>
          {s.body.map((b, i) => <p key={i} style={{ fontSize: 14, lineHeight: 1.6 }}>{b}</p>)}
          {s.rules && (<><div className="section-title">Rules</div><ul className="bible-list">{s.rules.map((r, i) => <li key={i}>{r}</li>)}</ul></>)}
          {s.say && (<><div className="section-title" style={{ color: "var(--ok)" }}>Say</div><ul className="bible-list">{s.say.map((r, i) => <li key={i}>{r}</li>)}</ul></>)}
          {s.never && (<><div className="section-title" style={{ color: "var(--danger)" }}>Never</div><ul className="bible-list">{s.never.map((r, i) => <li key={i}>{r}</li>)}</ul></>)}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Reframe bank */

function ReframeBank() {
  const [used, setUsed] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(REFRAMES[0]?.id ?? null);

  function toggleUsed(key: string) {
    setUsed((u) => ({ ...u, [key]: !u[key] }));
  }

  function download() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = REFRAMES.map((g) => `
      <section>
        <h2>${g.label}</h2>
        <p class="trig">${g.triggers.join("  &middot;  ")}</p>
        ${g.note ? `<p class="note">${g.note}</p>` : ""}
        <ul>${g.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
      </section>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Reframe Bank</title>
    <style>
      @page { margin: 0.6in; }
      body { font: 11pt/1.45 Georgia, serif; color: #111; max-width: 7in; }
      h1 { font-size: 20pt; margin: 0 0 2px; }
      .sub { font-size: 9.5pt; color: #555; margin: 0 0 4px; }
      .rules { font-size: 9.5pt; background: #f4f4f2; padding: 8px 12px; border-left: 3px solid #999; margin: 12px 0 18px; }
      .rules b { display: block; margin-bottom: 3px; }
      section { break-inside: avoid; margin-bottom: 16px; }
      h2 { font-size: 12pt; margin: 0 0 3px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
      .trig { font-size: 9pt; color: #666; font-style: italic; margin: 0 0 4px; }
      .note { font-size: 9pt; color: #900; margin: 0 0 4px; }
      ul { margin: 4px 0 0 18px; padding: 0; }
      li { margin-bottom: 3px; }
    </style></head><body>
      <h1>Reframe Bank</h1>
      <p class="sub">The middle R. Recognize (one breath) &rarr; Reframe (below) &rarr; Reask (a question off the form).</p>
      <div class="rules">
        <b>Hard rules</b>
        Never promise: no money, timeline, arrest, or outcome. Never characterize her or the telling. Never put yourself in the frame. Vary them &mdash; the same reframe twice in one call sounds scripted. The reask is always a form question, never a permission check.
      </div>
      ${rows}
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <p className="muted" style={{ marginTop: 0, flex: 1 }}>
          The middle R. Tap a line to mark it used on this call so you don't repeat yourself. Tap again to clear.
        </p>
        <button className="btn ghost sm" onClick={download}>Download PDF</button>
      </div>

      <div className="hardlines" style={{ marginBottom: 14 }}>
        <div className="section-title" style={{ color: "var(--danger)" }}>Hard rules</div>
        <ul className="bible-list">
          <li>Never promise. No money, timeline, arrest, or outcome.</li>
          <li>Never characterize her or the telling. Point at the work.</li>
          <li>Never put yourself in the frame. Mirror Rule.</li>
          <li>The reask is always a question off the form, never a permission check.</li>
        </ul>
      </div>

      {REFRAMES.map((g) => {
        const isOpen = open === g.id;
        return (
          <div key={g.id} className="card" style={{ padding: 0, marginBottom: 8, overflow: "hidden" }}>
            <button
              onClick={() => setOpen(isOpen ? null : g.id)}
              style={{ width: "100%", textAlign: "left", padding: "14px 18px", background: "none", border: "none", cursor: "pointer" }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong style={{ fontSize: 14.5 }}>{g.label}</strong>
                <span className="muted" style={{ fontSize: 18, lineHeight: 1 }}>{isOpen ? "−" : "+"}</span>
              </div>
              <span className="muted" style={{ fontSize: 12.5, fontStyle: "italic" }}>{g.triggers.join("  ·  ")}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 18px 16px" }}>
                {g.note && <p style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 0 }}>{g.note}</p>}
                {g.lines.map((l, i) => {
                  const key = `${g.id}-${i}`;
                  const isUsed = !!used[key];
                  return (
                    <button
                      key={key}
                      onClick={() => toggleUsed(key)}
                      className="quiz-opt"
                      style={{ opacity: isUsed ? 0.4 : 1, textDecoration: isUsed ? "line-through" : "none" }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- Response drill */

const PASS = 90;

function ResponseDrill() {
  const [campaign, setCampaign] = useState(CAMPAIGNS[0]?.id ?? "ca-womens-prison");
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"turn" | "press">("turn");
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [asked, setAsked] = useState(0);
  const [done, setDone] = useState(false);

  const items = itemsForCampaign(campaign);
  const item: ResponseItem | undefined = items[i];
  const turn: DrillTurn | undefined = item ? (phase === "press" ? item.press : item.turn) : undefined;

  useEffect(() => { reset(); /* eslint-disable-next-line */ }, [campaign]);

  function reset() {
    setI(0); setPhase("turn"); setPicked(null); setRight(0); setAsked(0); setDone(false);
  }

  async function save(score: number, total: number) {
    try {
      await fetch("/api/training", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_id: responseDrillModuleId(campaign), status: "completed", quiz_score: score, quiz_total: total }),
      });
    } catch (e) { console.error("response drill save failed", e); }
  }

  function choose(idx: number) {
    if (picked !== null || !turn) return;
    setPicked(idx);
    setAsked((a) => a + 1);
    if (idx === turn.answer) setRight((r) => r + 1);
  }

  function next() {
    if (!item) return;
    if (phase === "turn" && item.press) { setPhase("press"); setPicked(null); return; }
    if (i + 1 >= items.length) {
      const score = Math.round((right / asked) * 100);
      setDone(true);
      if (score >= PASS) save(score, asked);
      return;
    }
    setI(i + 1); setPhase("turn"); setPicked(null);
  }

  if (done) {
    const score = Math.round((right / asked) * 100);
    const passed = score >= PASS;
    return (
      <div className="card" style={{ padding: 20 }}>
        <strong style={{ fontSize: 18 }}>{passed ? "✓ Passed" : "Not there yet"} — {score}%</strong>
        <p className="muted" style={{ fontSize: 13.5 }}>
          {right} of {asked} responses called correctly.{" "}
          {passed ? "Run it again any time you feel rusty." : `You need ${PASS}%. Re-read The Method, then run it again.`}
        </p>
        <button className="btn" onClick={reset}>Run it again</button>
      </div>
    );
  }

  if (!item || !turn) return <p className="muted">No response items for this campaign yet.</p>;

  const correct = picked === turn.answer;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={{ maxWidth: 280 }}>
          {CAMPAIGNS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 13 }}>{i + 1} of {items.length} · {item.section}</span>
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Say your answer out loud before you pick it. If it sounds wrong in your mouth, it is wrong.
      </p>

      {item.setup && phase === "turn" && (
        <div className="card" style={{ padding: 12, marginBottom: 8}}>
          <span className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>{item.setup}</span>
        </div>
      )}
      {phase === "press" && (
        <div className="escalate-line" style={{ marginBottom: 8 }}>She pushes back.</div>
      )}

      <div className="card" style={{ padding: 20, marginBottom: 12, borderLeft: "4px solid var(--accent)" }}>
        <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>She says</span>
        <p style={{ fontSize: 16.5, lineHeight: 1.55, margin: "6px 0 0" }}>{turn.says}</p>
      </div>

      <div>
        {turn.options.map((o, oi) => {
          const isAnswer = picked !== null && oi === turn.answer;
          const isWrongPick = picked === oi && oi !== turn.answer;
          return (
            <button key={oi}
              className={`quiz-opt ${picked === oi ? "chosen" : ""} ${isAnswer ? "right" : ""} ${isWrongPick ? "wrong" : ""}`}
              onClick={() => choose(oi)} disabled={picked !== null}>
              <span style={{ fontWeight: 700, marginRight: 8 }}>{"ABCD"[oi]}</span>{o}
              {picked !== null && turn.faults[oi] && <span className="badge count" style={{ marginLeft: 8 }}>{turn.faults[oi]}</span>}
              {isAnswer ? "  ✓" : isWrongPick ? "  ✗" : ""}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="card" style={{ padding: 16, marginTop: 12, borderLeft: `4px solid var(--${correct ? "ok" : "danger"})` }}>
          <strong style={{ color: `var(--${correct ? "ok" : "danger"})` }}>
            {correct ? "Correct" : `Wrong — the answer is ${"ABCD"[turn.answer]}`}
          </strong>
          <p style={{ fontSize: 13.5, margin: "6px 0 0" }}>{turn.why}</p>
          {item.note && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{item.note}</p>}
          <button className="btn" style={{ marginTop: 12 }} onClick={next}>
            {phase === "turn" && item.press ? "She pushes back →" : i + 1 >= items.length ? "See your score" : "Next →"}
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Fault codes */

function Codes() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Every wrong answer in the response drill is one of these. Learn the taxonomy and you stop memorizing lines.
      </p>
      {FAULT_CODES.map((f) => (
        <div key={f.code} className="card" style={{ padding: 14, marginBottom: 8 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="badge count">{f.code}</span>
            <strong style={{ fontSize: 14 }}>{f.label}</strong>
          </div>
          <p style={{ fontSize: 13.5, margin: "6px 0 0" }}>{f.detail}</p>
        </div>
      ))}
    </div>
  );
}
