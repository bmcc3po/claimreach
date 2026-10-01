/** A conservative inbound revocation detector; a human can also mark DNC. */
export function isSmsRevocation(body: string): boolean {
  const normalized = String(body || "").trim().toLowerCase().replace(/[’']/g, "'");
  if (!normalized) return false;
  if (/^(stop|quit|end|revoke|opt[ -]?out|unsubscribe|cancel|remove|stopall)[.!\s]*$/.test(normalized)) return true;
  return /\b(?:stop|quit|end|cancel|unsubscribe|remove|revoke)\s+(?:sending|texting|messaging|contacting|texts?|messages?)\s+(?:me|us)?\b/.test(normalized)
    || /\b(?:do not|don't)\s+(?:text|message|contact)\s+me\b/.test(normalized)
    || /\bremove\s+me\s+from\s+(?:texts?|messages?|your list)\b/.test(normalized);
}
