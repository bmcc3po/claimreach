import assert from 'node:assert/strict'; import {test} from 'node:test';
import {outcomeHarness,OUTCOME_ID,OUTCOME_FIRM,OUTCOME_CAMP} from './signed-outcome-test-harness';
import {reviewState,releasedToReviewer} from './firm-review-access';
import {signedDecline,declineOutcome} from './signed-decline';
import {resolveFileStatus} from './statuses';
import {buildDeskQueues} from './mva-call/desk-queue';

test('BMC, owner firm decline and restricted reviewer decline agree on status, email, history and queue',async()=>{
  for(const kind of ['bmc','owner','firm'] as const){
    const h=outcomeHarness(),original={sent:h.claim.firm_sent_at,receipt:h.claim.firm_send_result,signed:h.lead.signed_at};
    const r=await h[kind].POST(h.req(kind,h.body(kind==='bmc'?'bmc':'firm')));const result=await r.json();
    assert.equal(r.status,200,JSON.stringify(result));assert.equal(result.notification.state,'sent');
    assert.equal(h.claim.status,'signed_dropped');assert.equal(resolveFileStatus(h.claim).label,'Signed and declined');
    const d=signedDecline(h.claim)!;assert.equal(declineOutcome(d),kind==='bmc'?'BMC declined':'Firm declined');
    assert.equal(d.agentName,'Test Agent');assert.equal(h.sends.length,1);assert.equal(h.sends[0].to,'firm@example.test');
    assert.match(h.sends[0].html,new RegExp(declineOutcome(d)));assert.deepEqual(h.claim.answers.mva_call,{story:'Preserve this story'});
    assert.deepEqual({sent:h.claim.firm_sent_at,receipt:h.claim.firm_send_result,signed:h.lead.signed_at},original);
    const review=reviewState(h.db.tables.lead_activity,h.claim);
    assert.equal(review.decision,kind==='bmc'?null:'turned_down');
    assert.ok(releasedToReviewer(h.scope,h.claim,h.lead),'already-delivered signed file remains in firm inbox');
    const queues=buildDeskQueues({leads:[{...h.lead,claims:[h.claim]}],calls:[],agreements:[{id:'sig',firm_id:OUTCOME_FIRM,lead_id:'lead',claim_id:OUTCOME_ID,campaign_id:OUTCOME_CAMP,status:'signed'}],
      campaignIds:[OUTCOME_CAMP],statuses:[],holds:new Map(),acquisitionReady:true});
    assert.equal(Object.values(queues).flat().length,0);
    const duplicate=await h[kind].POST(h.req(kind,h.body(kind==='bmc'?'bmc':'firm')));assert.equal(duplicate.status,200);
    assert.equal(h.sends.length,1,'duplicate submission must not email twice');
    assert.equal(h.db.tables.lead_activity.filter(e=>e.meta.event==='firm_file_review').length,kind==='bmc'?0:1);
    if(kind==='firm')assert.ok(h.db.tables.lead_activity.every(e=>e.actor==null),'reviewer auth ID is not an app_users actor FK');
  }
});
test('unsigned, stale, wrong campaign/firm, missing confirmation, archive and invalid recipient do not send',async()=>{
  for(const kind of ['owner','firm'] as const)for(const change of ['unsigned','stale','no-confirm','archive','bad-email','foreign'] as const){
    const h=outcomeHarness();const body=h.body();
    if(change==='unsigned')h.signed=false;if(change==='stale')body.version='stale';if(change==='no-confirm')body.confirm=false;
    if(change==='archive')h.lead.archived_at='2026-10-02';if(change==='bad-email')h.db.tables.campaigns[0].firm_email='invalid';
    if(change==='foreign')h.lead.firm_id='foreign';
    const r=await h[kind].POST(h.req(kind,body));assert.ok(r.status>=400,kind+' '+change);assert.equal(h.sends.length,0);assert.equal(h.claim.status,'delivered');
  }
  const h=outcomeHarness();h.scope.campaignId='foreign';assert.equal((await h.firm.POST(h.req('firm',h.body()))).status,404);
  h.scope.campaignId=OUTCOME_CAMP;h.scope.firmId='foreign';assert.equal((await h.firm.POST(h.req('firm',h.body()))).status,404);
});
test('a BMC decline before delivery stays outside firm inbox and cannot be silently approved',async()=>{
  const h=outcomeHarness();h.claim.status='signed_qa';
  assert.equal((await h.bmc.POST(h.req('bmc',h.body('bmc')))).status,200);
  assert.equal(releasedToReviewer(h.scope,h.claim,h.lead),false);
  assert.equal(await h.server.reviewerFile(h.db,h.scope,OUTCOME_ID),null);
  const delivered=outcomeHarness();await delivered.owner.POST(delivered.req('owner',delivered.body()));
  for(const kind of ['owner','firm'] as const)assert.equal((await delivered[kind].POST(delivered.req(kind,{...delivered.body(),action:'accepted'}))).status,409);
  assert.equal(delivered.claim.status,'signed_dropped');
});
test('claim failure saves no outcome/email; failed activity can repair without duplicate outcome or mail',async()=>{
  const h=outcomeHarness();h.db.failOn=o=>o.table==='claims'&&o.kind==='update'?'write failed':null;
  assert.equal((await h.owner.POST(h.req('owner',h.body()))).status,409);assert.equal(h.claim.status,'delivered');
  assert.equal(h.db.tables.lead_activity.length,0);assert.equal(h.sends.length,0);
  h.db.failOn=o=>o.table==='lead_activity'&&o.kind==='insert'?'audit failed':null;
  assert.equal((await h.owner.POST(h.req('owner',h.body()))).status,503);assert.equal(h.claim.status,'signed_dropped');assert.equal(h.sends.length,0);
  assert.equal(reviewState([],h.claim).decision,'turned_down','atomic snapshot supplies decision after partial history failure');
  h.db.failOn=()=>null;assert.equal((await h.owner.POST(h.req('owner',h.body()))).status,200);assert.equal(h.sends.length,1);
  assert.equal(h.db.tables.lead_activity.filter(e=>e.meta.event==='firm_file_review').length,1);
});
test('failed mail retry keeps outcome source and recipient; uncertain sends never repeat',async()=>{
  for(const uncertain of [false,true]){
    const h=outcomeHarness();h.mailResult={ok:false,error:'Synthetic provider failure',uncertain};
    const first=await h.owner.POST(h.req('owner',h.body()));assert.equal(first.status,200);assert.equal(h.claim.status,'signed_dropped');
    h.db.tables.campaigns[0].firm_email='changed@example.test';h.mailResult={ok:true};
    assert.equal((await h.bmc.POST(h.req('bmc',{...h.body('bmc'),action:'retry_email'}))).status,200);
    assert.equal(h.sends.length,uncertain?1:2);assert.equal(h.sends.at(-1).to,'firm@example.test');
    assert.equal(signedDecline(h.claim)?.source,'firm');
  }
});
test('concurrent BMC and firm decisions cannot overwrite the winner or send twice',async()=>{
  const h=outcomeHarness();
  const results=await Promise.all([h.bmc.POST(h.req('bmc',h.body('bmc'))),h.owner.POST(h.req('owner',h.body()))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(h.sends.length,1);
  const d=signedDecline(h.claim)!;
  assert.match(h.sends[0].html,new RegExp(declineOutcome(d)));
  assert.equal(h.claim.status,'signed_dropped');
});
