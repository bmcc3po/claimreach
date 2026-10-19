/** Dedicated marketer-facing text; internal notes must never be substituted. */
export function validDqExplanation(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 10 && value.length <= 2000 && /[\p{L}\p{N}]/u.test(value);
}
export const DQ_EXPLANATION_ERROR = 'Write a marketer-facing explanation (10–2000 characters). Do not include private medical or call notes.';
