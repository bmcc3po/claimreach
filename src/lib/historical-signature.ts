// Original certificates supply the actual instant, never an import timestamp.
export function historicalSignatureDate(claim: any, originals: any[], confirmations: any[]): string | null {
  const proof = claim?.answers?.signature_date_audit;
  const day = proof?.signed_date;
  const at = proof?.certificate_signed_at;
  if (proof?.claim_id !== claim.id || proof?.source !== 'signed_original_certificate' ||
    typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) return null;
  if (typeof at !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at))) return null;
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
  const part = (key:string) => parts.find(p=>p.type===key)?.value;
  if (`${part('year')}-${part('month')}-${part('day')}` !== day) return null;
  const scoped = (r:any) => r.firm_id === claim.firm_id && r.lead_id === claim.lead_id && r.meta?.claim_id === claim.id;
  return originals.some(r => scoped(r) && r.id === proof.original_event_id && r.meta?.sha256 === proof.certificate_sha256) &&
    confirmations.some(r => scoped(r) && r.id === proof.owner_event_id) ? at : null;
}
