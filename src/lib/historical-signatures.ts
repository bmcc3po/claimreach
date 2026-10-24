import { ownerSignatureConfirmation } from './owner-file-confirmation';
export type HistoricalSignature = { ever_signed:'confirmed'|'unknown'; first_signed_at:string|null; signature_source:string|null };
const validDate=(s:unknown):s is string=>typeof s==='string' && Number.isFinite(Date.parse(s));
/** Ever signed is independent of today's agreement validity or placement. */
export function historicalSignature(claim:any, rows:{submissions?:any[];documents?:any[];events?:any[];emergencies?:any[];ownerIds?:string[]}):HistoricalSignature {
  const own=(r:any)=>!!claim.firm_id && r.firm_id===claim.firm_id && r.lead_id===claim.lead_id && r.claim_id===claim.id;
  const native=(rows.submissions||[]).filter(r=>own(r) && r.pax_index==null && validDate(r.signed_at));
  const emergency=(rows.emergencies||[]).filter(r=>r.firm_id===claim.firm_id && r.lead_id===claim.lead_id && r.audit?.emergency?.claim_id===claim.id && validDate(r.signed_at));
  const reviewed=claim.answers?.netfly_secondary?.review?.retainer_reviewed_document_id;
  const documents=(rows.documents||[]).filter(r=>own(r) && r.doc_type==='netfly_signed_retainer' && r.id===reviewed);
  const confirmations=(rows.events||[]).filter(r=>ownerSignatureConfirmation([r],claim.firm_id,claim.lead_id,claim.id,rows.ownerIds||[]));
  const sources=[...native.map(r=>`esign_submissions:${r.id}`),...emergency.map(r=>`signable_documents:${r.id}`),...documents.map(r=>`case_documents:${r.id}`),...confirmations.map(r=>`lead_activity:${r.id}`)];
  return {ever_signed:sources.length?'confirmed':'unknown',first_signed_at:[...native,...emergency].map(r=>r.signed_at).sort()[0]||null,signature_source:sources.join('; ')||null};
}
async function pages(make:()=>any){const rows:any[]=[];for(let from=0;;from+=500){const r=await make().order('id',{ascending:true}).range(from,from+499);if(r.error)throw new Error('Historical signature evidence is unavailable.');rows.push(...r.data||[]);if((r.data||[]).length<500)return rows;}}
/** Caller session RLS remains in force; never trusts a lead-wide signed date. */
export async function loadHistoricalSignatures(db:any, claims:any[]) {
  const result=new Map<string,HistoricalSignature>();
  if(!claims.length)return result;
  const owners=await pages(()=>db.from('app_users').select('id').eq('role','owner').eq('active',true));
  for(let offset=0;offset<claims.length;offset+=100){
    const batch=claims.slice(offset,offset+100),ids=batch.map(c=>c.id),leads=[...new Set(batch.map(c=>c.lead_id))];
    const [actual,submissions,documents,events,emergencies]=await Promise.all([
      pages(()=>db.from('claims').select('id,lead_id,firm_id,answers').in('id',ids)),
      pages(()=>db.from('esign_submissions').select('id,claim_id,lead_id,firm_id,signed_at,pax_index').in('claim_id',ids)),
      pages(()=>db.from('case_documents').select('id,claim_id,lead_id,firm_id,doc_type').in('claim_id',ids).eq('doc_type','netfly_signed_retainer')),
      pages(()=>db.from('lead_activity').select('id,lead_id,firm_id,actor,meta').in('lead_id',leads).eq('meta->>event','owner_signed_delivery_confirmation')),
      pages(()=>db.from('signable_documents').select('id,lead_id,firm_id,signed_at,audit').in('lead_id',leads)),
    ]);
    for(const c of actual)if(batch.some(b=>b.id===c.id && b.lead_id===c.lead_id && b.firm_id===c.firm_id))result.set(c.id,historicalSignature(c,{submissions,documents,events,emergencies,ownerIds:owners.map(o=>o.id)}));
  }
  return result;
}
