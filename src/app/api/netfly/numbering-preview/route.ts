import { NextResponse } from 'next/server';
import { netflyContext } from '@/lib/netfly-server';
export const runtime = 'edge';
export async function GET() {
  const ctx=await netflyContext();
  if(!ctx || ctx.actor.role!=='owner')return NextResponse.json({error:'Owner access required.'},{status:403});
  const r=await ctx.db.rpc('cr_preview_netfly_numbers',{p_firm:ctx.campaign.firm_id,p_campaign:ctx.campaign.id});
  if(r.error)return NextResponse.json({error:'Complete numbering preview unavailable; no numbers changed.'},{status:503});
  return NextResponse.json({as_of:new Date().toISOString(),campaign_id:ctx.campaign.id,count:r.data.count,includes_archived:true,mapping:r.data.mapping,
    notice:'Preview only; existing numbers are unchanged. Regenerate before applying if any files have been added.'},{headers:{'Cache-Control':'private, no-store'}});
}
