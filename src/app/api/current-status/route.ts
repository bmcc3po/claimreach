import { NextRequest, NextResponse } from 'next/server';
import { CURRENT_STATUSES, STATUS_REASONS, validateStatusEdit } from '@/lib/current-status';
import { currentStatusContext, currentStatusResponse, currentStatusEvidence, CurrentStatusError } from '@/lib/current-status-server';
export const runtime = 'edge';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const failure=(e:unknown)=>json({error:e instanceof Error?e.message:'Status unavailable.'},e instanceof CurrentStatusError?e.status:503);
export async function GET(req:NextRequest){
  try { const c=await currentStatusContext(req.nextUrl.searchParams.get('lead_id')||'',req.nextUrl.searchParams.get('claim_id')||'');
    return json({current:currentStatusResponse(c.claim,c.actor.can('claims.status')),statuses:CURRENT_STATUSES,reasons:STATUS_REASONS});
  }catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
  try {
    const raw=await req.json(); const parsed=validateStatusEdit(raw); if(parsed.error)return json({error:parsed.error},400);
    const c=await currentStatusContext(raw.lead_id,raw.claim_id);
    if(!raw.expected_updated_at || raw.expected_updated_at!==c.claim.updated_at)throw new CurrentStatusError('This claim changed. Review the latest status before saving.');
    await currentStatusEvidence(c,parsed.value!);
    const r=await c.db.rpc('cr_save_current_status',{p_claim_id:c.claim.id,p_lead_id:c.lead.id,p_firm_id:c.claim.firm_id,p_campaign_id:c.claim.campaign_id,
      p_expected_updated_at:raw.expected_updated_at,p_actor_id:c.actor.id,p_status:parsed.value!.status,p_category:parsed.value!.category,
      p_descriptor:parsed.value!.descriptor,p_note:parsed.value!.note,p_callback_at:parsed.value!.callback_at});
    if(r.error)throw new CurrentStatusError(/stale|changed/i.test(r.error.message)?'This claim changed. Review the latest status before saving.':'The status was not saved. Refresh and try again.',409);
    return json({current:currentStatusResponse(r.data,true)});
  }catch(e){return failure(e);}
}
