// RPC boundary double for actual route/helper tests. Migration correctness is
// independently executed by the PGlite SQL suite.
exports.installAttemptRpc = function(db) {
  db.tables.esign_send_attempts = [];
  const unresolved = row => ['reserved','provider_pending','uncertain'].includes(row.state);
  const fail = () => ({data:null,error:{code:'40001',message:'synthetic conflict'}});
  const scope = (claimId,paxKey) => {
    const claim = db.tables.claims.find(x=>x.id===claimId);
    const lead = db.tables.leads.find(x=>x.id===claim?.lead_id);
    const child = String(lead?.external_id||'').match(/^(.+):pax:([^:]+)$/);
    if(child && !paxKey) {
      const parents=db.tables.claims.filter(x=>x.lead_id===child[1]&&x.campaign_id===claim.campaign_id&&x.firm_id===claim.firm_id);
      if(parents.length!==1) return null;
      return {claimId:parents[0].id,paxKey:child[2]};
    }
    return claim ? {claimId,paxKey:paxKey||''} : null;
  };
  db.rpc=async(name,args={})=>{
    if(name==='mint_lead_no')return {data:'TMP-TEST',error:null};
    if(name==='cr_pending_esign_send'||name==='cr_reserve_esign_send'){
      const canonical=scope(args.p_claim_id||args.p_parent_claim_id,args.p_pax_key);if(!canonical)return fail();
      const old=db.tables.esign_send_attempts.find(x=>x.parent_claim_id===canonical.claimId&&x.pax_key===canonical.paxKey&&unresolved(x));
      if(name==='cr_pending_esign_send')return {data:old?{...old}:null,error:null};
      if(old)return fail();
      const created={id:db.nextId(),parent_claim_id:canonical.claimId,pax_key:canonical.paxKey,pax_index:args.p_pax_index,state:'reserved',created_at:new Date().toISOString()};
      db.tables.esign_send_attempts.push(created);return{data:{...created,acquired:true},error:null};
    }
    const attempt=db.tables.esign_send_attempts.find(x=>x.id===args.p_attempt_id);if(!attempt)return fail();
    if(name==='cr_bind_esign_send'){
      if(attempt.state!=='reserved')return fail();
      const rows=db.tables.esign_submissions.filter(x=>x.lead_id===args.p_target_lead_id&&x.claim_id===args.p_target_claim_id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
      const latest=rows[0];if((latest?.id??null)!==args.p_expected_submission_id||(latest?.status??null)!==args.p_expected_status)return fail();
      Object.assign(attempt,{target_claim_id:args.p_target_claim_id,target_lead_id:args.p_target_lead_id,expected_submission_id:args.p_expected_submission_id,send_context:args.p_send_context,template_id:args.p_template_id});
    }else if(name==='cr_mark_esign_send_pending'){
      if(attempt.state!=='reserved'||!attempt.target_claim_id)return fail();attempt.state='provider_pending';attempt.provider_started_at=new Date().toISOString();
    }else if(name==='cr_hold_esign_send'){
      if(!unresolved(attempt))return fail();attempt.state='uncertain';
    }else if(name==='cr_reject_esign_send'){
      if(attempt.state!=='reserved'&&!(attempt.state==='provider_pending'&&args.p_provider_rejected===true))return fail();attempt.state='rejected';attempt.error_code=args.p_error_code;
    }else if(name==='cr_finalize_esign_send'){
      if(!['provider_pending','uncertain'].includes(attempt.state))return fail();
      const r=await db.from('esign_submissions').insert({...args.p_submission,created_at:new Date().toISOString()}).select('id').single();if(r.error)return r;
      attempt.state='linked';attempt.submission_id=r.data.id;return{data:{id:r.data.id,attempt_id:attempt.id},error:null};
    }else throw new Error('Unhandled RPC '+name);
    return {data:{...attempt},error:null};
  };
};
