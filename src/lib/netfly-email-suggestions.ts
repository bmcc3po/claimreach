import { askRelay } from './ai-relay';
import { NETFLY_NOTE_FIELDS, NETFLY_NOTES_SYSTEM, noteSuggestions } from './netfly-note-suggestions';
import { extractNetflyEmail } from './netfly-handoff';

/** Optional enrichment: deterministic fields and the original email survive outages. */
export async function netflyEmailSuggestions(note: string) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const explicit = extractNetflyEmail(note).fields;
    const answer = await askRelay(NETFLY_NOTES_SYSTEM + '\nThese are marketer handoff notes. Extract stated case facts only; never treat the email as client confirmation. Preserve uncertainty. Do not treat an intended future treatment visit as treatment already received.',
      JSON.stringify({ fields: NETFLY_NOTE_FIELDS.filter(field => !explicit[field.id]).map(({ id, kind, choices }) => ({ id, kind, choices })), existing: explicit, notes: note }), controller.signal);
    if (!answer) return { suggestions: [], available: false };
    const result = JSON.parse(answer.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
    return { suggestions: noteSuggestions(result.suggestions, note, explicit), available: true };
  } catch { return { suggestions: [], available: false }; }
  finally { clearTimeout(timer); }
}
