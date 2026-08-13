"use client";
import { useState, useEffect } from "react";
import { CAMPAIGNS, campaignById, campaignModuleId, drillModuleId, type Campaign } from "@/lib/campaigns";
import QualifierDrill from "./QualifierDrill";
import type { QuizQ } from "@/lib/course";
import { askAI } from "@/lib/ai";
import { DISCLAIMER_SHORT, CRISSI_GUARDRAIL_PROMPT } from "@/lib/crissi-disclaimers";

type Progress = Record<string, { status: string; quiz_score?: number; quiz_total?: number }>;
type Tab = "brief" | "criteria" | "technique" | "qualifier" | "cert" | "drill";

const PASS = 90; // campaign certification is stricter than the general course

export default function CampaignTraining() {
  const [progress, setProgress] = useState<Progress>({});
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("brief");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/training");
        const d = await r.json();
        const p: Progress = {};
        for (const row of d.progress ?? []) p[row.module_id] = { status: row.status, quiz_score: row.quiz_score, quiz_total: row.quiz_total };
        setProgress(p);
      } catch (e) {
        console.error("training progress load failed", e);
      }
    })();
  }, []);

  async function mark(moduleId: string, status: string, quiz_score?: number, quiz_total?: number) {
    setProgress((p) => ({ ...p, [moduleId]: { status, quiz_score, quiz_total } }));
    try {
      await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_id: moduleId, status, quiz_score, quiz_total }),
      });
    } catch (e) {
      console.error("training progress save failed", e);
    }
  }

  const camp = active ? campaignById(active) : null;

  if (camp) {
    const st = progress[campaignModuleId(camp.id)];
    return (
      <div>
        <button className="btn ghost sm" onClick={() => { setActive(null); setTab("brief"); }}>← All campaigns</button>
        <div className="row" style={{ marginTop: 10, gap: 10 }}>
          <h2 style={{ margin: 0 }}>{camp.name}</h2>
          {camp.status === "live" && <span className="badge signed">Live</span>}
          {st?.status === "completed" && <span className="badge gold">✓ Certified {st.quiz_score != null ? `${st.quiz_score}%` : ""}</span>}
        </div>
        <p className="muted" style={{ marginTop: 4 }}>{camp.client} · updated {camp.updated}</p>

        <div className="seg-toggle" style={{ margin: "12px 0" }}>
          <button className={tab === "brief" ? "active" : ""} onClick={() => setTab("brief")}>Briefing</button>
          <button className={tab === "criteria" ? "active" : ""} onClick={() => setTab("criteria")}>Criteria board</button>
          <button className={tab === "technique" ? "active" : ""} onClick={() => setTab("technique")}>Technique</button>
          <button className={tab === "qualifier" ? "active" : ""} onClick={() => setTab("qualifier")}>Qualifier drill</button>
          <button className={tab === "cert" ? "active" : ""} onClick={() => setTab("cert")}>Certification</button>
          <button className={tab === "drill" ? "active" : ""} onClick={() => setTab("drill")}>Role-play drill</button>
        </div>

        {tab === "brief" && <Briefing camp={camp} onNext={() => { if (st?.status !== "completed") mark(campaignModuleId(camp.id), "started"); setTab("criteria"); }} />}
        {tab === "criteria" && <CriteriaBoard camp={camp} onNext={() => setTab("technique")} />}
        {tab === "technique" && <Technique camp={camp} onNext={() => setTab("qualifier")} />}
        {tab === "qualifier" && (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Call the verdict on each fact pattern. Ten per round, pulled at random, {90}% to pass. This is the test that says whether you can run the campaign, not whether you read the sheet.
            </p>
            <QualifierDrill camp={camp} onPass={(sc, t) => mark(drillModuleId(camp.id), "completed", sc, t)} />
          </div>
        )}
        {tab === "cert" && <Certification camp={camp} onPass={(sc, t) => mark(campaignModuleId(camp.id), "completed", sc, t)} onDrill={() => setTab("drill")} />}
        {tab === "drill" && <Drill camp={camp} />}
      </div>
    );
  }

  const certified = CAMPAIGNS.filter((c) => progress[campaignModuleId(c.id)]?.status === "completed").length;

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>Campaign certification</h2>
        <span className="badge gold" style={{ marginLeft: 10 }}>{certified}/{CAMPAIGNS.length} certified</span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        Case-specific training. Read the briefing, learn the criteria board, then pass the certification at {PASS}% before you take a live call on that campaign.
      </p>
      <div className="disclaimer-bar" style={{ marginBottom: 16 }}>{DISCLAIMER_SHORT}</div>

      <div className="start-grid">
        {CAMPAIGNS.map((c) => {
          const s = progress[campaignModuleId(c.id)];
          const done = s?.status === "completed";
          return (
            <button key={c.id} className="start-card" onClick={() => { setActive(c.id); setTab("brief"); }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className={`badge ${c.status === "live" ? "signed" : "count"}`}>{c.status}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  {done ? <span className="badge gold">✓ Certified</span>
                    : s?.status === "started" ? <span className="badge stage">In progress</span>
                    : <span className="badge count">Not certified</span>}
                  {progress[drillModuleId(c.id)]?.status === "completed" && <span className="badge signed">✓ Drill</span>}
                </span>
              </div>
              <strong style={{ marginTop: 6 }}>{c.name}</strong>
              <span className="muted">{c.posture}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Briefing */

function Briefing({ camp, onNext }: { camp: Campaign; onNext: () => void }) {
  return (
    <div>
      <div className="escalate-line" style={{ marginBottom: 12 }}>{camp.headline}</div>

      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>What kind of call this is</h3>
        <p style={{ fontSize: 14.5 }}>{camp.posture}</p>
        <div className="section-title">Your job on this call</div>
        <ul className="bible-list">{camp.mission.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Call order</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Run it in this order. The order is the technique.</p>
        {camp.flow.map((f, i) => (
          <div key={i} className="crissi-step">
            <span className="crissi-step-num">{i + 1}</span>
            <div className="crissi-step-body">
              <strong style={{ fontSize: 13.5 }}>{f.step}</strong>
              <div style={{ fontSize: 13.5 }}>{f.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn" onClick={onNext}>Continue to the criteria board →</button>
    </div>
  );
}

/* ---------------------------------------------------------- Criteria board */

function CriteriaBoard({ camp, onNext }: { camp: Campaign; onNext: () => void }) {
  return (
    <div>
      <div className="card" style={{ padding: 18, marginBottom: 12, borderLeft: "4px solid var(--ok)" }}>
        <h3 style={{ marginTop: 0, color: "var(--ok)" }}>Sign</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>All of these have to be true.</p>
        <ul className="bible-list">{camp.sign.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 12, borderLeft: "4px solid var(--danger)" }}>
        <h3 style={{ marginTop: 0, color: "var(--danger)" }}>Disqualify</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Any one of these kills it. The caller never hears the list.</p>
        <ul className="bible-list">{camp.dq.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 12, borderLeft: "4px solid var(--accent)" }}>
        <h3 style={{ marginTop: 0, color: "var(--accent)" }}>Escalate, never decline</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>These go up. Sending one of these home is the most expensive mistake on the campaign.</p>
        <ul className="bible-list">{camp.review.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>

      <div className="hardlines">
        <div className="section-title" style={{ color: "var(--danger)" }}>Landmines</div>
        <ul className="bible-list">{camp.landmines.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>

      <button className="btn" style={{ marginTop: 12 }} onClick={onNext}>Continue to technique →</button>
    </div>
  );
}

/* --------------------------------------------------------------- Technique */

function Technique({ camp, onNext }: { camp: Campaign; onNext: () => void }) {
  return (
    <div>
      {camp.blocks.map((b, i) => (
        <div key={i} className="card" style={{ padding: 18, marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{b.heading}</h3>
          {b.body && <p style={{ fontSize: 14 }}>{b.body}</p>}
          {b.bullets && <ul className="bible-list">{b.bullets.map((x, j) => <li key={j}>{x}</li>)}</ul>}
          {b.say && (<><div className="section-title" style={{ color: "var(--ok)" }}>Say</div><ul className="bible-list">{b.say.map((x, j) => <li key={j}>{x}</li>)}</ul></>)}
          {b.avoid && (<><div className="section-title" style={{ color: "var(--danger)" }}>Avoid</div><ul className="bible-list">{b.avoid.map((x, j) => <li key={j}>{x}</li>)}</ul></>)}
        </div>
      ))}
      <button className="btn" onClick={onNext}>Continue to certification →</button>
    </div>
  );
}

/* ----------------------------------------------------------- Certification */

function Certification({ camp, onPass, onDrill }: { camp: Campaign; onPass: (s: number, t: number) => void; onDrill: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const quiz: QuizQ[] = camp.quiz;
  const total = quiz.length;
  const correct = quiz.filter((qq, i) => answers[i] === qq.answer).length;
  const score = Math.round((correct / total) * 100);
  const passed = score >= PASS;

  function submit() {
    setSubmitted(true);
    if (score >= PASS) onPass(score, total);
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>Campaign certification requires {PASS}%. You can retake it.</p>
      {quiz.map((qq, i) => (
        <div key={i} className="card" style={{ padding: 16, marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>{i + 1}. {qq.q}</strong>
          <div style={{ marginTop: 8 }}>
            {qq.options.map((o, oi) => {
              const chosen = answers[i] === oi;
              const right = submitted && oi === qq.answer;
              const wrong = submitted && chosen && oi !== qq.answer;
              return (
                <button key={oi} className={`quiz-opt ${chosen ? "chosen" : ""} ${right ? "right" : ""} ${wrong ? "wrong" : ""}`}
                  onClick={() => !submitted && setAnswers((a) => ({ ...a, [i]: oi }))} disabled={submitted}>
                  {o}{right ? "  ✓" : wrong ? "  ✗" : ""}
                </button>
              );
            })}
          </div>
          {submitted && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{qq.explain}</p>}
        </div>
      ))}
      {!submitted ? (
        <button className="btn" onClick={submit} disabled={Object.keys(answers).length < total}>Submit answers</button>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <strong style={{ fontSize: 16 }}>{passed ? "✓ Certified" : "Not certified"} — {score}%</strong>
          <p className="muted" style={{ fontSize: 13 }}>
            {passed ? `You're cleared to take live ${camp.name} calls. Run the drill before your first one.` : `You need ${PASS}% to certify. Go back through the criteria board and try again.`}
          </p>
          <div className="row" style={{ gap: 8 }}>
            {!passed && <button className="btn" onClick={() => { setSubmitted(false); setAnswers({}); }}>Retake</button>}
            <button className="btn ghost" onClick={onDrill}>Role-play drill →</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Drill */

function Drill({ camp }: { camp: Campaign }) {
  const [thread, setThread] = useState<{ role: "you" | "crissi"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const system = `${CRISSI_GUARDRAIL_PROMPT}

You are running a campaign role-play DRILL for a legal-intake agent training on the "${camp.name}" campaign. ${camp.drill.crissiRole}

Stay in character as the caller. When the agent does something notable, step out briefly in [coach: ...] with one piece of feedback, then resume in character. Never produce graphic detail — a trainee learns the technique, not the trauma. Keep the caller realistic: partial memory, some drift, some guardedness. ${DISCLAIMER_SHORT}`;

  async function send(first?: boolean) {
    const text = first ? "Begin the role-play. Set the scene in one line, then start as the caller." : input;
    if (!first && !text.trim()) return;
    if (!first) setThread((t) => [...t, { role: "you", text }]);
    setInput(""); setBusy(true); setStarted(true);
    const convo = thread.map((m) => `${m.role === "you" ? "Agent" : "Caller/Coach"}: ${m.text}`).join("\n");
    const out = await askAI(system, `${convo}\n${first ? "" : `Agent: ${text}`}`);
    setThread((t) => [...t, { role: "crissi", text: out || "[Crissi is offline — run the drill against the criteria board, or try again when the relay is up.]" }]);
    setBusy(false);
  }

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <strong>Role-play: {camp.name}</strong>
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>{camp.drill.setup}</p>
      </div>
      {!started && <button className="btn" onClick={() => send(true)} disabled={busy}>{busy ? "Starting…" : "Start the role-play"}</button>}
      {started && (
        <>
          <div className="msg-thread" style={{ maxHeight: 380 }}>
            {thread.map((m, i) => (
              <div key={i} className={`msg ${m.role === "you" ? "mine" : ""}`}>
                <div className="msg-bubble" style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
              </div>
            ))}
            {busy && <p className="muted">…</p>}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <input placeholder="Your line as the agent…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn" onClick={() => send()} disabled={busy}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}
