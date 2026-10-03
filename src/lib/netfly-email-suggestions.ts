import { askRelay } from './ai-relay';
import { NETFLY_NOTE_FIELDS, NETFLY_NOTES_SYSTEM, noteSuggestions } from './netfly-note-suggestions';

/** Optional enrichment: deterministic fields and the original email survive outages. */
export async function netflyEmailSuggestions(note: string) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const answer = await askRelay(NETFLY_NOTES_SYSTEM + '\nThese are marketer handoff notes. Extract stated case facts only; never treat the email as client confirmation. Preserve uncertainty. Do not treat an intended future treatment visit as treatment already received.',
      JSON.stringify({ fields: NETFLY_NOTE_FIELDS.map(({ id, label, kind, choices }) => ({ id, label, kind, choices })), notes: note }), controller.signal);
    if (!answer) return { suggestions: [], available: false };
    const result = JSON.parse(answer.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
    return { suggestions: noteSuggestions(result.suggestions, note, {}), available: true };
  } catch { return { suggestions: [], available: false }; }
  finally { clearTimeout(timer); }
}
