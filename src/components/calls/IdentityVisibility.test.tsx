import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { CallEngine } from "../../lib/mva-call/engine";
import * as scripts from "./scripts";
import * as identity from "./SsnDob";

// Render the real three presentation files, identity controls and call engine.
// Only unrelated workspace chrome/question/location widgets are stubbed.
let dobProps: any, ssnProps: any;
const modules: Record<string, any> = {
  react: React, "react/jsx-runtime": jsx, "./scripts": scripts,
  "./SsnDob": {
    DobField: (props: any) => { dobProps=props; return jsx.jsx(identity.DobField,props); },
    SsnField: (props: any) => { ssnProps=props; return jsx.jsx(identity.SsnField,props); },
  },
  "./IntakeQuestion": { default: () => null, QuestionControl: () => null, AgreementRecipient: () => null },
  "./PlaceField": { default: () => null }, "./WhereField": { default: () => null },
  "./FullIntake": { FiBody: () => null }, "./OneQuestion": { GuidedIntake: () => null },
  "./IntakeWorkspace": { WsLeft: () => null, WsHelper: () => null, IxTop: () => null, IxFoot: () => null },
};
function load(name: string): any {
  if (name in modules) return modules[name];
  assert.ok(["./AgreementChoice","./ChoreList","./FormView","./StepByStep","./CallView"].includes(name),`Unexpected import ${name}`);
  const source=fs.readFileSync(path.join(__dirname,`${name}.tsx`),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports: any={}; new Function("require","exports",code)(load,exports);
  return modules[name]=exports;
}
const View=load("./CallView").default;
function engine(status="ready") {
  const e=new CallEngine({callerName:"Synthetic Caller",agentName:"Synthetic Agent",firmSpoken:"Synthetic Firm",
    textFrom:"202-555-0100",startedAt:Date.now(),reasons:{esign:[],callback:[],ni:[],dq:[]},notifyDefaults:[],
    esign:{status,configured:true,pax:{}}} as any,{} as any);
  e.setState({phase:"send",story:{...e.state.story,city:"Las Vegas, NV",when:"Yesterday"}});
  return e;
}
function render(e: CallEngine,view: string,extra: any={}) {
  e.setView(view);
  const v={...e.renderVals(),...extra};
  const html=renderToStaticMarkup(jsx.jsx(View,{v}));
  assert.equal((html.match(/aria-label="Date of birth"/g)||[]).length,1,`${view}: exactly one DOB field`);
  assert.equal((html.match(/aria-label="Social Security number"/g)||[]).length,1,`${view}: exactly one SSN field`);
  return {html,v};
}
let count=0;
for(const view of ["chore","form","guided","full","steps"]) {
  const e=engine();
  const {html}=render(e,view);
  assert.match(html,/DOB and SSN are optional before sending/);
  assert.doesNotMatch(html,/<input[^>]*aria-label="(?:Date of birth|Social Security number)"[^>]*(?:disabled|required)=/);
  if(["chore","form"].includes(view)) assert.ok(html.indexOf('aria-label="Social Security number"')<html.indexOf('>Send the agreement</button>'),`${view}: identity precedes send action`);
  dobProps.onChange("01/01/1990"); ssnProps.onMode("full"); ssnProps.onChange("123456789");
  const switched=render(e,view==="form"?"chore":"form").html;
  assert.match(switched,/aria-label="Date of birth" value="01\/01\/1990"/);
  assert.match(switched,/aria-label="Social Security number" value="123-45-6789"/);
  assert.equal(e.state.file.ssn,"123456789");
  assert.equal(e.persistable().file.ssn,undefined);
  if(view==="steps") assert.match(render(e,"steps").html,/aria-label="Social Security number" value="123-45-6789"/);
  count++; console.log("ok",view,"pre-send identity is editable and survives view switch");
}
for(const view of ["chore","form","guided","full","steps"]) {
  const e=engine("sent"); e.setState({phase:"file"});
  const {html,v}=render(e,view);
  assert.equal(v.agreementLocked,true);
  assert.match(html,/<button[^>]*disabled=""[^>]*>Unlocks after the PNC signs<\/button>/);
  const reviewLocked=render(e,view,{signed:true,agreementLocked:true,completeLabel:"Review signed PDF first"}).html;
  assert.match(reviewLocked,/<button[^>]*disabled=""[^>]*>Review signed PDF first<\/button>/);
  count++; console.log("ok",view,"post-send identity stays editable while completion lock is respected");
}
const retry=()=>{};
const saved=render(engine(),"chore",{identitySavedMode:"full",identityStatus:"Secure identity not saved. Retry.",identitySaveError:true,identityRetry:retry}).html;
assert.match(saved,/Saved securely/); assert.match(saved,/Retry secure save/);
assert.equal(ssnProps.onRetry,retry); assert.equal(ssnProps.savedMode,"full");
assert.match(saved,/disabled=""[^>]*>Last 4 only<\/button>/);
console.log(`${count+1} identity presentation checks passed`);
for (const view of ["chore", "form", "guided", "full", "steps"]) {
  const e = engine("signed"); e.setView(view);
  const html = renderToStaticMarkup(jsx.jsx(View, { v: { ...e.renderVals(), canReplace: true, previewHref: "/synthetic-preview", replaceAgreement: () => { throw new Error("No send during render"); } } }));
  const correction = html.match(/<details\b([^>]*)>[\s\S]*?Correct this agreement[\s\S]*?Report error and send corrected agreement[\s\S]*?<\/details>/);
  assert.ok(correction, `${view}: correction remains reachable in a disclosure`);
  assert.doesNotMatch(correction[1], /\bopen(?:=|\s|$)/, `${view}: correction form is closed until deliberately requested`);
}
console.log("ok all intake layouts keep correction controls available but closed by default");
