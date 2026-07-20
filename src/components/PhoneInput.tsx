"use client";
import { useState, useEffect } from "react";

// US-only phone input. Stores E.164 (+17025551234), displays (702) 555-1234.
// Forces a uniform format across every file so data stays clean.
export function formatUsPhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
export function toE164(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  return d.length === 10 ? `+1${d}` : "";
}

export default function PhoneInput({ value, onChange, placeholder, autoFocus }: {
  value: string; onChange: (e164: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  const [display, setDisplay] = useState(formatUsPhone(value || ""));
  useEffect(() => { setDisplay(formatUsPhone(value || "")); }, [value]);
  const digits = display.replace(/\D/g, "");
  const complete = digits.length === 10;

  function handle(v: string) {
    const f = formatUsPhone(v);
    setDisplay(f);
    onChange(toE164(f)); // store clean E.164, or "" until complete
  }

  return (
    <div className="phone-input">
      <span className="phone-prefix">🇺🇸 +1</span>
      <input
        className={`phone-field ${digits.length > 0 && !complete ? "incomplete" : ""}`}
        value={display}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder || "(702) 555-1234"}
        inputMode="numeric"
        autoFocus={autoFocus}
      />
      {digits.length > 0 && !complete && <span className="phone-hint warn">Enter all 10 digits</span>}
      {complete && <span className="phone-hint ok">✓</span>}
    </div>
  );
}
