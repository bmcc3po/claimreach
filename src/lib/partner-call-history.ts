/** Public call projection. Never return provider identifiers, recordings or raw metadata. */
export type PartnerCall = {
  at: string | null;
  source: 'Call record' | 'Manual log';
  direction: 'Outbound' | 'Inbound' | 'Unknown';
  result: string;
  durationSeconds: number | null;
};
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
const direction = (v: unknown): PartnerCall['direction'] => v === 'outbound' ? 'Outbound' : v === 'inbound' ? 'Inbound' : 'Unknown';
const results: Record<string,string> = {
  answered:'Answered', unanswered:'No answer', no_answer:'No answer', 'no-answer':'No answer',
  busy:'Busy', failed:'Failed', voicemail:'Voicemail', missed:'Missed', completed:'Completed',
  connected:'Connected', cancelled:'Cancelled', canceled:'Cancelled',
};
const result = (v: unknown) => typeof v === 'string' ? results[v.toLowerCase()] || 'Not recorded' : 'Not recorded';

export function partnerCallHistory(calls: any[], logs: any[]) {
  const seen = new Set<string>();
  const provider = calls.filter(c => {
    // Provider IDs are scoped by provider. Equal timestamps alone never prove a duplicate.
    const ref = c.call_sid || c.external_ref;
    const key = ref && c.provider ? `${c.provider}:${ref}` : c.id ? `row:${c.id}` : null;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map((c): PartnerCall => ({ at:timestamp(c.occurred_at), source:'Call record', direction:direction(c.direction),
    result:result(c.provider_call_result || c.outcome || (c.channel === 'voicemail' ? 'voicemail' : null)),
    durationSeconds:typeof c.duration_sec === 'number' && c.duration_sec >= 0 ? c.duration_sec : null }));
  const manual = logs.map((c): PartnerCall => ({ at:timestamp(c.created_at), source:'Manual log', direction:direction(c.direction),
    result:result(c.outcome), durationSeconds:typeof c.duration_min === 'number' && c.duration_min >= 0 ? c.duration_min*60 : null }));
  // Keep manual logs separate: they may describe an already imported provider call.
  const history = [...provider,...manual].sort((a,b) => a.at && b.at ? Date.parse(b.at)-Date.parse(a.at) : a.at ? -1 : b.at ? 1 : 0);
  const outbound = provider.filter(c => c.direction === 'Outbound');
  const dates = outbound.map(c=>c.at).filter((v):v is string=>!!v).sort((a,b)=>Date.parse(a)-Date.parse(b));
  return { history, attemptCount:outbound.length, inboundCount:provider.filter(c=>c.direction==='Inbound').length,
    manualLogCount:manual.length, firstOutboundAt:dates[0] || null, lastOutboundAt:dates.at(-1) || null };
}
