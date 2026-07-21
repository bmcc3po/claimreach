"use client";
import { useState, useEffect } from "react";
import CityStateLookup from "@/components/CityStateLookup";
import IncidentLocation from "@/components/IncidentLocation";

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
  kind: "single" | "multi" | "text" | "longtext" | "bool" | "int" | "date" | "time" | "monthyear" | "phone" | "email" | "script" | "section";
  multiline?: boolean;
  script?: string;          // spoken verbatim
  label?: string;           // shown when there is no spoken line
  note?: string;            // agent-only, never read aloud
  options?: GuidedOption[];
  placeholder?: string;
  vital?: boolean;
  lookup?: "city" | "agency"; // "city" = Google city/state autocomplete; "agency" = incident-location + police-department picker
  incidentDate?: string;    // incident date (ISO), so the city lookup can show the SOL runway
  incidentCityState?: string; // city/state already captured, to bias the agency lookup
}

export function Spoken({ children, small }: any) {
  return <div className={`ic-spoken ${small ? "sm" : ""}`}><span className="ic-spoken-tag">Read verbatim</span><p>{children}</p></div>;
}
export function Note({ children, tone }: any) {
  return <div className={`ic-note ${tone ?? ""}`}><span className="ic-note-tag">Agent{tone === "hard" ? " · required" : ""}</span><p>{children}</p></div>;
}
export function Primary({ children, ...rest }: any) { return <button className="ic-btn solid wide" {...rest}>{children}</button>; }

// How long ago, in words, plus which criteria band it lands in.
function sinceLabel(v: string): { text: string; band: "le30" | "mid" | "old" } | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 0) return null;
  const months = Math.floor(days / 30.44);
  const text = days === 0 ? "today"
    : days === 1 ? "yesterday"
    : days < 45 ? `${days} days ago`
    : months < 24 ? `${months} months ago (${days} days)`
    : `${Math.floor(days / 365)} years ago`;
  const band: "le30" | "mid" | "old" = days <= 30 ? "le30" : days < 274 ? "mid" : "old";
  return { text, band };
}

const BAND_COPY = {
  le30: "Within 30 days. Signs with any listed injury if treated or willing.",
  mid:  "Over 30 days. Needs continuing treatment, serious injury with treatment finished, or over $10,000 in bills.",
  old:  "Nine months or older. Refer unless something elevates it.",
};

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

  const isText = ["text", "longtext", "int", "date", "time", "monthyear", "phone", "email"].includes(step.kind);
  // A narrative needs room and needs Enter to make a new line, not to advance.
  const isPara = step.multiline === true || step.kind === "longtext";
  const inputType = step.kind === "int" ? "number" : step.kind === "date" ? "date" : step.kind === "time" ? "time" : step.kind === "email" ? "email" : "text";

  return (
    <div className="ic-card-wrap">
      <div className="ic-progress">
        Question {index + 1}{total ? ` of ${total}` : ""}
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
          {step.lookup === "city"
            ? <CityStateLookup value={String(draft ?? "")} onChange={setDraft} incidentDate={step.incidentDate} />
            : step.lookup === "agency"
            ? <>
                <IncidentLocation
                  value={String(draft ?? "")}
                  near={step.incidentCityState}
                  onResolved={(r) => setDraft(r.agency || r.formatted || "")}
                />
                <input className="ic-input" style={{ marginTop: 10 }} placeholder="…or just type the department"
                  value={draft} onChange={(e) => setDraft(e.target.value)} />
              </>
            : isPara
            ? <textarea className="ic-input area" autoFocus rows={6} spellCheck value={draft} placeholder={step.placeholder} onChange={(e) => setDraft(e.target.value)} />
            : <input className="ic-input" autoFocus type={inputType} value={draft} placeholder={step.placeholder} onChange={(e) => setDraft(e.target.value)} />}
          {step.kind === "date" && (() => {
            const info = sinceLabel(String(draft));
            return info ? (
              <div className={`ic-since ${info.band}`}>
                <b>{info.text}</b>
                <span>{BAND_COPY[info.band]}</span>
              </div>
            ) : null;
          })()}
          <Primary disabled={!String(draft).trim()} onClick={() => onAnswer(draft)}>Continue</Primary>
        </>
      )}

      {step.kind === "script" && <Primary onClick={() => onAnswer(true)}>Read it, continue</Primary>}
    </div>
  );
}
