/** Email transports wrap lines. Match whitespace differences only, retaining
 * the original span so a reviewer can find the evidence in the source. */
export function sourceEvidence(notes: string, quote: string): string | null {
  if (quote.length < 3 || quote.length > 2000) return null;
  if (notes.includes(quote)) return quote;
  const words = quote.split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return notes.match(new RegExp(words.join('\\s+')))?.[0] || null;
}
