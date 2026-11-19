// Dates from historical signing notes are calendar dates, never import times.
export function historicalSignatureDate(claim: any, originals: any[], confirmations: any[]): string | null {
  const proof = claim?.answers?.signature_date_audit;
  const day = proof?.signed_date;
  if (proof?.claim_id !== claim.id || proof?.source !== 'signed_original_certificate' ||
    typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) return null;
  const scoped = (r:any) => r.firm_id === claim.firm_id && r.lead_id === claim.lead_id && r.meta?.claim_id === claim.id;
  return originals.some(r => scoped(r) && r.id === proof.original_event_id && r.meta?.sha256 === proof.certificate_sha256) &&
    confirmations.some(r => scoped(r) && r.id === proof.owner_event_id) ? day : null;
}
