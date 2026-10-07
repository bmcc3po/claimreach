// Offline harness: actual routes/workflow/setter with in-memory data and mail.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import ts from 'typescript';
import { NextRequest } from 'next/server';
import { FakeDb } from './test-fake-db';
import * as access from './firm-review-access';
import * as decline from './signed-decline';
import * as notification from './signed-decline-notification';
import { DEFAULT_STATUSES } from './statuses';
import { setClaimStatusForLeads } from './claim-status';
export const OUTCOME_ID='33333333-3333-4333-8333-333333333333';
export const OUTCOME_FIRM='11111111-1111-4111-8111-111111111111';
export const OUTCOME_CAMP='22222222-2222-4222-8222-222222222222';
const compile=(file:string,mods:Record<string,any>)=>{
  const out:any={};const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{target:9,module:1}}).outputText;
  new Function('require','exports',code)((key:string)=>{assert.ok(key in mods,'Unexpected module '+key);return mods[key]},out);return out;
};
export function outcomeHarness() {
  const claim:any={id:OUTCOME_ID,lead_id:'lead',firm_id:OUTCOME_FIRM,campaign_id:OUTCOME_CAMP,campaign:'INNO MVA',claim_type:'mva',
    status:'delivered',updated_at:'2026-10-01T12:00:00Z',answers:{mva_call:{story:'Preserve this story'}},firm_sent_at:'2026-10-02T12:00:00Z',firm_send_result:'original receipt'};
  const lead:any={id:'lead',firm_id:OUTCOME_FIRM,lead_no:'TEST-1',claimant_name:'Fictional Client',signed_at:'2026-10-01T12:00:00Z',archived_at:null};
  const db=new FakeDb({claims:[claim],leads:[lead],campaigns:[{id:OUTCOME_CAMP,firm_id:OUTCOME_FIRM,name:'INNO MVA',firm_email:'firm@example.test'}],
    statuses:DEFAULT_STATUSES,lead_activity:[],firm_delivery_dispatch:[]});
  const h={db,claim,lead,role:'owner' as string|null,capability:true,firmId:null as string|null,reviewer:true,signed:true,
    scope:{firmId:OUTCOME_FIRM,campaignId:OUTCOME_CAMP,name:'Synthetic Reviewer'},sends:[] as any[],
    mailResult:{ok:true,providerId:'synthetic-mail'} as {ok:boolean;providerId?:string;uncertain?:boolean;error?:string}};
  const loader={loadSignatureReport:async()=>db.tables.claims.map(c=>({claimId:c.id,state:h.signed?'signed':'verify',agentId:'agent',agentName:'Test Agent'}))};
  const server=compile('firm-review-server.ts',{'@/lib/supabase-server':{},'./firm-review-access':access,'./intake-render':{},'./imported-packet':{},'./matter':{},
    './mva-call/signing-matter':{},'./mva-call/esign':{},'./signed-docs':{},'./mva-call/client-signed':{},'./signature-report-loader':loader});
  const workflow=compile('signed-decline-workflow.ts',{'./signature-report-loader':loader,'./signed-decline':decline,'./firm-review-access':access,
    './claim-status':{setClaimStatusForLeads:(o:any,d:any)=>setClaimStatusForLeads(o,{...d,audit:async()=>{}})},
    './signed-decline-notification':{...notification,notifySignedDecline:(c:any,retry:boolean)=>notification.notifySignedDecline(c,retry,async(mail:any)=>{h.sends.push(mail);return h.mailResult;})}});
  const common={'next/server':require('next/server'),'next/cache':{revalidatePath(){}},'@/lib/supabase-server':{supabaseServer:async()=>db},
    '@/lib/gate':{gateUser:async()=>h.role?{id:'owner',role:h.role,firmId:h.firmId,name:'Synthetic Owner',can:()=>h.capability}:null},
    '@/lib/firm-review-access':access,'@/lib/firm-review-server':server,'@/lib/signed-decline-workflow':workflow,
    '@/lib/signed-decline':decline,'@/lib/alerts':{invalidateAlertCache(){}}};
  const owner=compile('../app/api/owner-firm-review/route.ts',common);
  const bmc=compile('../app/api/signed-decline/route.ts',common);
  const firm=compile('../app/api/firm-review/route.ts',{...common,'@/lib/matter':require('./matter'),'@/lib/linked-files':require('./linked-files'),
    '@/lib/firm-review-server':{...server,reviewerContext:async()=>h.reviewer?{db,scope:h.scope,campaign:'INNO MVA',user:{id:'reviewer',email:'reviewer@example.test'}}:null}});
  const req=(kind:'owner'|'bmc'|'firm',body?:any)=>new NextRequest('https://claimreach.test/api/'+({owner:'owner-firm-review',bmc:'signed-decline',firm:'firm-review'}[kind])+(body?'':'?claim='+OUTCOME_ID),
    body?{method:'POST',headers:{origin:'https://claimreach.test','content-type':'application/json'},body:JSON.stringify(body)}:{});
  const body=(source:'bmc'|'firm'='firm')=>({claim:OUTCOME_ID,confirm:true,action:source==='bmc'?'decline':'turned_down',explanation:'Synthetic treatment gap',reason:'Synthetic treatment gap',version:claim.updated_at,to:'firm@example.test'});
  return Object.assign(h,{owner,bmc,firm,req,body,workflow,server});
}
