import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workArea, inWorkArea, scopeWorkArea, areaHref } from './work-area';
import { fileAgentSummary } from './file-agents';
import { selectExportMatters } from './standard-fields';
test('MVA and other work are complementary; NETFLY stays with MVA', () => {
  for (const type of ['mva', 'netfly_secondary', 'motel_trafficking', 'pi', null]) {
    assert.notEqual(inWorkArea(type, 'mva'), inWorkArea(type, 'other'));
  }
  assert.equal(inWorkArea('netfly_secondary', 'mva'), true);
  assert.equal(workArea('anything'), 'mva');
  assert.equal(areaHref('/queue?view=fix', 'other'), '/queue?view=fix&area=other');
});
test('database view filters include unknown case types only in Other work', () => {
  const calls:any[]=[]; const q={in:(...args:any[])=>{calls.push(args);return q},or:(...args:any[])=>{calls.push(args);return q}};
  scopeWorkArea(q,'mva'); scopeWorkArea(q,'other','claim_type');
  assert.deepEqual(calls,[['case_type',['mva','netfly_secondary']],['claim_type.is.null,claim_type.not.in.(mva,netfly_secondary)']]);
});
test('assignment is labeled separately from the intake and agreement agent', () => {
  const users=[{id:'assigned',full_name:'Alice'},{id:'intake',full_name:'Billy'},{id:'sender',full_name:'Charlie'}];
  assert.equal(fileAgentSummary({assigned_agent:'assigned'},users),'Assigned: Alice');
  assert.equal(fileAgentSummary({assigned_agent:'assigned',intake_agent_id:'intake'},users,null,'sender'),'Intake: Billy · Agreement: Charlie · Assigned: Alice');
  assert.equal(fileAgentSummary({},users,'Darlene'),'Last call: Darlene');
  assert.equal(fileAgentSummary({},[]),'Agent not recorded');
});
test('exports partition sibling matters without changing the sole-matter evidence rule', () => {
  const lead={id:'l',firm_id:'f',case_type:'mva'};
  const claims=[{id:'a',lead_id:'l',firm_id:'f',claim_type:'mva'},{id:'b',lead_id:'l',firm_id:'f',claim_type:'motel_trafficking'}];
  const mva=selectExportMatters([lead],claims,{area:'mva'}), other=selectExportMatters([lead],claims,{area:'other'});
  assert.deepEqual(mva.map(r=>r.claim.id),['a']);assert.deepEqual(other.map(r=>r.claim.id),['b']);
  assert.equal(mva[0].sole,false);assert.equal(other[0].sole,false);
});
