/** Server-only use after the caller's exact firm/matter access was checked.
 * Return only the operational hold; never expose payroll lines to an agent. */
export async function attorneyHold(db:any,firmId:string,claimId:string,campaignId:string) {
  const {data,error}=await db.from('cr_payroll_notes').select('kind,data,created_at,id')
    .eq('firm_id',firmId).eq('claim_id',claimId).eq('campaign_id',campaignId)
    .in('kind',['attorney_hold','attorney_release']).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error('Could not verify the attorney hold. Nothing was sent; please refresh.');
  return data?.kind==='attorney_hold'?{reason:String(data.data?.reason||'Waiting on attorney'),at:data.created_at}:null;
}
