import { NETFLY_ANSWER_KEY, NETFLY_FIELDS } from './netfly-ontake';

/** The owner file reads the same saved answers as the NETFLY welcome call. */
export function netflyWorkspaceCall(leadKey: string, claim: { claim_type?: string; answers?: Record<string, any> | null; updated_at?: string | null }) {
  if (claim.claim_type !== NETFLY_ANSWER_KEY) return null;
  const saved = claim.answers?.[NETFLY_ANSWER_KEY];
  const fields = saved?.fields || {};
  const rows = NETFLY_FIELDS.flatMap(field => {
    const value = fields[field.id];
    return typeof value === 'string' && value.trim() ? [{ k: field.label, v: value }] : [];
  });
  return {
    rows, answered: rows.length, href: `/app/netfly/${encodeURIComponent(leadKey)}`,
    hasOld: false, when: claim.updated_at || null,
    agent: saved?.call_close?.by_name || null,
    dispo: saved?.call_close?.completion === 'complete' ? 'Ontake complete'
      : saved?.call_close?.completion === 'incomplete' ? 'Callback to finish' : null,
  };
}
