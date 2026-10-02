import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const source = fs.readFileSync(path.join(__dirname, "useFieldAutosave.ts"), "utf8");
const code = ts.transpileModule(source.slice(source.indexOf("function same"), source.indexOf("export function useFieldAutosave")) + "\nreturn makeAutosave;", {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const makeAutosave = new Function(code)();
function harness(send: (patch: any) => Promise<void>) {
  const state = { error: "", pending: 0, saving: false, saved: 0 };
  const api = makeAutosave({phone: "old", email: "old"}, {current:{delay:60_000, send}}, {
    setValues() {}, setPending(n:number){state.pending=n;}, setSaving(b:boolean){state.saving=b;},
    setError(s:string){state.error=s;}, setSavedAt(){state.saved++;},
  });
  return {api, state};
}
async function main() {
  const sent:any[]=[];
  const a=harness(async patch=>{sent.push(patch);});
  a.api.edit({phone:"new"});
  assert.equal(await a.api.flushAndWait(),true);
  assert.deepEqual(sent,[{phone:"new"}]);
  let release!:()=>void;
  const b=harness(async patch=>{sent.push(patch); if(patch.phone==="first") await new Promise<void>(r=>{release=r;});});
  b.api.edit({phone:"first"},true);
  b.api.edit({phone:"second"});
  const waiting=b.api.flushAndWait(); release();
  assert.equal(await waiting,true);
  assert.deepEqual(sent.slice(-2),[{phone:"first"},{phone:"second"}]);
  let fail=true;
  const c=harness(async()=>{if(fail)throw Error("Save failed");});
  c.api.edit({phone:"unsaved"});
  assert.equal(await c.api.flushAndWait(),false);
  assert.equal(c.state.pending,1); assert.equal(c.state.saved,0); assert.equal(c.state.error,"Save failed");
  fail=false; assert.equal(await c.api.flushAndWait(),true); assert.equal(c.state.pending,0);
  console.log("Contact autosave flush, concurrent edits, failure and retry passed");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
