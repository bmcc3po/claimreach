"use client";
import { useMemo, useState } from "react";
import { fieldVisible, type Field } from "@/lib/questionnaire";

// ============================================================================
// GUIDED INTAKE
//
// The same surface the intake console uses, pointed at any composed form. One
// question per screen, in order, with no sidebar to jump around in — because the
// compliance rule is "ask every question in order and verbatim" and a section
// list is an invitation to do the opposite.
//
// The one exception is a capture block: fields that share a `group` render
// together (address, insurance, vehicle). Criteria questions are never grouped.
// ============================================================================

const SKIP: string[] = ["section"];

type Step = { kind: "single"; field: Field } | { kind: "group"; group: string; fields: Field[]; section: string };

function buildSteps(fields: Field[], answers: Record<string, any>): Step[] {
  const steps: Step[] = [];
  let section = "";
  const seenGroups = new Set<string>();
  for (const f of fields) {
    if (f.kind === "section") { section = f.label; continue; }
    if (SKIP.includes(f.kind)) continue;
    if (!fieldVisible(f as any, answers)) continue;
    if (f.group) {
      if (seenGroups.has(f.group)) continue;
      seenGroups.add(f.group);
      const members = fields.filter((x) => x.group === f.group && fieldVisible(x as any, answers));
      steps.push({ kind: "group", group: f.group, fields: members, section });
      continue;
    }
    steps.push({ kind: "single", field: f });
  }
  return steps;
}

function sectionOf(fields: Field[], target: Field): string {
  let s = "";
  for (const f of fields) { if (f.kind === "section") s = f.label; if (f.id === target.id) return s; }
  return s;
}

export default function GuidedIntake({
  fields, initialAnswers = {}, onSave, onExit, title,
}: {
  fields: Field[];
  initialAnswers?: Record<string, any>;
  onSave: (answers: Record<string, any>) => Promise<void> | void;
  onExit?: () => void;
  title?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Recomputed after every answer so conditional questions appear and disappear
  // as the file changes underneath the agent.
  const steps = useMemo(() => buildSteps(fields, answers), [fields, answers]);
  const step = steps[Math.min(idx, steps.length - 1)];
  const total = steps.length;

  function setVal(id: string, v: any) { setAnswers((a) => ({ ...a, [id]: v })); }

  async function advance() {
    if (idx + 1 >= total) {
      setSaving(true);
      try { await onSave(answers); setDone(true); } finally { setSaving(false); }
      return;
    }
    setIdx(idx + 1); setDraft(null);
  }

  if (done) {
    return (
      <div className="gi-root"><style>{CSS}</style>
        <div className="gi-card" style={{ textAlign: "center" }}>
          <h2 className="gi-q">Intake complete</h2>
          <p className="gi-muted">Every answer has been saved to the file.</p>
          {onExit && <button className="gi-btn solid wide" onClick={onExit}>Back to the file</button>}
        </div>
      </div>
    );
  }

  if (!step) {
    return <div className="gi-root"><style>{CSS}</style><div className="gi-card"><p className="gi-muted">No questions to ask on this form.</p></div></div>;
  }

  const secLabel = step.kind === "group" ? step.section : sectionOf(fields, step.field);

  return (
    <div className="gi-root">
      <style>{CSS}</style>

      <div className="gi-bar">
        <div className="gi-fill" style={{ width: `${((idx + 1) / total) * 100}%` }} />
      </div>
      <div className="gi-meta">
        <span>{secLabel}</span>
        <span>{idx + 1} of {total}</span>
      </div>

      <div className="gi-card">
        {step.kind === "single" ? (
          <FieldStep
            field={step.field}
            value={answers[step.field.id]}
            draft={draft}
            setDraft={setDraft}
            onAnswer={(v: any) => { setVal(step.field.id, v); setDraft(null); setTimeout(advance, 0); }}
          />
        ) : (
          <>
            <div className="gi-grouphead">{step.group.replace(/_/g, " ")}</div>
            <div className="gi-grid">
              {step.fields.map((f) => (
                <label key={f.id} className="gi-gf">
                  <span>{f.label}{f.vital && <em> vital</em>}</span>
                  <input value={answers[f.id] ?? ""} onChange={(e) => setVal(f.id, e.target.value)} />
                </label>
              ))}
            </div>
            <button className="gi-btn solid wide" onClick={advance}>Continue</button>
          </>
        )}
      </div>

      <div className="gi-foot">
        <button className="gi-btn ghost" disabled={idx === 0} onClick={() => { setIdx(Math.max(0, idx - 1)); setDraft(null); }}>← Back</button>
        <div className="gi-spacer" />
        <button className="gi-btn ghost" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(answers); } finally { setSaving(false); } }}>
          {saving ? "Saving…" : "Save and finish later"}
        </button>
      </div>
    </div>
  );
}

function FieldStep({ field, value, draft, setDraft, onAnswer }: any) {
  const f: Field = field;
  const isChoice = f.kind === "select" || f.kind === "bool";
  const opts = f.kind === "bool"
    ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]
    : (f.choices ?? (f.options ?? []).map((o: string) => ({ value: o, label: o })));

  const textish = ["text", "longtext", "int", "date", "phone", "email", "monthyear"].includes(f.kind);
  const cur = draft ?? value ?? (f.kind === "multiselect" ? [] : "");

  return (
    <>
      {f.script ? (
        <div className="gi-spoken"><span className="gi-tag">Read verbatim</span><p>{f.script}</p></div>
      ) : (
        <h2 className="gi-q">{f.label}{f.vital && <span className="gi-vital">Vital</span>}</h2>
      )}
      {f.script && <h2 className="gi-q sub">{f.label}</h2>}
      {f.agentNote && <div className="gi-note"><span className="gi-tag warn">Agent</span><p>{f.agentNote}</p></div>}

      {isChoice && (
        <div className="gi-opts">
          {opts.map((o: any) => (
            <button key={o.value} className={`gi-opt ${value === o.value ? "on" : ""}`} onClick={() => onAnswer(o.value)}>{o.label}</button>
          ))}
        </div>
      )}

      {f.kind === "multiselect" && (
        <>
          <div className="gi-opts">
            {opts.map((o: any) => {
              const sel: string[] = Array.isArray(cur) ? cur : [];
              const on = sel.includes(o.value);
              return (
                <button key={o.value} className={`gi-opt ${on ? "on" : ""}`}
                  onClick={() => setDraft(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])}>
                  <span className="gi-check">{on ? "✓" : ""}</span>{o.label}
                </button>
              );
            })}
          </div>
          <button className="gi-btn solid wide" disabled={!Array.isArray(cur) || cur.length === 0} onClick={() => onAnswer(cur)}>Continue</button>
        </>
      )}

      {textish && (
        <>
          {f.kind === "longtext"
            ? <textarea className="gi-input area" autoFocus rows={4} value={cur} onChange={(e) => setDraft(e.target.value)} />
            : <input className="gi-input" autoFocus type={f.kind === "date" ? "date" : f.kind === "int" ? "number" : "text"} value={cur} onChange={(e) => setDraft(e.target.value)} />}
          <button className="gi-btn solid wide" disabled={!String(cur).trim()} onClick={() => onAnswer(cur)}>Continue</button>
        </>
      )}

      {f.kind === "gate" && (
        <div className="gi-opts">
          <button className="gi-opt danger" onClick={() => onAnswer("yes")}>Yes</button>
          <button className="gi-opt" onClick={() => onAnswer("no")}>No</button>
        </div>
      )}
    </>
  );
}

const CSS = `
.gi-root { max-width:820px; margin:0 auto; padding:8px 0 40px; }
.gi-bar { height:3px; background:var(--line); border-radius:99px; overflow:hidden; }
.gi-fill { height:100%; background:#2563eb; transition:width .18s; }
.gi-meta { display:flex; justify-content:space-between; font-size:11px; font-weight:800; letter-spacing:.1em;
  text-transform:uppercase; color:var(--ink-faint); margin:10px 2px 14px; }
.gi-card { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:26px; }
.gi-q { font-size:22px; font-weight:750; margin:0 0 8px; letter-spacing:-.02em; line-height:1.35; }
.gi-q.sub { font-size:16px; font-weight:650; color:var(--ink-soft); margin-top:12px; }
.gi-vital { margin-left:8px; font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
  background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:3px 8px; border-radius:999px; vertical-align:middle; }
.gi-spoken { border-left:4px solid #2563eb; background:#eff5ff; border-radius:0 12px 12px 0; padding:16px 18px; margin-bottom:12px; }
.gi-spoken p { margin:6px 0 0; font-size:19px; line-height:1.5; font-weight:600; color:#0d1420; }
.gi-note { border-left:4px solid #d9982a; background:#fff8ec; border-radius:0 10px 10px 0; padding:11px 14px; margin:12px 0; }
.gi-note p { margin:4px 0 0; font-size:13.5px; line-height:1.5; color:var(--ink-soft); }
.gi-tag { font-size:10px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#1d4ed8; }
.gi-tag.warn { color:#a16207; }
.gi-opts { display:flex; flex-direction:column; gap:9px; margin-top:16px; }
.gi-opt { text-align:left; padding:15px 18px; font-size:16px; font-weight:600; border:1.5px solid var(--line);
  border-radius:12px; background:var(--surface); cursor:pointer; color:var(--ink); transition:all .08s; }
.gi-opt:hover { border-color:#2563eb; background:#f5f9ff; transform:translateX(2px); }
.gi-opt.on { border-color:#2563eb; background:#eff5ff; }
.gi-opt.danger:hover { border-color:#dc2626; background:#fef2f2; }
.gi-check { display:inline-block; width:20px; color:#2563eb; font-weight:800; }
.gi-input { width:100%; padding:14px 16px; font-size:17px; border:1.5px solid var(--line); border-radius:12px;
  background:var(--surface-2); font-family:inherit; color:var(--ink); margin-top:14px; }
.gi-input.area { font-size:15px; line-height:1.55; resize:vertical; }
.gi-grouphead { font-size:12px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-faint); margin-bottom:14px; }
.gi-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media (max-width:640px){ .gi-grid{ grid-template-columns:1fr; } }
.gi-gf { display:flex; flex-direction:column; gap:5px; font-size:12px; font-weight:650; color:var(--ink-soft); }
.gi-gf em { color:#b91c1c; font-style:normal; font-weight:800; text-transform:uppercase; font-size:9.5px; }
.gi-gf input { padding:11px 13px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2);
  font:inherit; font-size:15px; color:var(--ink); }
.gi-btn { padding:11px 18px; border-radius:10px; border:1px solid var(--line); background:var(--surface);
  font:inherit; font-weight:650; cursor:pointer; color:var(--ink); }
.gi-btn.ghost { background:transparent; }
.gi-btn.solid { background:#0d1420; color:#fff; border-color:#0d1420; }
.gi-btn.solid:disabled { opacity:.35; cursor:not-allowed; }
.gi-btn.wide { width:100%; margin-top:16px; padding:15px; font-size:16px; }
.gi-foot { display:flex; align-items:center; gap:10px; margin-top:14px; }
.gi-spacer { flex:1; }
.gi-muted { color:var(--ink-soft); }
`;
