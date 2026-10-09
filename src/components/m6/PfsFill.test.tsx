import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as pfs from '../../lib/pfs';
import * as questionnaire from '../../lib/questionnaire';

function fixture(mode='ok') {
  let cursor=0, tree:any;
  const slots:any[]=[], writes:any[]=[], pending:Array<(v:any)=>void>=[], timers=new Map<number,Function>();let timerId=0;
  const hooks={
    useState(value:any){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(value:any){const i=cursor++;return slots[i]||=({current:value});},
    useEffect(){cursor++;},useMemo(fn:Function){return fn();},
  };
  const reply=(m:string)=>({ok:m!=='server'&&m!=='falseOk',json:async()=>{
    if(m==='malformed')throw SyntaxError('HTML');if(m==='empty')return {};if(m==='server'||m==='errorOk')return {ok:true,error:'Synthetic failure'};return {ok:true};
  }});
  const fetchMock=async(_url:string,init:any)=>{
    writes.push(JSON.parse(init.body));
    if(mode==='network')throw Error('network');
    if(mode==='deferred')return new Promise(resolve=>pending.push(resolve));
    return reply(mode);
  };
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'PfsFill.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:any={};
  new Function('require','exports','fetch','setTimeout','clearTimeout',code)((id:string)=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id==='@/lib/pfs'?pfs:id==='@/lib/questionnaire'?questionnaire:{__esModule:true,default:()=>null},exports,fetchMock,(fn:Function)=>{timers.set(++timerId,fn);return timerId;},(id:number)=>timers.delete(id));
  const render=()=>{cursor=0;tree=exports.default({leadId:'synthetic',leadName:'SYNTHETIC',leadNo:'TEST',claimId:'synthetic-claim',fields:[{id:'pfs_first',kind:'text',label:'First'},{id:'pfs_second',kind:'text',label:'Second'}],initialAnswers:{}});};
  const nodes=(root:any=tree):any[]=>!root||typeof root!=='object'?[]:Array.isArray(root)?root.flatMap(x=>nodes(x??null)):[root,...nodes(root.props?.children??null)];
  const text=(root:any=tree):string=>root==null||typeof root==='boolean'?'':typeof root!=='object'?String(root):Array.isArray(root)?root.map(x=>text(x??null)).join(''):text(root.props?.children??null);
  const field=()=>nodes().find(n=>n.props?.field);
  const button=()=>nodes().find(n=>n.type==='button'&&['Next','Save','Saving','Retry save'].includes(text(n)));
  const edit=(v:string)=>{field().props.onChange(v);render();};
  const flush=async()=>{await new Promise(r=>setImmediate(r));render();};
  const autosave=()=>{const fns=[...timers.values()];timers.clear();fns.forEach(fn=>fn());};
  render();return {render,field,button,edit,flush,autosave,text,nodes,writes,mode:(v:string)=>mode=v,resolve:(m='ok')=>pending.shift()!(reply(m))};
}

async function main(){
  for(const mode of ['server','network','malformed','empty','falseOk','errorOk']){
    const f=fixture(mode);f.edit('Original answer');const next=f.button().props.onClick;next();next();await f.flush();
    assert.equal(f.writes.length,1,'double tap must not submit twice');assert.equal(f.field().props.field.id,'pfs_first','failed save must not advance');assert.equal(f.field().props.value,'Original answer');assert.match(f.text(),/Synthetic failure|Could not confirm/);assert.doesNotMatch(f.text(),/Answers saved/);
    f.mode('ok');f.button().props.onClick();await f.flush();assert.equal(f.field().props.field.id,'pfs_second');assert.match(f.text(),/Answers saved/);
  }
  const f=fixture('deferred');f.edit('Old answer');f.autosave();await f.flush();f.edit('Latest answer');f.autosave();await f.flush();assert.equal(f.writes.length,1,'autosaves serialize');
  f.resolve();await f.flush();assert.equal(f.writes.length,2);assert.equal(f.writes[1].answers.pfs_first,'Latest answer');assert.doesNotMatch(f.text(),/Answers saved/,'old completion must not mark newer draft saved');f.resolve();await f.flush();assert.match(f.text(),/Answers saved/);
  const g=fixture('deferred');const set=g.field().props.onSetField;set('pfs_first','City');set('pfs_second','State');g.render();g.autosave();await g.flush();assert.deepEqual(g.writes[0].answers,{pfs_first:'City',pfs_second:'State'},'same-event capture updates are not lost');g.resolve();await g.flush();
  const h=fixture('deferred');h.edit('Manual');h.button().props.onClick();h.render();assert.equal(h.nodes().find(n=>n.type==='fieldset').props.disabled,true);h.edit('Must not overwrite');await h.flush();assert.equal(h.field().props.value,'Manual');h.resolve();await h.flush();
  console.log('Questionnaire: failed saves stay on question; ordered snapshots, same-event fields, draft retention, retry and duplicate guard passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
