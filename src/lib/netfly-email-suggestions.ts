import { askRelay } from './ai-relay';
import { NETFLY_NOTE_FIELDS, NETFLY_NOTES_SYSTEM, noteSuggestions, noteFieldDescriptor } from './netfly-note-suggestions';
import { extractNetflyEmail } from './netfly-handoff';

/** Optional enrichment: deterministic fields and the original email survive outages. */
export async function netflyEmailSuggestions(note: string) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const explicit = extractNetflyEmail(note).fields;
    // An older handoff cannot answer whether the client can get care today.
    const currentCallOnly = new Set(['care_today', 'care_today_setting', 'care_today_plan']);
    const answer = await askRelay(NETFLY_NOTES_SYSTEM + '\nThese are marketer handoff notes. Extract stated case facts only; never treat the email as client confirmation. Preserve uncertainty. Do not treat an intended future treatment visit as treatment already received.',
      JSON.stringify({ fields: NETFLY_NOTE_FIELDS.filter(field => !explicit[field.id] && !currentCallOnly.has(field.id)).map(noteFieldDescriptor), existing: explicit, notes: note }), controller.signal);
    if (!answer) return { suggestions: [], available: false };
    const result = JSON.parse(answer.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
    return { suggestions: noteSuggestions(result.suggestions, note, explicit).filter(row => !currentCallOnly.has(row.id)), available: true };
  } catch { return { suggestions: [], available: false }; }
  finally { clearTimeout(timer); }
}
