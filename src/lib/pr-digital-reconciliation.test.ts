import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historicalSignatureDate } from './historical-signature';
import { publicFirmOutcomeAudit } from './partner-firm-outcome-audit';
import { partnerReportData,partnerAllowedLeads,partnerReceivedDate } from './partner-report';
import { partnerReportHarness } from './partner-report-test-harness';
import { resolveFileStatus } from './statuses';

test('certificate date needs exact same-matter original hash and owner event',()=>{
 const c:any={id:'c',lead_id:'l',firm_id:'f',answers:{signature_date_audit:{claim_id:'c',source:'signed_original_certificate',signed_date:'2026-09-24',certificate_signed_at:'2026-09-24T21:49:46Z',certificate_sha256:'sha',original_event_id:'doc',owner_event_id:'owner'}}};
 const doc={id:'doc',lead_id:'l',firm_id:'f',meta:{claim_id:'c',sha256:'sha'}};
 const owner={id:'owner',lead_id:'l',firm_id:'f',meta:{claim_id:'c'}};
 assert.equal(historicalSignatureDate(c,[doc],[owner]),'2026-09-24T21:49:46Z');
 c.answers.signature_date_audit.certificate_signed_at='2026-09-25T08:00:00Z';
 assert.equal(historicalSignatureDate(c,[doc],[owner]),null);
 c.answers.signature_date_audit.certificate_signed_at='2026-09-24T21:49:46Z';
 assert.equal(historicalSignatureDate(c,[{...doc,meta:{claim_id:'sibling',sha256:'sha'}}],[owner]),null);
 assert.equal(historicalSignatureDate(c,[{...doc,meta:{claim_id:'c',sha256:'other'}}],[owner]),null);
 assert.equal(historicalSignatureDate(c,[doc],[]),null);
});
test('approved roster date remains date-only and cannot cross source identity or firm',()=>{
 const receipt={source:'approved_partner_roster',partner_key:'pr-digital',source_lead_id:'123',firm_id:'f',received_date:'2026-09-24'};
 const l={firm_id:'f',lawruler_ref_no:'123',source_system:'lawruler',vendor_fields:{partner_receipt_audit:receipt}};
 assert.equal(partnerReceivedDate(l),'2026-09-24');
 assert.equal(partnerReceivedDate({...l,firm_id:'other'}),null);
 assert.equal(partnerReceivedDate({...l,lawruler_ref_no:'other'}),null);
});
test('calendar countdown, notice and archive intervals stay separate at day 30 and after',()=>{
 const a={firm_outcome_audit:{phase:'Archived',phase_date:'2026-11-09',notice_date:'2026-10-27'}};
 const r=publicFirmOutcomeAudit(a,'2026-10-21T21:23:20Z','2026-11-19T20:00:00Z');
 assert.equal(r.remainingDays,1);assert.equal(r.daysToNotice,6);assert.equal(r.daysToArchive,19);
 assert.equal(publicFirmOutcomeAudit(a,'2026-10-21','2026-11-20').remainingDays,0);
 assert.equal(publicFirmOutcomeAudit(a,null,'2026-11-20').remainingDays,null);
 const historical=publicFirmOutcomeAudit({firm_outcome_audit:{phase:'Archived',notice_date:'2026-11-04'}},'2026-09-24','2026-11-19');
 assert.equal(historical.daysToNotice,41);
});
test('firm archive, pending drop and pre-sign qualification conflict have consistent display without writes',()=>{
 assert.match(resolveFileStatus({status:'delivered',answers:{firm_outcome_audit:{phase:'Archived'}}}).label,/Firm archived/);
 assert.match(resolveFileStatus({status:'delivered',answers:{firm_outcome_audit:{phase:'Pending Drop'}}}).label,/pending drop/);
 assert.equal(resolveFileStatus({status:'contacting',qualification:'dq'}).key,'external_dq_review');
 assert.equal(resolveFileStatus({status:'dq'},undefined,true).label,'Signed and declined');
 assert.match(resolveFileStatus({status:'delivered',answers:{firm_outcome_audit:{reported_decline:true}}}).label,/reported decline/);
});
test('linked signed claimants do not inflate incoming leads; foreign or unapproved parents grant nothing',async()=>{
 const h=await partnerReportHarness(); h.lead.id='11111111-1111-4111-8111-111111111111';h.claim.lead_id=h.lead.id;
 const child={...h.lead,id:'child',claimant_name:'Example Additional',external_id:h.lead.id+':pax:child',lawruler_ref_no:null};
 const cc={...h.claim,id:'child-claim',lead_id:child.id};
 const sig={...h.signature,claimId:cc.id};
 const r=partnerReportData(h.config,[h.lead,child],[h.claim,cc],[h.signature,sig],h.refs);
 assert.equal(r.rows.length,2);assert.equal(r.summary.total,1);assert.equal(r.summary.signed,1);assert.equal(r.summary.signedClaims,2);assert.equal(r.summary.additionalClaimants,1);
 assert.equal(partnerAllowedLeads(h.config,[h.lead,{...child,firm_id:'other'}],h.refs).length,1);
 assert.equal(partnerAllowedLeads(h.config,[h.lead,child],[]).length,0);
});
test('private commercial notes never enter partner JSON or exports',async()=>{
 const h=await partnerReportHarness(); const notes=[{firm_id:h.config.firm_id,lead_id:h.lead.id,claim_id:h.claim.id,scope:'file',created_at:'2026-11-19',body:'private canary invoice internal price 2,000'}];
 const r=partnerReportData(h.config,[h.lead],[h.claim],[h.signature],h.refs,{notes});
 assert.equal(r.rows[0].notes,null);assert.equal(JSON.stringify(r).includes('private canary'),false);
});

test('live loader resolves primary pre-sign DQ keys from the current catalog, including historical reasons',async()=>{
 const h=await partnerReportHarness();
 h.claim.status='dq';h.claim.qualification='dq';
 h.state.signatures=[{...h.signature,state:'unsigned',disqualified:true}];
 h.db.tables.dq_reasons=[{key:'at_fault',label:'Caller at fault',active:false},{key:'treatment_gap',label:'30+ day treatment gap'}];
 for (const [key,label] of [['at_fault','Caller at fault'],['treatment_gap','30+ day treatment gap'],['declined','Declined, not interested'],['missing','Reason not documented']]) {
  h.claim.dq_reason_key=key;
  const r=await h.server.loadPartnerReport(h.db,h.config);
  assert.equal(r.rows[0].dqReason,label);
 }
 h.state.signatures=[h.signature];
 assert.equal((await h.server.loadPartnerReport(h.db,h.config)).rows[0].dqReason,null,'post-sign outcomes do not acquire a pre-sign DQ reason');
 h.db.failOn=op=>op.table==='dq_reasons'?'catalog unavailable':null;
 await assert.rejects(()=>h.server.loadPartnerReport(h.db,h.config),/DQ reasons unavailable/);
});
