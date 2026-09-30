"use client";
// ============================================================================
// The DOB and SSN fields for finishing an agreement (Brett, Sep 27): never an
// open text box. The date types itself into MM/DD/YYYY. The SSN is either all
// 9 digits or, when the client will only give the last 4, a fixed XXX-XX-
// prefix with a 4-digit box — and each shows exactly what will print on the
// HIPAA pages. A campaign can require the full 9 (campaigns.ssn_require_full);
// the server enforces it too, so this is presentation, not the rule.
//
// The engine still holds plain strings (f.dob "MM/DD/YYYY", f.ssn digits), so
// nothing about validation or the send changes.
// ============================================================================
import React, { useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Digits typed anywhere become MM/DD/YYYY with the slashes placed for you. */
export function fmtDobDigits(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** A real calendar date, not in the future, born 1900+. Empty string = not yet. */
export function dobProblem(v: string): string {
  const m = String(v || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const [mo, dy, yr] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(yr, mo - 1, dy);
  if (yr < 1900 || dt.getFullYear() !== yr || dt.getMonth() !== mo - 1 || dt.getDate() !== dy) return "That is not a real date.";
  if (dt.getTime() > Date.now()) return "Date of birth cannot be in the future.";
  return "";
}

export function dobSpoken(v: string): string {
  const m = String(v || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m || dobProblem(v)) return "";
  return `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}, ${m[3]}`;
}

export function DobField({ value, onChange, cls = "cc" }: { value: string; onChange: (v: string) => void; cls?: "cc" | "ch" }) {
  const spoken = dobSpoken(value);
  const bad = dobProblem(value);
  const full = /^\d{2}\/\d{2}\/\d{4}$/.test(String(value || ""));
  return (<>
    <input
      className={cls === "ch" ? "ch-in" : "cc-field"}
      type="text" inputMode="numeric" autoComplete="off" placeholder="MM/DD/YYYY" maxLength={10}
      aria-label="Date of birth" value={value ?? ""}
      onChange={(e) => onChange(fmtDobDigits(e.target.value))}
    />
    {!!spoken && <div className={cls === "ch" ? "ch-note sd-good" : "cc-cue sd-good"}>Reads as {spoken}.</div>}
    {full && !!bad && <div className={cls === "ch" ? "ch-note ch-note-bad" : "cc-cue cc-red"}>{bad}</div>}
  </>);
}

/** "123456789" -> "123-45-6789" as you type. */
export function fmtSsnDigits(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "").slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export function SsnField({ value, onChange, requireFull, cls = "cc", storedMode, onMode, savedMode, saveStatus, saveError, onRetry }: {
  value: string; onChange: (v: string) => void;
  /** The campaign's firm requires all 9 digits: the last-4 choice is not offered. */
  requireFull?: boolean;
  cls?: "cc" | "ch";
  /** The persisted representation mode, when the file carries one. */
  storedMode?: "full" | "last4" | null;
  onMode?: (m: "full" | "last4") => void;
  savedMode?: "full" | "last4" | null;
  saveStatus?: string;
  saveError?: boolean;
  onRetry?: () => void;
}) {
  const digits = String(value || "").replace(/\D/g, "");
  const cannotDowngrade = savedMode === "full" || digits.length > 4;
  // Last-4 mode survives a remount: a stored 1-4 digit value IS a last-4 entry,
  // so it must not reappear as a half-typed full SSN (Astra review, Sep 27).
  // The stored mode wins when the file carries one; digit-count stays only
  // as the legacy fallback for files saved before the mode existed.
  const [last4Guess, setLast4Guess] = useState(() => digits.length > 0 && digits.length <= 4);
  const last4 = storedMode ? storedMode === "last4" : last4Guess;
  const setLast4 = (v: boolean) => { setLast4Guess(v); onMode?.(v ? "last4" : "full"); };
  const mode = requireFull || savedMode === "full" ? "full" : last4 ? "last4" : "full";
  // First keystroke pins the mode the agent is typing in (Astra round-3
  // review: an interrupted full SSN could remount as Last 4).
  const pinMode = () => { if (!storedMode || (savedMode === "full" && storedMode !== "full")) onMode?.(mode === "last4" ? "last4" : "full"); };
  const chip = (on: boolean) => (cls === "ch" ? `ch-btn ch-sm ${on ? "" : "ch-line"}` : `cc-chip cc-sm${on ? " cc-on" : ""}`);
  const note = cls === "ch" ? "ch-note" : "cc-cue";
  const prints = mode === "last4"
    ? (digits.length >= 4 ? `XXX-XX-${digits.slice(-4)}` : "")
    : (digits.length === 9 ? fmtSsnDigits(digits) : "");
  return (<>
    {!requireFull && (
      <div className={cls === "ch" ? "ch-row" : "cc-chips cc-seg"} role="radiogroup" aria-label="How much of the SSN the PNC gave">
        <button type="button" role="radio" aria-checked={mode === "full"} className={chip(mode === "full")}
          onClick={() => setLast4(false)}>All 9 digits</button>
        <button type="button" role="radio" aria-checked={mode === "last4"} className={chip(mode === "last4")} disabled={cannotDowngrade}
          onClick={() => { setLast4(true); onChange(digits.slice(-4)); }}>Last 4 only</button>
      </div>
    )}
    {cannotDowngrade && !requireFull && <div className={note}>A full SSN entry is in progress or securely saved. Clear an unsaved entry before switching to last 4.</div>}
    {mode === "last4" ? (
      <div className="sd-l4">
        <span className="sd-mask" aria-hidden="true">XXX-XX-</span>
        <input className={cls === "ch" ? "ch-in sd-l4-in" : "cc-field sd-l4-in"} type="text" inputMode="numeric" autoComplete="off"
          placeholder={savedMode === "last4" ? "Saved" : "1234"} maxLength={4} aria-label="Last 4 of the Social Security number"
          value={digits.slice(0, 4)} onChange={(e) => { pinMode(); onChange(e.target.value.replace(/\D/g, "").slice(0, 4)); }} />
      </div>
    ) : (
      <input className={cls === "ch" ? "ch-in" : "cc-field"} type="text" inputMode="numeric" autoComplete="off"
        placeholder={savedMode === "full" ? "Saved securely" : "###-##-####"} maxLength={11} aria-label="Social Security number"
        value={fmtSsnDigits(digits)} onChange={(e) => { pinMode(); onChange(e.target.value.replace(/\D/g, "").slice(0, 9)); }} />
    )}
    {!!prints && <div className={`${note} sd-good`}>Prints on the HIPAA pages as {prints}.</div>}
    {!!saveStatus && <div className={`${note}${saveError ? cls === "ch" ? " ch-note-bad" : " cc-red" : ""}`} role="status">{saveStatus}{onRetry && saveError && <button type="button" onClick={onRetry} style={{ marginLeft: 8 }}>Retry secure save</button>}</div>}
    {requireFull && digits.length > 0 && digits.length < 9 && (
      <div className={cls === "ch" ? "ch-note ch-note-bad" : "cc-cue cc-red"}>This firm requires all 9 digits.</div>
    )}
  </>);
}
