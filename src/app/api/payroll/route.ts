import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { loadPayroll, payrollOwner, payrollToken, payrollView, payrollClosePayload } from '@/lib/payroll-server';
import { defaultPayrollEnd, payrollPeriod, validDay } from '@/lib/payroll';
import { pacificDay } from '@/lib/packet-worklist';
import { uuid } from '@/lib/firm-review-access';
export const runtime = 'edge';
const json = (data: unknown, status = 200) => NextResponse.json(data,{ status,headers:{'Cache-Control':'private, no-store'} });
export async function GET(req: NextRequest) {
  try {
    const db=await supabaseServer(); if (!await payrollOwner(db)) return json({error:'Only the owner can open payroll.'},403);
    const now=new Date().toISOString(), end=req.nextUrl.searchParams.get('end')||defaultPayrollEnd(now); payrollPeriod(end);
    const data=await loadPayroll(db);
    return json({...payrollView(data,end,now),token:await payrollToken(data,end)});
  } catch(e) { return json({error:e instanceof Error?e.message:'Payroll could not load. No totals were finalized.'},503); }
}
export async function POST(req: NextRequest) {
  if(req.headers.get('origin')!==req.nextUrl.origin) return json({error:'Refresh before saving payroll.'},403);
  if(!req.headers.get('content-type')?.startsWith('application/json')) return json({error:'Invalid request.'},400);
  try {
    const db=await supabaseServer(); const me=await payrollOwner(db); if(!me) return json({error:'Only the owner can change payroll.'},403);
    const raw=await req.text(); if(raw.length>16000) return json({error:'Request is too large.'},400);
    let body; try {body=JSON.parse(raw);} catch{return json({error:'Invalid request.'},400);}
    const now=new Date().toISOString();
    if(body.op==='close') {
      const p=payrollPeriod(body.end);
      if(pacificDay(now)<p.cutoff) return json({error:'This period closes on Wednesday, '+p.cutoff+'.'},409);
      if(body.confirmProcessed!==true) return json({error:'Confirm the billing and commission list before closing.'},400);
      const data=await loadPayroll(db);
      if(body.token!==await payrollToken(data,body.end)) return json({error:'The files changed. Refresh payroll and review the updated list before closing.'},409);
      const payload=payrollClosePayload(data,body.end,now);
      if(!payload.p_runs.length) return json({error:'This period is already closed.'},409);
      const excluded=payload.p_runs.some(r=>r.snapshot.undated.length||r.snapshot.unresolved.length);
      if(excluded&&body.confirmExcluded!==true) return json({error:'Review the undated and unverified files; they are excluded from this payroll.'},400);
      const saved=await db.rpc('cr_close_payroll',payload);
      if(saved.error) return json({error:'Payroll was not closed. Refresh to check for a concurrent close, then retry.'},409);
      return json({ok:true});
    }
    if(!uuid(body.claim)) return json({error:'Choose a file.'},400);
    const c=await db.from('claims').select('id,lead_id,firm_id,campaign_id,claim_type').eq('id',body.claim).maybeSingle();
    if(c.error||!c.data||c.data.claim_type!=='mva') return json({error:'MVA file unavailable.'},404);
    const scope={firm_id:c.data.firm_id,campaign_id:c.data.campaign_id,claim_id:c.data.id};
    const reason=typeof body.reason==='string'?body.reason.trim():'';
    if(reason.length<3||reason.length>1000) return json({error:'Add a brief reason or reconciliation reference (3–1,000 characters).'},400);
    if(body.op==='history') {
      const p=payrollPeriod(body.end);
      if(p.cutoff>=pacificDay(now)) return json({error:'Use this period’s close button. Historical entries must predate today’s payroll cutoff.'},400);
      if(typeof body.billed!=='boolean'||typeof body.paid!=='boolean'||!body.billed&&!body.paid) return json({error:'Choose what was actually billed or paid.'},400);
      const a=body.paid&&uuid(body.agent)?await db.from('app_users').select('id,full_name,role').eq('id',body.agent).maybeSingle():null;
      if(body.paid&&(!a?.data||!['owner','admin','manager','qa','agent'].includes(a.data.role))) return json({error:'Choose the agent who was actually paid.'},400);
      const l=await db.from('leads').select('id,claimant_name,lead_no').eq('id',c.data.lead_id).eq('firm_id',scope.firm_id).single();
      if(l.error||!l.data) return json({error:'Could not read the file.'},503);
      const data={name:l.data.claimant_name,leadNo:l.data.lead_no,href:'/leads/'+l.data.id+'?claim='+scope.claim_id,
        agent:a?.data?.full_name||'',agentId:a?.data?.id||null,signedDay:'',reason,source:'Owner recorded previous billing/payment'};
      const items=[...(body.billed?['billing']:[]),...(body.paid?['commission']:[])].map(kind=>({...scope,kind,run_id:null,source_line_id:null,period_start:p.start,data}));
      const result=await db.from('cr_payroll_lines').insert(items).select('id');
      if(result.error) return json({error:'History was not added. This file may already have a billing or commission entry; check reconciliation first.'},409);
      return json({ok:true});
    }
    let kind=body.op; let value:Record<string,any>={reason};
    if(kind==='attorney_hold'||kind==='attorney_release') { /* Separate financial hold; does not rewrite case status. */ }
    else if(kind==='signature_date') {
      if(!validDay(body.day)||body.day>pacificDay(now)) return json({error:'Choose the actual signing date, no later than today.'},400);
      value.day=body.day;
    } else if(kind==='agent_credit') {
      if(!uuid(body.agent)) return json({error:'Choose the credited agent.'},400);
      const a=await db.from('app_users').select('id,full_name,role,active').eq('id',body.agent).maybeSingle();
      if(a.error||a.data?.active!==true||!['owner','admin','manager','qa','agent'].includes(a.data.role)) return json({error:'Choose an active staff member.'},400);
      value={...value,agent_id:a.data.id,agent_name:a.data.full_name||'Staff'};
    } else if(kind==='reconcile') {
      if(!uuid(body.line)||typeof body.processed!=='boolean') return json({error:'Choose a ledger entry and whether it was processed.'},400);
      const line=await db.from('cr_payroll_lines').select('id').eq('id',body.line).eq('firm_id',scope.firm_id).eq('claim_id',scope.claim_id).eq('campaign_id',scope.campaign_id).maybeSingle();
      if(line.error||!line.data) return json({error:'Ledger entry unavailable.'},404);
      value={...value,line_id:body.line,processed:body.processed};
    } else return json({error:'Unknown payroll action.'},400);
    const saved=await db.from('cr_payroll_notes').insert({...scope,kind,data:value}).select('id').single();
    if(saved.error||!saved.data) return json({error:'The change has not saved. Try again.'},503);
    return json({ok:true});
  } catch(e) {return json({error:e instanceof Error?e.message:'Payroll has not saved.'},503);}
}
