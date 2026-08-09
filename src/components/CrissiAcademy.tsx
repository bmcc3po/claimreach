"use client";
import { useState, useEffect } from "react";
import { COURSE, moduleById, type CourseModule, type QuizQ } from "@/lib/course";
import { BIBLE } from "@/lib/bible";
import { SILVER_LINERS } from "@/lib/silver-liners";
import { askAI } from "@/lib/ai";
import { DISCLAIMER_SHORT, CRISSI_GUARDRAIL_PROMPT } from "@/lib/crissi-disclaimers";

type Progress = Record<string, { status: string; quiz_score?: number; quiz_total?: number }>;

export default function CrissiAcademy() {
  const [progress, setProgress] = useState<Progress>({});
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<"lesson" | "quiz" | "drill">("lesson");

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/training"); const d = await r.json();
      const p: Progress = {}; for (const row of d.progress ?? []) p[row.module_id] = { status: row.status, quiz_score: row.quiz_score, quiz_total: row.quiz_total };
      setProgress(p);
    } catch {}
  })(); }, []);

  async function mark(moduleId: string, status: string, quiz_score?: number, quiz_total?: number) {
    setProgress((p) => ({ ...p, [moduleId]: { status, quiz_score, quiz_total } }));
    await fetch("/api/training", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module_id: moduleId, status, quiz_score, quiz_total }) }).catch(() => {});
  }

  const mod = active ? moduleById(active) : null;
  const completedCount = Object.values(progress).filter((p) => p.status === "completed").length;

  if (mod) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => { setActive(null); setTab("lesson"); }}>← All modules</button>
        <div className="row" style={{ marginTop: 10 }}>
          <h2 style={{ margin: 0 }}>Module {mod.order}: {mod.title}</h2>
          {progress[mod.id]?.status === "completed" && <span className="badge signed" style={{ marginLeft: 10 }}>✓ Completed</span>}
        </div>
        <p className="muted" style={{ marginTop: 4 }}>{mod.goal}</p>
        <div className="seg-toggle" style={{ margin: "10px 0" }}>
          <button className={tab === "lesson" ? "active" : ""} onClick={() => setTab("lesson")}>Lesson</button>
          <button className={tab === "quiz" ? "active" : ""} onClick={() => setTab("quiz")}>Knowledge check</button>
          <button className={tab === "drill" ? "active" : ""} onClick={() => setTab("drill")}>Role-play drill</button>
        </div>
        {tab === "lesson" && <Lesson mod={mod} onDone={() => { if (progress[mod.id]?.status !== "completed") mark(mod.id, "started"); setTab("quiz"); }} />}
        {tab === "quiz" && <Quiz mod={mod} onPass={(score, total) => mark(mod.id, "completed", score, total)} onDrill={() => setTab("drill")} />}
        {tab === "drill" && <Drill mod={mod} />}
      </div>
    );
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>Crissi Academy</h2>
        <span className="badge gold" style={{ marginLeft: 10 }}>{completedCount}/{COURSE.length} complete</span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>A guided, trauma-informed course. Work through the modules in order. Each has a lesson, a knowledge check, and a role-play drill with Crissi.</p>
      <div className="disclaimer-bar" style={{ marginBottom: 16 }}>{DISCLAIMER_SHORT}</div>

      <div className="academy-grid">
        {COURSE.map((m) => {
          const st = progress[m.id];
          const done = st?.status === "completed";
          return (
            <button key={m.id} className={`academy-card ${done ? "done" : ""}`} onClick={() => { setActive(m.id); setTab("lesson"); }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="academy-num">{m.order}</span>
                {done ? <span className="badge signed">✓ {st?.quiz_score != null ? `${st.quiz_score}%` : "Done"}</span> : st?.status === "started" ? <span className="badge stage">In progress</span> : <span className="badge count">Not started</span>}
              </div>
              <h3 style={{ margin: "8px 0 4px", fontSize: 15.5 }}>{m.title}</h3>
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{m.goal}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Lesson({ mod, onDone }: { mod: CourseModule; onDone: () => void }) {
  const entries = mod.bibleIds.map((id) => BIBLE.find((e) => e.id === id)).filter(Boolean) as any[];
  return (
    <div>
      {entries.map((e) => (
        <div key={e.id} className="card" style={{ padding: 18, marginBottom: 12 }}>
          {e.acute && <div className="acute-banner" style={{ marginBottom: 10 }}>🚨 Acute — break glass.</div>}
          <h3 style={{ marginTop: 0 }}>{e.title}</h3>
          <p style={{ fontSize: 14 }}>{e.summary}</p>
          {e.steps && e.steps.map((s: any, i: number) => <div key={i} className="bible-step"><strong>{s.label}</strong><span>{s.detail}</span></div>)}
          {e.say && (<><div className="section-title" style={{ color: "var(--ok)" }}>Say</div><ul className="bible-list">{e.say.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>)}
          {e.avoid && (<><div className="section-title" style={{ color: "var(--danger)" }}>Avoid</div><ul className="bible-list">{e.avoid.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>)}
          {e.why && (<><div className="section-title">Why</div><p style={{ fontSize: 13.5 }}>{e.why}</p></>)}
        </div>
      ))}
      {mod.linerGroup === "all" && (
        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Silver Liners to study</h3>
          {SILVER_LINERS.map((g) => (<div key={g.id} style={{ marginBottom: 8 }}><div className="section-title">{g.label}</div><div className="muted" style={{ fontSize: 12.5 }}>{g.liners.slice(0, 3).map((l) => `"${l.line}"`).join("  ·  ")}</div></div>))}
        </div>
      )}
      <button className="btn" onClick={onDone}>Continue to knowledge check →</button>
    </div>
  );
}

function Quiz({ mod, onPass, onDrill }: { mod: CourseModule; onPass: (s: number, t: number) => void; onDrill: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const total = mod.quiz.length;
  const correct = mod.quiz.filter((qq, i) => answers[i] === qq.answer).length;
  const score = Math.round((correct / total) * 100);
  const passed = score >= 80;

  function submit() {
    setSubmitted(true);
    if (score >= 80) onPass(score, total);
  }

  return (
    <div>
      {mod.quiz.map((qq, i) => (
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
          <strong style={{ fontSize: 16 }}>{passed ? "✓ Passed" : "Not quite"} — {score}%</strong>
          <p className="muted" style={{ fontSize: 13 }}>{passed ? "Module marked complete. Try the role-play drill to make it stick." : "You need 80% to pass. Review the lesson and try again."}</p>
          <div className="row" style={{ gap: 8 }}>
            {!passed && <button className="btn" onClick={() => { setSubmitted(false); setAnswers({}); }}>Retake</button>}
            <button className="btn ghost" onClick={onDrill}>Role-play drill →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Drill({ mod }: { mod: CourseModule }) {
  const [thread, setThread] = useState<{ role: "you" | "crissi"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const system = `${CRISSI_GUARDRAIL_PROMPT}\n\nYou are running a trauma-informed role-play DRILL for a legal-intake agent in training. ${mod.drill.crissiRole} Stay in character as the caller when role-playing, but when the agent does something notable, briefly step out in [coach: ...] to give one piece of feedback, then resume. Keep it realistic and supportive. Never produce graphic detail. ${DISCLAIMER_SHORT}`;

  async function send(first?: boolean) {
    const text = first ? "Begin the role-play. Set the scene in one line, then start as the caller." : input;
    if (!first && !text.trim()) return;
    if (!first) setThread((t) => [...t, { role: "you", text }]);
    setInput(""); setBusy(true); setStarted(true);
    const convo = thread.map((m) => `${m.role === "you" ? "Agent" : "Caller/Coach"}: ${m.text}`).join("\n");
    const out = await askAI(system, `${convo}\n${first ? "" : `Agent: ${text}`}`);
    setThread((t) => [...t, { role: "crissi", text: out || "[Crissi is offline — practice with the lesson's say/avoid lists, or try again when the relay is up.]" }]);
    setBusy(false);
  }

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <strong>Role-play: {mod.title}</strong>
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>{mod.drill.setup}</p>
      </div>
      {!started && <button className="btn" onClick={() => send(true)} disabled={busy}>{busy ? "Starting…" : "Start the role-play"}</button>}
      {started && (
        <>
          <div className="msg-thread" style={{ maxHeight: 380 }}>
            {thread.map((m, i) => (
              <div key={i} className={`msg ${m.role === "you" ? "mine" : ""}`}><div className="msg-bubble" style={{ whiteSpace: "pre-wrap" }}>{m.text}</div></div>
            ))}
            {busy && <p className="muted">…</p>}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <input placeholder="Your response as the agent…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn" onClick={() => send()} disabled={busy}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}
