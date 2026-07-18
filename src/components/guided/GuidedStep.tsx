"use client";
import { useState, useEffect } from "react";

// ============================================================================
// One question, one screen. This is the shared intake surface: the console runs
// it, and the lead intake moves onto it next. It deliberately shows exactly one
// step at a time with no jump-around navigation, because the compliance rule is
// "ask every question in order and verbatim" and a sidebar full of sections is
// an invitation to do the opposite.
// ============================================================================

export interface GuidedOption { value: string; label: string }
export interface GuidedStepDef {
  key: string;
  kind: "single" | "multi" | "text" | "longtext" | "bool" | "int" | "date" | "monthyear" | "phone" | "email" | "script" | "section";
  script?: string;          // spoken verbatim
  label?: string;           // shown when there is no spoken line
  note?: string;            // agent-only, never read aloud
  options?: GuidedOption[];
  placeholder?: string;
  vital?: boolean;
}

export function Spoken({ children, small }: any) {
  return <div className={`ic-spoken ${small ? "sm" : ""}`}><span className="ic-spoken-tag">Read verbatim</span><p>{children}</p></div>;
}
export function Note({ children, tone }: any) {
  return <div className={`ic-note ${tone ?? ""}`}><span className="ic-note-tag">Agent{tone === "hard" ? " · required" : ""}</span><p>{children}</p></div>;
}
export function Primary({ children, ...rest }: any) { return <button className="ic-btn solid wide" {...rest}>{children}</button>; }

export default function GuidedStep({
  step, value, onAnswer, index, total, remaining, extra,
}: {
  step: GuidedStepDef;
  value: any;
  onAnswer: (v: any) => void;
  index: number;
  total?: number;
  remaining?: number;
  extra?: React.ReactNode;      // per-question inserts (a tell, a warning)
}) {
  const [draft, setDraft] = useState<any>(value ?? (step.kind === "multi" ? [] : ""));
  useEffect(() => { setDraft(value ?? (step.kind === "multi" ? [] : "")); }, [step.key, value, step.kind]);

  const isText = ["text", "longtext", "int", "date", "monthyear", "phone", "email"].includes(step.kind);
  const inputType = step.kind === "int" ? "number" : step.kind === "date" ? "date" : step.kind === "email" ? "email" : "text";

  return (
    <div className="ic-card-wrap">
      <div className="ic-progress">
        Question {index + 1}{total ? ` of ${total}` : ""}
        {typeof remaining === "number" && remaining > 0 && <span className="ic-remaining">{remaining} left</span>}
        {step.vital && <span className="ic-vital">Vital</span>}
      </div>

      {step.script ? <Spoken>{step.script}</Spoken> : <h2 className="ic-q">{step.label}</h2>}
      {step.note && <Note>{step.note}</Note>}
      {extra}

      {(step.kind === "single" || step.kind === "bool") && (
        <div className="ic-opts">
          {(step.kind === "bool"
            ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]
            : step.options ?? []
          ).map((o) => (
            <button key={o.value} className={`ic-opt ${value === o.value ? "on" : ""}`} onClick={() => onAnswer(o.value)}>{o.label}</button>
          ))}
        </div>
      )}

      {step.kind === "multi" && (
        <>
          <div className="ic-opts multi">
            {(step.options ?? []).map((o) => {
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
          <Primary disabled={!Array.isArray(draft) || draft.length === 0} onClick={() => onAnswer(draft)}>Continue</Primary>
        </>
      )}

      {isText && (
        <>
          {step.kind === "longtext"
            ? <textarea className="ic-input area" autoFocus rows={4} value={draft} placeholder={step.placeholder} onChange={(e) => setDraft(e.target.value)} />
            : <input className="ic-input" autoFocus type={inputType} value={draft} placeholder={step.placeholder} onChange={(e) => setDraft(e.target.value)} />}
          <Primary disabled={!String(draft).trim()} onClick={() => onAnswer(draft)}>Continue</Primary>
        </>
      )}

      {step.kind === "script" && <Primary onClick={() => onAnswer(true)}>Read it, continue</Primary>}
    </div>
  );
}
