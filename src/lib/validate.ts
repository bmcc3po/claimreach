// Lightweight format checks for the intake console's paperwork fields. These are
// format gates only — they never block saving the file, they just warn the agent
// so a typo in an email or a short SSN gets caught while the caller is still on
// the line instead of after the retainer bounces.

export function digits(v: string | undefined | null): string {
  return String(v ?? "").replace(/\D/g, "");
}

// US phone: 10 digits, or 11 with a leading 1. Empty is treated as "not yet
// entered", which is not an error — the caller-facing gate handles required-ness.
export function isPhone(v: string | undefined | null): boolean {
  const d = digits(v);
  if (d.length === 0) return true;
  if (d.length === 10) return true;
  return d.length === 11 && d.startsWith("1");
}

export function formatPhone(v: string | undefined | null): string {
  let d = digits(v);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return String(v ?? "");
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Pragmatic email shape: something@something.tld, no spaces. Empty is not an error.
export function isEmail(v: string | undefined | null): boolean {
  const s = String(v ?? "").trim();
  if (s.length === 0) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// SSN: exactly 9 digits once separators are stripped. Empty is not an error.
export function isSsn(v: string | undefined | null): boolean {
  const d = digits(v);
  return d.length === 0 || d.length === 9;
}

export function formatSsn(v: string | undefined | null): string {
  const d = digits(v);
  if (d.length !== 9) return String(v ?? "");
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}
