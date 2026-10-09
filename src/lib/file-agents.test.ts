import assert from 'node:assert/strict';
import { intakeAgentName, loadIntakeAgents } from './file-agents';
import { FakeDb } from './test-fake-db';
(async () => {
  const users = [{id:'intake',full_name:'Intake One'},{id:'assigned',full_name:'Other Agent'},{id:'viewer',full_name:'Owner Viewer'}];
  const lead={intake_agent_id:'intake',assigned_agent:'assigned',created_by:'viewer'};
  assert.equal(intakeAgentName(lead,users),'Intake One');
  assert.equal(intakeAgentName({...lead,intake_agent_id:null},users),'Not recorded');
  assert.equal(intakeAgentName({...lead,intake_agent_id:'missing'},users),'Not recorded');
  assert.deepEqual(await loadIntakeAgents(new FakeDb({app_users:users}),[lead,lead]),[users[0]]);
  assert.deepEqual(await loadIntakeAgents({from(){throw Error('Must not query without saved IDs')}},[]),[]);
  await assert.rejects(loadIntakeAgents({from(){return {select(){return {in(){return {error:{message:'offline'}}}}}}}},[lead]),/Could not load intake agent/);
  const ids=Array.from({length:201},(_,i)=>({intake_agent_id:`agent${i}`})); const batches:number[]=[];
  await loadIntakeAgents({from(){return {select(){return {in(_key:string,values:string[]){batches.push(values.length);return {data:[]}}}}}}},ids);
  assert.deepEqual(batches,[100,100,1]);
  console.log('Intake agent: saved identity, assignment/viewer isolation, missing values, exact lookup, read failure and chunking passed');
})().catch(e=>{console.error(e);process.exitCode=1});
