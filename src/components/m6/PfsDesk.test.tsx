import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as pfs from '../../lib/pfs';

function fixture(initial='ok') {
  let cursor=0, tree:any, mode=initial;const slots:any[]=[],writes:any[]=[];
  const fields=[{id:'pfs_first',kind:'text',scope:'lead',label:'First synthetic question'},{id:'pfs_second',kind:'text',scope:'lead',label:'Second synthetic question'}];
  const hooks={useState(v:any){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],(next:any)=>slots[i]=typeof next==='function'?next(slots[i]):next];},useRef(v:any){const i=cursor++;return slots[i]||=({current:v});},useMemo(fn:Function){return fn();}};
  const fetchMock=async(_url:string,init:any)=>{
    const body=JSON.parse(init.body);writes.push(body);if(mode==='network')throw Error('network');
    return {ok:mode!=='server'&&mode!=='falseOk',json:async()=>{
      if(mode==='malformed')throw SyntaxError('HTML');if(mode==='empty')return {};if(mode==='missingFields')return {ok:true};if(mode==='server'||mode==='errorOk')return {ok:true,error:'Synthetic failure'};
      return {ok:true,fields:init.method==='DELETE'?fields.filter(f=>f.id!==body.id):fields};
    }};
  };
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'PfsDesk.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:any={};new Function('require','exports','fetch','window',code)((id:string)=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id==='@/lib/pfs'?pfs:{__esModule:true,default:()=>null},exports,fetchMock,{confirm(){throw Error('Native confirm is not permitted in this flow');}});
  const render=()=>{cursor=0;tree=exports.default({form:{name:'Synthetic questionnaire',fields},canImport:true});};
  const nodes=(root:any=tree):any[]=>!root||typeof root!=='object'?[]:Array.isArray(root)?root.flatMap(n=>nodes(n??null)):[root,...nodes(root.props?.children??null)];
  const text=(root:any=tree):string=>root==null||typeof root==='boolean'?'':typeof root!=='object'?String(root):Array.isArray(root)?root.map(n=>text(n??null)).join(''):text(root.props?.children??null);
  const button=(name:string)=>nodes().find(n=>n.type==='button'&&text(n)===name);
  const flush=async()=>{await new Promise(r=>setImmediate(r));render();};
  const begin=()=>{button('Add a question').props.onClick();render();nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'Synthetic unsaved question'}});render();};
  const importFile=(reject=false)=>{button('Import CSV').props.onClick();render();const input=nodes().find(n=>n.type==='input'&&n.props.type==='file');input.props.onChange({currentTarget:{files:[{name:'synthetic.csv',text:async()=>{if(reject)throw Error('unreadable');return 'question,type\nSynthetic,text';}}],value:'synthetic.csv'}});};
  render();return{render,nodes,text,button,flush,begin,importFile,writes,mode:(v:string)=>mode=v};
}

async function main(){
  for(const mode of ['server','network','malformed','empty','missingFields','falseOk','errorOk']){
    const f=fixture(mode);f.begin();const save=f.button('Add question').props.onClick;save();save();f.render();assert.equal(f.nodes().find(n=>n.type==='fieldset').props.disabled,true);await f.flush();assert.equal(f.writes.length,1);assert.equal(f.nodes().find(n=>n.type==='textarea').props.value,'Synthetic unsaved question');assert.match(f.text(),/Synthetic failure|Could not confirm/);assert.doesNotMatch(f.text(),/Question added/);f.mode('ok');f.button('Add question').props.onClick();await f.flush();assert.match(f.text(),/Question added/);assert.equal(f.nodes().some(n=>n.type==='textarea'),false);
    const g=fixture(mode);g.button('Delete').props.onClick();g.render();assert.equal(g.writes.length,0,'delete only opens inline confirmation');g.button('Keep question').props.onClick();g.render();assert.equal(g.writes.length,0);g.button('Delete').props.onClick();g.render();const remove=g.button('Remove question').props.onClick;remove();remove();await g.flush();assert.equal(g.writes.length,1);assert.ok(g.button('Remove question'));assert.match(g.text(),/First synthetic question/);assert.doesNotMatch(g.text(),/Question removed/);g.mode('ok');g.button('Remove question').props.onClick();await g.flush();assert.match(g.text(),/Question removed/);assert.doesNotMatch(g.text(),/First synthetic question/);
    const h=fixture(mode);h.importFile();await h.flush();assert.match(h.text(),/Synthetic failure|Could not/);assert.doesNotMatch(h.text(),/Saved \d+ questions/);assert.ok(h.nodes().find(n=>n.props?.type==='file'));
  }
  const f=fixture();f.importFile(true);f.render();assert.equal(f.nodes().find(n=>n.props?.type==='file').props.disabled,true);await f.flush();assert.equal(f.writes.length,0);assert.match(f.text(),/Could not read the file/);assert.equal(f.nodes().find(n=>n.props?.type==='file').props.disabled,false);
  console.log('Questionnaire editor: failed/unknown saves retain drafts, pending controls, duplicate guards, readable import failures and inline removal confirmation passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
