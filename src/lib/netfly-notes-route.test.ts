import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "./test-fake-db";
import * as suggestions from "./netfly-note-suggestions";
import * as ontake from "./netfly-ontake";
const notes = "No treatment yet. Home near 30303.";
const db = new FakeDb({ claims: [
  {id:"claim",lead_id:"lead",firm_id:"firm",campaign_id:"netfly",updated_at:"2026-10-02T00:00:00Z",answers:{netfly_secondary:{fields:{final_notes:notes},handoffs:[{note:"Original"}]}}},
  {id:"foreign",lead_id:"other",firm_id:"other",campaign_id:"netfly",answers:{private:true}},
] });
let allowed = true, requested: any, transport: any, reply = JSON.stringify({suggestions:[{id:"seen_doctor",value:"No",evidence:"No treatment yet"},{id:"treatment_area",value:"30303",evidence:"Home near 30303"}]});
const modules: Record<string, any> = {
 "next/server":{NextResponse:{json:(body:any,o:any={})=>({body,status:o.status||200})}},
 "@/lib/netfly-server":{netflyContext:async()=>({actor:{id:"agent",can:()=>allowed},db,campaign:{id:"netfly",firm_id:"firm"}}),netflyMatter:async(_:any,key:string)=>key==="lead"?{lead:{id:"lead"},claim:db.tables.claims[0]}:null},
 "@/lib/netfly-ontake":ontake,
 "@/lib/netfly-note-suggestions":suggestions,
 "@/lib/ai-relay":{askRelay:async(_:string, payload:string, _signal:AbortSignal, options:any)=>{requested=JSON.parse(payload);transport=options;return reply}},
};
const compiled=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,"../app/api/netfly/notes/route.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const route:any={};
new Function("require","exports",compiled)((id:string)=>{assert.ok(modules[id],id);return modules[id]},route);
const post=(extra:any={})=>route.POST({json:async()=>({file:"lead",notes,op:"suggest",...extra})});
async function main(){
 allowed=false;assert.equal((await post()).status,403);allowed=true;
 assert.equal((await post({file:"foreign"})).status,404);
 assert.equal((await post({notes:notes+" changed"})).status,409);
 const plan=await post();assert.equal(plan.body.suggestions.length,2);assert.equal(db.tables.claims[0].answers.netfly_secondary.fields.seen_doctor,undefined);
 assert.deepEqual(transport,{preferProxy:true});assert.equal(requested.notes,notes);
 db.tables.claims[0].answers.netfly_secondary.fields.seen_doctor="Yes";
 const applied=await post({op:"apply",suggestions:plan.body.suggestions});assert.deepEqual(applied.body.applied,["treatment_area"]);
 assert.equal(applied.body.fields.seen_doctor,"Yes");assert.equal(applied.body.fields.final_notes,notes);
 assert.deepEqual(db.tables.claims[1].answers,{private:true});
 assert.equal(db.tables.claims[0].answers.netfly_secondary.handoffs[0].note,"Original");
 assert.equal((await post({op:"apply",suggestions:plan.body.suggestions})).body.applied.length,0,"replay does not overwrite");
 reply="";assert.equal((await post()).status,503);
 assert.ok(!requested.fields.some((f:any)=>f.id==="seen_doctor"),"do not ask the model to re-extract answered questions");
 reply="not JSON";assert.equal((await post()).status,502);
 db.tables.claims[0].answers.netfly_secondary.fields.treatment_area="";
 db.failOn=op=>op.kind==="update"?"offline":null;
 assert.equal((await post({op:"apply",suggestions:plan.body.suggestions})).status,503);
 assert.equal(db.tables.claims[0].answers.netfly_secondary.fields.treatment_area,"");
 console.log("NETFLY notes route: authorization, stale notes, protected answers, tenant scope, replay and failure checks passed");
}
void main().catch(e=>{console.error(e);process.exitCode=1});


