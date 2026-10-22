import { historicalSignature } from './historical-signatures';
/** Read-only evidence reconciliation. Never converts missing evidence into a negative fact.
 * A proposed correction is not applied until an owner approves an exact version. */
export function reconcileClaimStatus(claim:any, events:any[] = [], submissions:any[] = [], deliveries:any[] = []) {
  const flags:string[]=[];
  const own=(r:any)=>!!claim.firm_id && r.firm_id===claim.firm_id && r.lead_id===claim.lead_id && (r.claim_id===claim.id || r.meta?.claim_id===claim.id);
  const reviews=events.filter(r=>own(r) && r.meta?.event==='firm_file_review' && r.meta?.campaign_id===claim.campaign_id && ['accepted','turned_down'].includes(r.meta?.action))
    .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const d=claim.answers?.signed_decline;
  if(d?.source==='firm' && d.at && d.reviewEventId && !reviews.some(r=>r.id===d.reviewEventId))reviews.push({id:d.reviewEventId,created_at:d.at,meta:{action:'turned_down',explanation:d.reason,source:'signed_decline_snapshot'}});
  reviews.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const latest=reviews[0];
  const tie=latest && reviews.some(r=>r.id!==latest.id && r.created_at===latest.created_at && r.meta.action!==latest.meta.action);
  if(tie)flags.push('conflicting_firm_decisions_same_time');
  const signing=historicalSignature(claim,{submissions});
  const receipt=deliveries.filter(r=>own(r) && r.ok===true && r.recipient_verified===true).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0];
  const sentAt=claim.firm_sent_at || receipt?.created_at || null;
  let proposed:string|null=null;
  if(latest && !tie){
    if(!Number.isFinite(Date.parse(latest.created_at)))flags.push('firm_decision_date_unknown');
    else if(sentAt && Date.parse(sentAt)>Date.parse(latest.created_at))flags.push('delivery_after_firm_decision_review_placement');
    else if(claim.status_changed_at && Date.parse(claim.status_changed_at)>Date.parse(latest.created_at))flags.push('newer_current_status_preserved');
    else { const expected=latest.meta.action==='turned_down'?'firm_rejected':'retained';if(claim.status!==expected){proposed=expected;flags.push('saved_status_disagrees_with_latest_firm_decision');} }
  }
  if(['delivered','retained','firm_rejected'].includes(claim.status) && !sentAt)flags.push('delivery_date_not_recorded');
  if(['dq','external_dq_review'].includes(claim.status) && !claim.dq_reason && !claim.status_descriptor)flags.push('dq_reason_not_recorded');
  if(signing.ever_signed!=='confirmed')flags.push('signature_evidence_unresolved');
  return {proposed_status:proposed,firm_decision:latest?.meta.action || null,firm_decision_reason:latest?.meta.explanation || null,
    firm_decision_at:latest?.created_at || null,firm_decision_source:latest?`${latest.meta.source==='signed_decline_snapshot'?'claims.answers.signed_decline':'lead_activity'}:${latest.id}`:null,
    ...signing,
    delivered_at:sentAt,delivery_source:claim.firm_sent_at?'claims.firm_sent_at':receipt?`firm_deliveries:${receipt.id}`:null,
    conflict_flags:flags.join('; '),expected_updated_at:claim.updated_at || null};
}
