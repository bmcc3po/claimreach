import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as payroll from '../lib/payroll';

function fixture(initial='ok') {
  let cursor=0, tree:any, mode=initial;const slots:any[]=[],writes:any[]=[];
  const file:any={claimId:'synthetic',leadId:'lead',firmId:'firm',campaignId:'inno',campaign:'INNO MVA',firm:'Synthetic Firm',leadNo:'TEST',name:'Synthetic client',href:'#',state:'signed',signedAt:'2026-10-02T18:00:00Z',ownerSent:true,agent:'Original agent',agentId:'agent'};
  const report=payroll.payrollReport([file],[],[],'2026-10-04','2026-10-07T18:00:00Z');
  const view={...report,sections:[{firm:{id:'firm',name:'Synthetic Firm'},closedAt:null,report}],agents:[],lines:[],notes:[],token:'synthetic'};
  const hooks={useState(v:any){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],(next:any)=>slots[i]=typeof next==='function'?next(slots[i]):next];},useRef(v:any){const i=cursor++;return slots[i]||=({current:v});}};
  const fetchMock=async(_url:string,init:any)=>{
    if(!init?.method)return {ok:true,json:async()=>mode==='badRefresh'?{}:view};
    writes.push(JSON.parse(init.body));if(mode==='network')throw Error('Synthetic network failure');
    return {ok:mode!=='server'&&mode!=='falseOk',json:async()=>{
      if(mode==='malformed')throw SyntaxError('HTML');if(mode==='empty')return {};if(mode==='server'||mode==='errorOk')return {ok:true,error:'Synthetic failure'};
      return {ok:true};
    }};
  };
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'Payroll.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:any={};new Function('require','exports','fetch',code)((id:string)=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id==='@/lib/payroll'?payroll:{},exports,fetchMock);
  const render=()=>{cursor=0;tree=exports.default({initial:view});};
  const nodes=(root:any=tree):any[]=>!root||typeof root!=='object'?[]:Array.isArray(root)?root.flatMap(n=>nodes(n??null)):[root,...nodes(root.props?.children??null)];
  const text=(root:any=tree):string=>root==null||typeof root==='boolean'?'':typeof root!=='object'?String(root):Array.isArray(root)?root.map(n=>text(n??null)).join(''):text(root.props?.children??null);
  const button=(name:string)=>nodes().find(n=>n.type==='button'&&text(n)===name);
  const flush=async()=>{await new Promise(r=>setImmediate(r));render();};
  const begin=()=>{button('Manage').props.onClick();render();nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'Attorney reviewing synthetic facts'}});render();};
  render();return{render,nodes,text,button,flush,begin,writes,mode:(v:string)=>mode=v};
}

async function main(){
  for(const mode of ['server','network','malformed','empty','falseOk','errorOk']){
    const f=fixture(mode);f.begin();const save=f.button('Save change').props.onClick;save();save();f.render();
    assert.equal(f.nodes().find(n=>n.type==='fieldset').props.disabled,true);await f.flush();assert.equal(f.writes.length,1);
    assert.equal(f.nodes().find(n=>n.type==='textarea').props.value,'Attorney reviewing synthetic facts');
    assert.ok(f.nodes().find(n=>n.props?.role==='alert'));assert.doesNotMatch(f.text(),/Saved\. Payroll/);
    f.mode('ok');f.button('Save change').props.onClick();await f.flush();assert.match(f.text(),/Saved\. Payroll totals/);assert.equal(f.nodes().some(n=>n.type==='textarea'),false);
    const g=fixture(mode);g.button('Review & close period').props.onClick();g.render();assert.equal(g.writes.length,0);
    assert.equal(g.button('Close period & save payroll').props.disabled,true);
    g.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});g.render();
    const close=g.button('Close period & save payroll').props.onClick;close();close();await g.flush();
    assert.equal(g.writes.length,1);assert.equal(g.writes[0].op,'close');assert.ok(g.button('Close period & save payroll'));
    assert.ok(g.nodes().find(n=>n.props?.role==='alert'));assert.doesNotMatch(g.text(),/Period closed\./);
  }
  const f=fixture('badRefresh');f.begin();f.button('Save change').props.onClick();await f.flush();
  assert.match(f.text(),/change saved, but the refreshed totals could not load/);assert.match(f.text(),/Synthetic client/);
  assert.equal(f.nodes().find(n=>n.type==='fieldset').props.disabled,false);
  const g=fixture('badRefresh');g.button('Refresh').props.onClick();await g.flush();assert.match(g.text(),/Could not confirm the payroll list/);assert.match(g.text(),/Synthetic client/);
  console.log('Payroll UI: confirmed writes only, draft retention, duplicate-write guards, close confirmation and failed-refresh preservation passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
