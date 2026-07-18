"use client";
import { useMemo, useState } from "react";
import { FIRM_CONFIGS, getFirmConfig, DEFAULT_FIRM_SLUG } from "@/lib/intake-console/config";
import { CASE_TYPES, questionByKey, questionsFor, type Question } from "@/lib/intake-console/questions";
import {
  evaluate, nextQuestionKey, buildSummary,
  type Answers, type CaseTypeKey, type CallType, type Outcome,
} from "@/lib/intake-console/engine";
import {
  CALLER_DETAIL_SCRIPTS, NOT_TREATED_TELL, WRONGFUL_DEATH_SCRIPT, SIGN_SCRIPTS, POST_SIGN_FIELDS,
  REFER_SCRIPTS, DQ_CLOSES, SECONDARY_REVIEW_SCRIPTS, CALLBACK_SCRIPT, COMPLIANCE_RULES,
} from "@/lib/intake-console/scripts";

type Stage = "greeting" | "callerid" | "calltype" | "details" | "casetype" | "questions" | "outcome";

const CALL_TYPES: { value: CallType; label: string; sub: string; lead?: boolean }[] = [
  { value: "new_potential", label: "New Potential Client", sub: "Run the intake", lead: true },
  { value: "existing",      label: "Existing Client",      sub: "Route to their team" },
  { value: "non_client",    label: "Non-Client Matter",    sub: "Route to the firm" },
  { value: "not_legal",     label: "Not a Legal Matter",   sub: "Close politely" },
];

export default function IntakeConsole({ agentName }: { agentName: string }) {
  const [firmSlug, setFirmSlug] = useState(DEFAULT_FIRM_SLUG);
  const cfg = useMemo(() => getFirmConfig(firmSlug), [firmSlug]);

  const [stage, setStage] = useState<Stage>("greeting");
  const [callerId, setCallerId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [callback, setCallback] = useState("");
  const [callType, setCallType] = useState<CallType | null>(null);
  const [caseType, setCaseType] = useState<CaseTypeKey | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [history, setHistory] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [outcomeSource, setOutcomeSource] = useState<"questions" | "calltype">("questions");
  const [draft, setDraft] = useState<any>("");        // holds multi-select / text in progress
  const [postSign, setPostSign] = useState<Record<string, string>>({});
  const [ladderDone, setLadderDone] = useState<number[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const fill = (s: string) =>
    s.replace(/\[agent\]/g, agentName || "your name")
     .replace(/\[name\]/g, firstName || "there")
     .replace(/\[passenger\]/g, postSign.passenger || "your passenger")
     .replace(/\[X\]/g, cfg.referTurnaround || "___");

  // ------------------------------------------------------------ advancing
  function answerQuestion(key: string, value: any) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    setHistory((h) => [...h, key]);
    setDraft("");
    const ct = caseType!;
    const o = evaluate(ct, next, cfg);
    if (o) { setOutcome(o); setOutcomeSource("questions"); setStage("outcome"); return; }
    setCurrentQ(nextQuestionKey(ct, next));
  }

  function pickCaseType(t: CaseTypeKey) {
    setCaseType(t);
    setAnswers({});
    setHistory([]);
    setCurrentQ(nextQuestionKey(t, {}));
    setStage("questions");
  }

  function pickCallType(t: CallType) {
    setCallType(t);
    if (t === "new_potential") { setStage("details"); return; }
    const r = cfg.callTypeRouting[t];
    setOutcome({ disposition: r.disposition, reason: r.reason, flags: [], closeKey: t === "not_legal" ? "not_legal" : undefined });
    setOutcomeSource("calltype");
    setStage("outcome");
  }

  // Back is available on every screen, including the outcome. It never restarts.
  function back() {
    setErr("");
    if (stage === "outcome") {
      if (outcomeSource === "calltype") { setOutcome(null); setStage("calltype"); return; }
      const h = [...history];
      const last = h.pop();
      setHistory(h);
      if (last) {
        const a = { ...answers }; delete a[last];
        setAnswers(a);
        setCurrentQ(last);
        setOutcome(null);
        setStage("questions");
      } else { setOutcome(null); setStage("casetype"); }
      return;
    }
    if (stage === "questions") {
      const h = [...history];
      const last = h.pop();
      if (!last) { setStage("casetype"); setCurrentQ(null); return; }
      setHistory(h);
      const a = { ...answers }; delete a[last];
      setAnswers(a);
      setCurrentQ(last);
      setDraft("");
      return;
    }
    if (stage === "casetype") { setStage("details"); return; }
    if (stage === "details") { setStage("calltype"); return; }
    if (stage === "calltype") { setStage("callerid"); return; }
    if (stage === "callerid") { setStage("greeting"); return; }
  }

  async function save() {
    setSaving(true); setErr("");
    try {
      const summary = outcome && caseType ? buildSummary(caseType, answers, outcome, firstName) : "";
      const r = await fetch("/api/intake-calls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firm_slug: firmSlug, caller_id: callerId, first_name: firstName, callback,
          call_type: callType, matter: caseType, answers,
          disposition: outcome?.disposition, reason: outcome?.reason, close_key: outcome?.closeKey,
          flags: outcome?.flags ?? [], summary,
          post_sign: Object.keys(postSign).length ? postSign : null,
        }),
      });
      const text = await r.text();
      const d = text ? JSON.parse(text) : {};
      if (!r.ok) throw new Error(d.error || "save failed");
      setSavedId(d.id);
    } catch (e: any) { setErr(e?.message || "save failed"); }
    setSaving(false);
  }

  function reset() {
    setStage("greeting"); setCallerId(""); setFirstName(""); setCallback("");
    setCallType(null); setCaseType(null); setAnswers({}); setHistory([]); setCurrentQ(null);
    setOutcome(null); setDraft(""); setPostSign({}); setLadderDone([]); setSavedId(null); setErr("");
  }

  const q: Question | undefined = currentQ && caseType ? questionByKey(caseType, currentQ) : undefined;
  const total = caseType ? questionsFor(caseType).length : 0;

  return (
    <div className="ic-root">
      <style>{CSS}</style>

      <header className="ic-head">
        <div>
          <div className="ic-eyebrow">Intake console</div>
          <h1>{cfg.firmName}</h1>
        </div>
        <div className="ic-headright">
          {stage === "greeting" ? (
            <select className="ic-firm" value={firmSlug} onChange={(e) => setFirmSlug(e.target.value)}>
              {Object.values(FIRM_CONFIGS).map((f) => <option key={f.slug} value={f.slug}>{f.firmName}</option>)}
            </select>
          ) : <span className="ic-caller">{callerId}</span>}
          {stage !== "greeting" && <button className="ic-btn ghost" onClick={back}>← Back</button>}
        </div>
      </header>

      {/* ------------------------------------------------ GREETING */}
      {stage === "greeting" && (
        <Card>
          <Spoken>{fill(cfg.greeting)}</Spoken>
          <Note tone="hard">{cfg.recordingDisclosure}</Note>
          <Primary onClick={() => setStage("callerid")}>Disclosure read, continue</Primary>
        </Card>
      )}

      {/* ------------------------------------------------ CALLER ID GATE */}
      {stage === "callerid" && (
        <Card>
          <h2 className="ic-q">Paste the caller ID from JustCall</h2>
          <Note>This has to match the call recording. Nothing unlocks until it is filled.</Note>
          <input className="ic-input" autoFocus value={callerId} onChange={(e) => setCallerId(e.target.value)} placeholder="(702) 555-0134" />
          <Primary disabled={!callerId.trim()} onClick={() => setStage("calltype")}>Continue</Primary>
        </Card>
      )}

      {/* ------------------------------------------------ CALL TYPE */}
      {stage === "calltype" && (
        <Card>
          <h2 className="ic-q">What kind of call is this?</h2>
          <div className="ic-grid">
            {CALL_TYPES.map((c) => (
              <button key={c.value} className={`ic-card ${c.lead ? "lead" : ""}`} onClick={() => pickCallType(c.value)}>
                <span className="ic-card-t">{c.label}</span>
                <span className="ic-card-s">{c.sub}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ------------------------------------------------ CALLER DETAILS */}
      {stage === "details" && (
        <Card>
          <Spoken>{CALLER_DETAIL_SCRIPTS.nameAsk}</Spoken>
          <label className="ic-label">First name</label>
          <input className="ic-input" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name only" />
          {firstName && <Spoken small>{fill(CALLER_DETAIL_SCRIPTS.firstNamePermission)}</Spoken>}
          <label className="ic-label">Best callback number</label>
          <input className="ic-input" value={callback} onChange={(e) => setCallback(e.target.value)} placeholder="(702) 555-0134" />
          <Primary disabled={!firstName.trim()} onClick={() => setStage("casetype")}>Continue</Primary>
        </Card>
      )}

      {/* ------------------------------------------------ CASE TYPE */}
      {stage === "casetype" && (
        <Card>
          <h2 className="ic-q">What is this about?</h2>
          <div className="ic-grid">
            {CASE_TYPES.filter((c) => cfg.caseTypes.includes(c.key)).map((c) => (
              <button key={c.key} className={`ic-card ${c.key === "auto" ? "lead" : ""}`} onClick={() => pickCaseType(c.key)}>
                <span className="ic-card-t">{c.label}</span>
                <span className="ic-card-s">{c.sub}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ------------------------------------------------ QUESTIONS */}
      {stage === "questions" && q && (
        <Card>
          <div className="ic-progress">Question {history.length + 1}{total ? ` of up to ${total}` : ""}</div>
          <Spoken>{fill(q.script)}</Spoken>
          {q.note && <Note>{q.note}</Note>}
          {q.key === "willing" && <Note tone="tell"><strong>If they hesitate, read this:</strong> {NOT_TREATED_TELL}</Note>}

          {q.kind === "single" && (
            <div className="ic-opts">
              {q.options!.map((o) => (
                <button key={o.value} className="ic-opt" onClick={() => answerQuestion(q.key, o.value)}>{o.label}</button>
              ))}
            </div>
          )}

          {q.kind === "multi" && (
            <>
              <div className="ic-opts multi">
                {q.options!.map((o) => {
                  const sel: string[] = Array.isArray(draft) ? draft : [];
                  const on = sel.includes(o.value);
                  return (
                    <button key={o.value} className={`ic-opt ${on ? "on" : ""}`}
                      onClick={() => setDraft(on ? sel.filter((v) => v !== o.value) : [...sel, o.value])}>
                      <span className="ic-check">{on ? "✓" : ""}</span>{o.label}
                    </button>
                  );
                })}
              </div>
              <Primary disabled={!Array.isArray(draft) || draft.length === 0} onClick={() => answerQuestion(q.key, draft)}>Continue</Primary>
            </>
          )}

          {q.kind === "text" && (
            <>
              <textarea className="ic-input area" autoFocus value={typeof draft === "string" ? draft : ""} onChange={(e) => setDraft(e.target.value)} rows={4} />
              <Primary disabled={!String(draft).trim()} onClick={() => answerQuestion(q.key, draft)}>Continue</Primary>
            </>
          )}
        </Card>
      )}

      {/* ------------------------------------------------ OUTCOME */}
      {stage === "outcome" && outcome && (
        <OutcomeView
          outcome={outcome} cfg={cfg} fill={fill} firstName={firstName}
          postSign={postSign} setPostSign={setPostSign}
          ladderDone={ladderDone} setLadderDone={setLadderDone}
          onSave={save} saving={saving} savedId={savedId} err={err}
          onReset={reset} onBack={back} answers={answers}
        />
      )}

      <ComplianceRail />
    </div>
  );
}

// ---------------------------------------------------------------- outcome
function OutcomeView(p: any) {
  const { outcome, cfg, fill, postSign, setPostSign, ladderDone, setLadderDone, onSave, saving, savedId, err, onReset, onBack, answers } = p;
  const d: string = outcome.disposition;
  const tone = d === "SIGN" ? "sign" : d === "REFER" ? "refer" : d === "DISQUALIFY" ? "dq" : d === "SECONDARY_REVIEW" ? "sr" : "neutral";
  const sr = SECONDARY_REVIEW_SCRIPTS[(outcome.closeKey as keyof typeof SECONDARY_REVIEW_SCRIPTS)] ?? SECONDARY_REVIEW_SCRIPTS.default;

  return (
    <div className={`ic-outcome ${tone}`}>
      <div className="ic-out-head">
        <span className="ic-out-disp">{d.replace("_", " ")}</span>
        <span className="ic-out-reason">{outcome.reason}</span>
      </div>
      {outcome.flags?.length > 0 && (
        <div className="ic-flags">{outcome.flags.map((f: string) => <span key={f} className="ic-flag">{f}</span>)}</div>
      )}

      <div className="ic-out-body">
        {d === "SIGN" && (
          <>
            <Spoken>{fill(SIGN_SCRIPTS.nextStep)}</Spoken>
            <Note tone="hard">{SIGN_SCRIPTS.nextStepNote}</Note>
            <h3 className="ic-h3">Insurance buy-in — each line waits for a yes</h3>
            <Note>{SIGN_SCRIPTS.ladderNote}</Note>
            {SIGN_SCRIPTS.ladder.map((line, i) => {
              const unlocked = i === 0 || ladderDone.includes(i - 1);
              const done = ladderDone.includes(i);
              return (
                <div key={i} className={`ic-rung ${unlocked ? "" : "locked"} ${done ? "done" : ""}`}>
                  <button className="ic-rung-btn" disabled={!unlocked}
                    onClick={() => setLadderDone(done ? ladderDone.filter((x: number) => x !== i) : [...ladderDone, i])}>
                    {done ? "✓" : i + 1}
                  </button>
                  <p>{fill(line)}</p>
                </div>
              );
            })}
            <Spoken>{fill(SIGN_SCRIPTS.reassurance)}</Spoken>
            <Spoken>{fill(SIGN_SCRIPTS.beforeHangup)}</Spoken>
            <h3 className="ic-h3">After the signature is confirmed</h3>
            <Note tone="hard">Do not collect any of this until the retainer is signed.</Note>
            <div className="ic-postgrid">
              {POST_SIGN_FIELDS.map((f) => (
                <label key={f.key} className="ic-postfield">
                  <span>{f.label}{f.sensitive && <em> · sensitive</em>}</span>
                  <input value={postSign[f.key] ?? ""} onChange={(e) => setPostSign({ ...postSign, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
            {postSign.passenger && <Spoken>{fill(SIGN_SCRIPTS.passengerAsk)}</Spoken>}
          </>
        )}

        {d === "REFER" && (
          <>
            {!cfg.referTurnaround && (
              <Note tone="hard">TURNAROUND NOT SET. The firm has not given the number for "you will hear back within X." Do not invent one — ask your supervisor before you say it.</Note>
            )}
            <Spoken>{fill(REFER_SCRIPTS.main)}</Spoken>
            <Note>{REFER_SCRIPTS.ifAskedNote}</Note>
            <Spoken small>{REFER_SCRIPTS.ifAsked}</Spoken>
            <Spoken>{REFER_SCRIPTS.closing}</Spoken>
          </>
        )}

        {d === "DISQUALIFY" && (
          <>
            <Spoken>{fill(DQ_CLOSES[outcome.closeKey ?? ""]?.close ?? DQ_CLOSES.presence.close)}</Spoken>
            {DQ_CLOSES[outcome.closeKey ?? ""]?.note && <Note>{DQ_CLOSES[outcome.closeKey ?? ""]!.note}</Note>}
          </>
        )}

        {d === "SECONDARY_REVIEW" && (
          <>
            <Note tone="hard">{sr.banner}</Note>
            <Note>{sr.note}</Note>
            {answers?.authority === "deceased" && <Spoken>{WRONGFUL_DEATH_SCRIPT}</Spoken>}
          </>
        )}

        {d === "CALLBACK" && <Spoken>{CALLBACK_SCRIPT}</Spoken>}

        {d === "TRANSFER" && <Spoken>{fill(cfg.callTypeRouting[Object.keys(cfg.callTypeRouting).find((k) => cfg.callTypeRouting[k].reason === outcome.reason) ?? "existing"]?.script ?? "One moment.")}</Spoken>}
      </div>

      <div className="ic-out-foot">
        <button className="ic-btn ghost" onClick={onBack}>← Back</button>
        <div className="spacer" />
        {err && <span className="ic-err">{err}</span>}
        {savedId ? (
          <>
            <span className="ic-saved">✓ Saved</span>
            <button className="ic-btn" onClick={onReset}>Next call</button>
          </>
        ) : (
          <button className="ic-btn solid" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save intake"}</button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bits
function Card({ children }: any) { return <div className="ic-card-wrap">{children}</div>; }
function Spoken({ children, small }: any) {
  return <div className={`ic-spoken ${small ? "sm" : ""}`}><span className="ic-spoken-tag">Read verbatim</span><p>{children}</p></div>;
}
function Note({ children, tone }: any) {
  return <div className={`ic-note ${tone ?? ""}`}><span className="ic-note-tag">Agent{tone === "hard" ? " · required" : ""}</span><p>{children}</p></div>;
}
function Primary({ children, ...rest }: any) { return <button className="ic-btn solid wide" {...rest}>{children}</button>; }

function ComplianceRail() {
  const [open, setOpen] = useState(false);
  return (
    <div className="ic-comp">
      <button className="ic-comp-head" onClick={() => setOpen(!open)}>
        <span>Compliance</span><span>{open ? "Hide" : "Show"}</span>
      </button>
      {open && <ul>{COMPLIANCE_RULES.map((r) => <li key={r}>{r}</li>)}</ul>}
    </div>
  );
}

const CSS = `
.ic-root { max-width:900px; margin:0 auto; padding:22px 18px 90px; }
.ic-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; gap:14px; }
.ic-eyebrow { font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint); }
.ic-head h1 { font-size:24px; font-weight:800; margin:3px 0 0; letter-spacing:-.02em; }
.ic-headright { display:flex; align-items:center; gap:10px; }
.ic-firm { padding:8px 10px; border-radius:9px; border:1px solid var(--line); background:var(--surface); font:inherit; }
.ic-caller { font-variant-numeric:tabular-nums; font-weight:700; color:var(--ink-soft); font-size:14px; }

.ic-card-wrap { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:26px; }
.ic-progress { font-size:11.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-faint); margin-bottom:12px; }
.ic-q { font-size:22px; font-weight:750; margin:0 0 8px; letter-spacing:-.02em; }

.ic-spoken { border-left:4px solid var(--brand,#2563eb); background:#eff5ff; border-radius:0 12px 12px 0; padding:16px 18px; margin:14px 0; }
.ic-spoken.sm { opacity:.92; }
.ic-spoken-tag { font-size:10px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#1d4ed8; }
.ic-spoken p { margin:6px 0 0; font-size:19px; line-height:1.5; font-weight:600; color:#0d1420; }
.ic-spoken.sm p { font-size:16px; font-weight:500; }

.ic-note { border-left:4px solid #d9982a; background:#fff8ec; border-radius:0 10px 10px 0; padding:11px 14px; margin:12px 0; }
.ic-note.hard { border-left-color:#dc2626; background:#fef2f2; }
.ic-note.tell { border-left-color:#7c3aed; background:#f5f3ff; }
.ic-note-tag { font-size:9.5px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#a16207; }
.ic-note.hard .ic-note-tag { color:#b91c1c; }
.ic-note.tell .ic-note-tag { color:#6d28d9; }
.ic-note p { margin:4px 0 0; font-size:13.5px; line-height:1.5; color:var(--ink-soft); }

.ic-opts { display:flex; flex-direction:column; gap:9px; margin-top:18px; }
.ic-opt { text-align:left; padding:16px 18px; font-size:16.5px; font-weight:600; border:1.5px solid var(--line);
  border-radius:12px; background:var(--surface); cursor:pointer; transition:all .08s; color:var(--ink); }
.ic-opt:hover { border-color:var(--brand,#2563eb); background:#f5f9ff; transform:translateX(2px); }
.ic-opt.on { border-color:var(--brand,#2563eb); background:#eff5ff; }
.ic-check { display:inline-block; width:20px; color:var(--brand,#2563eb); font-weight:800; }

.ic-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px; }
@media (max-width:640px){ .ic-grid{ grid-template-columns:1fr; } }
.ic-card { display:flex; flex-direction:column; gap:4px; text-align:left; padding:20px; border:1.5px solid var(--line);
  border-radius:14px; background:var(--surface); cursor:pointer; transition:all .08s; }
.ic-card:hover { border-color:var(--brand,#2563eb); transform:translateY(-1px); }
.ic-card.lead { border-color:var(--brand,#2563eb); background:#eff5ff; }
.ic-card-t { font-size:16.5px; font-weight:700; color:var(--ink); }
.ic-card-s { font-size:12.5px; color:var(--ink-faint); }

.ic-input { width:100%; padding:14px 16px; font-size:17px; border:1.5px solid var(--line); border-radius:12px;
  background:var(--surface-2); font-family:inherit; color:var(--ink); margin:8px 0 4px; }
.ic-input.area { font-size:15px; line-height:1.55; resize:vertical; }
.ic-label { display:block; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); margin-top:14px; }

.ic-btn { padding:11px 18px; border-radius:10px; border:1px solid var(--line); background:var(--surface);
  font:inherit; font-weight:650; cursor:pointer; color:var(--ink); }
.ic-btn.ghost { background:transparent; }
.ic-btn.solid { background:#0d1420; color:#fff; border-color:#0d1420; }
.ic-btn.solid:disabled { opacity:.35; cursor:not-allowed; }
.ic-btn.wide { width:100%; margin-top:18px; padding:15px; font-size:16px; }

.ic-outcome { border-radius:18px; overflow:hidden; border:1px solid var(--line); background:var(--surface); }
.ic-out-head { padding:20px 24px; color:#fff; }
.ic-outcome.sign .ic-out-head { background:#15803d; }
.ic-outcome.refer .ic-out-head { background:#1d4ed8; }
.ic-outcome.dq .ic-out-head { background:#4b5563; }
.ic-outcome.sr .ic-out-head { background:#b91c1c; }
.ic-outcome.neutral .ic-out-head { background:#334155; }
.ic-out-disp { display:block; font-size:26px; font-weight:850; letter-spacing:-.02em; }
.ic-out-reason { display:block; font-size:14px; opacity:.9; margin-top:3px; }
.ic-flags { display:flex; gap:7px; flex-wrap:wrap; padding:12px 24px 0; }
.ic-flag { font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em;
  background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:4px 10px; border-radius:999px; }
.ic-out-body { padding:16px 24px 6px; }
.ic-h3 { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-faint); margin:22px 0 8px; }
.ic-rung { display:flex; gap:12px; align-items:flex-start; padding:11px 0; border-bottom:1px solid var(--line); }
.ic-rung.locked { opacity:.35; }
.ic-rung.done p { color:var(--ink-faint); }
.ic-rung p { margin:0; font-size:16px; line-height:1.5; font-weight:600; }
.ic-rung-btn { flex-shrink:0; width:30px; height:30px; border-radius:50%; border:1.5px solid var(--line);
  background:var(--surface); font-weight:800; cursor:pointer; color:var(--ink-soft); }
.ic-rung.done .ic-rung-btn { background:#15803d; color:#fff; border-color:#15803d; }
.ic-postgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
@media (max-width:640px){ .ic-postgrid{ grid-template-columns:1fr; } }
.ic-postfield { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:650; color:var(--ink-soft); }
.ic-postfield em { color:#b91c1c; font-style:normal; font-weight:700; }
.ic-postfield input { padding:9px 11px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); font:inherit; font-size:14px; color:var(--ink); }
.ic-out-foot { display:flex; align-items:center; gap:10px; padding:16px 24px; border-top:1px solid var(--line); background:var(--surface-2); }
.ic-out-foot .spacer { flex:1; }
.ic-saved { color:#15803d; font-weight:700; font-size:14px; }
.ic-err { color:#b91c1c; font-size:13px; font-weight:600; }

.ic-comp { margin-top:20px; border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; }
.ic-comp-head { width:100%; display:flex; justify-content:space-between; padding:11px 16px; background:transparent;
  border:0; font:inherit; font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); cursor:pointer; }
.ic-comp ul { margin:0; padding:0 20px 16px 34px; }
.ic-comp li { font-size:13px; color:var(--ink-soft); line-height:1.65; }
`;
