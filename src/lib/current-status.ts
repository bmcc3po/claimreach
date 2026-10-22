/** Public status contract v1. Keys remain stable across UI, imports and exports.
 * Legacy workflow keys stay stored until a reviewed mapping is chosen. */
export const CURRENT_STATUS_VERSION = 1;
export const CURRENT_STATUSES = [
  ['new','New lead'], ['contacting','Still contacting'], ['scheduled_callback','Scheduled call back'],
  ['esign_sent','Sent esign'], ['signed_grievous','Signed esign'], ['delivered','Sent to firm'],
  ['retained','Firm accepted'], ['firm_rejected','Firm rejected'], ['bmc_rejected','BMC rejected'],
  ['dq','DQ'], ['dnc','DNC'], ['wip','WIP'], ['flag','Flag'],
] as const;
export type CurrentStatusKey = typeof CURRENT_STATUSES[number][0];
const labels: Record<string,string> = Object.fromEntries(CURRENT_STATUSES);
export const STATUS_REASONS = [
  { category:'criteria', label:'Criteria', statuses:['dq','bmc_rejected','firm_rejected'], descriptors:[['sol','SOL'],['treatment_gap','Gap in treatment'],['at_fault','At fault'],['no_injury','No injury'],['no_treatment','No treatment'],['no_coverage','No coverage'],['already_rep','Already represented'],['other','Other criteria']] },
  { category:'contact', label:'Contact', statuses:['dq'], descriptors:[['wrong_number','Wrong number']] },
  { category:'contact_request', label:'Contact request', statuses:['dnc'], descriptors:[['dnc','Do not contact requested']] },
  { category:'review', label:'Review', statuses:['wip','flag'], descriptors:[['missing_information','Missing information'],['document_review','Document review'],['supervisor_review','Supervisor review']] },
  { category:'decision', label:'Recorded decision', statuses:['firm_rejected','bmc_rejected'], descriptors:[['reason_not_supplied','Decision reason not supplied'],['other','Other recorded reason']] },
] as const;
export function currentStatusLabel(key?: string | null, fallback?: string) {
  return labels[String(key)] || ({ signed_wip:'WIP', signed_flag:'Flag' } as Record<string,string>)[String(key)] || fallback || String(key || 'Status not recorded').replace(/_/g,' ');
}
export function currentStatusMapping(key: string) {
  return { key, label:currentStatusLabel(key), mapping_required:!CURRENT_STATUSES.some(([k])=>k===key), version:CURRENT_STATUS_VERSION };
}
export type StatusEdit = { status: string; category: string | null; descriptor: string | null; note: string; callback_at: string | null };
export function statusNoteError(note: unknown): string | null {
  if (typeof note !== 'string' || !note.trim()) return 'Enter a one-sentence agent note.';
  // Abbreviations/decimals do not split a sentence; line breaks always do.
  const text = note.trim().replace(/\b(?:Mr|Mrs|Ms|Dr|St|vs|e\.g|i\.e)\./gi,'abbr').replace(/(\d)\.(?=\d)/g,'$1');
  if (/[\r\n]/.test(note) || /[.!?]+["')\]]*\s+\S/.test(text)) return 'Keep the agent note to one sentence.';
  if (note.length > 500) return 'Keep the one-sentence note within 500 characters.';
  return null;
}
export function validateStatusEdit(raw: any): { value: StatusEdit; error?: never } | { error: string; value?: never } {
  if (!CURRENT_STATUSES.some(([key])=>key===raw?.status)) return {error:'Choose a current status; legacy values require reviewed mapping.'};
  const error = statusNoteError(raw.note); if (error) return {error};
  const groups = STATUS_REASONS.filter(r=>(r.statuses as readonly string[]).includes(raw.status));
  if (groups.length && !groups.some(r=>r.category===raw.category && r.descriptors.some(([k])=>k===raw.descriptor))) return {error:'Choose the reason category and its specific descriptor.'};
  if (!groups.length && (raw.category || raw.descriptor)) return {error:'This status does not use that reason.'};
  if (raw.status==='scheduled_callback' && (!raw.callback_at || !Number.isFinite(Date.parse(raw.callback_at)))) return {error:'Choose the scheduled call-back date and time.'};
  return {value:{status:raw.status, category:groups.length?raw.category:null,descriptor:groups.length?raw.descriptor:null,note:raw.note.trim(),callback_at:raw.status==='scheduled_callback'?new Date(raw.callback_at).toISOString():null}};
}
