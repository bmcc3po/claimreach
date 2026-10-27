import {confirmedFirmDeliveryAt} from './firm-delivery-state';
/** Verify recipient scope before promoting a mail receipt to firm delivery. */
export async function verifiedDeliveryReceipts(db:any,claims:any[],receipts:any[]){
  if(!receipts.length)return receipts;
  const ids=[...new Set(claims.map(c=>c.campaign_id).filter(Boolean))];
  const campaigns:any[]=[];
  for(let from=0;from<ids.length;from+=100){const r=await db.from('campaigns').select('id,firm_id,firm_email').in('id',ids.slice(from,from+100));if(r.error)throw new Error('Delivery recipient evidence is unavailable.');campaigns.push(...r.data||[]);}
  const owners=await db.from('app_users').select('id,email').eq('role','owner').eq('active',true);
  if(owners.error)throw new Error('Delivery recipient evidence is unavailable.');
  const ownerEmail=(owners.data||[]).find((r:any)=>String(r.email||'').toLowerCase()==='bmc@innovativeintake.com')?.email || null;
  return receipts.map(r=>{
    const claim=claims.find(c=>c.id===r.claim_id && c.lead_id===r.lead_id && c.firm_id===r.firm_id && (!r.campaign_id || r.campaign_id===c.campaign_id));
    const campaign=claim && campaigns.find(c=>c.id===claim.campaign_id && c.firm_id===claim.firm_id);
    return {...r,recipient_verified:!!campaign && !!confirmedFirmDeliveryAt([r],campaign.firm_email,ownerEmail)};
  });
}
