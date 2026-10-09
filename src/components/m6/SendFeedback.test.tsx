import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as copy from '../../lib/m6-compose-copy';

type Mode = 'ok' | 'server' | 'network' | 'malformed' | 'empty' | 'falseOk' | 'errorOk';
async function fixture(component: string, initial: Mode) {
  let cursor=0, tree:any, mode=initial, sent=0;
  const slots:any[]=[], effects:Function[]=[], writes:any[]=[];
  const hooks={
    useState(value:any){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(value:any){const i=cursor++;return slots[i]||=( {current:value} );},
    useEffect(fn:Function){const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn);}},
    useMemo(fn:Function){return fn();}, useCallback(fn:Function){return fn;},
  };
  const letter={body:'NONBINDING SYNTHETIC LETTER',missing:[],recipient:{orgName:'Synthetic organization',attention:'Test',address:'Synthetic address'}};
  const fetchMock=async(_url:string,init:any)=>{
    if(!init?.method)return {ok:true,json:async()=>component==='LorSend'?{canSend:true,alreadySent:false,letter,rails:{whatItDoes:'Local test only.'}}:{templates:[{key:'test',name:'Test',body:'Synthetic draft',channel:'sms'}],rails:{justcall:true,resend:true}}};
    writes.push(JSON.parse(init.body));
    if(mode==='network')throw Error('network');
    return {ok:mode!=='server'&&mode!=='falseOk',json:async()=>{
      if(mode==='malformed')throw SyntaxError('HTML');
      if(mode==='empty')return {};
      if(mode==='errorOk')return {ok:true,live:false,error:'Synthetic failure'};
      if(mode==='server')return {error:'Synthetic failure'};
      return component==='LorSend'?{ok:true,live:false}:{ok:true,live:true,send_status:'sent'};
    }};
  };
  const source=fs.readFileSync(path.join(__dirname,`${component}.tsx`),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:any={};
  new Function('require','exports','fetch',code)((id:string)=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id.includes('m6-compose-copy')?copy:id==='./M6Modals'?{ModalShell:()=>null}:{__esModule:true,default:()=>null,lorFactsShowFromMissing:()=>false},exports,fetchMock);
  const render=()=>{cursor=0;tree=exports.default({leadId:'synthetic',onClose:()=>{},onSent:()=>sent++});};
  const nodes=(root:any=tree):any[]=>!root||typeof root!=='object'?[]:Array.isArray(root)?root.flatMap(x=>nodes(x??null)):[root,...nodes(root.props?.children??null)];
  const text=(root:any=tree):string=>root==null||typeof root==='boolean'?'':typeof root!=='object'?String(root):Array.isArray(root)?root.map(x=>text(x??null)).join(''):text(root.props?.children??null);
  const feedback=()=>String(tree.props.err||'')+text();
  const submit=()=>nodes().find(n=>n.type==='button'&&['Send text','Send','Send certified mail'].includes(text(n)));
  const edit=(value:string)=>{nodes().find(n=>n.type==='textarea').props.onChange({target:{value}});render();};
  const flush=async()=>{await new Promise(r=>setImmediate(r));render();};
  render();
  if(component==='TextSend')assert.equal(nodes().find(n=>n.type==='textarea').props.disabled,true,'do not allow typing a draft that the loading script would replace');
  effects.forEach(fn=>fn());await flush();
  if(component!=='LorSend')edit('Synthetic unsaved message');
  return {render,submit,edit,flush,feedback,nodes,writes,mode:(m:Mode)=>mode=m,sent:()=>sent};
}

async function main(){
  for(const component of ['TextSend','ComposePanel','LorSend']){
    for(const mode of ['server','network','malformed','empty','falseOk','errorOk'] as const){
      const f=await fixture(component,mode);f.submit().props.onClick();f.render();
      if(component!=='LorSend')assert.equal(f.nodes().find(n=>n.type==='textarea').props.disabled,true);
      await f.flush();
      assert.match(f.feedback(),/Synthetic failure|Could not confirm/);
      assert.doesNotMatch(f.feedback(),/Sent from|Logged to the timeline|PostGrid test letter created/);
      assert.equal(f.sent(),0);
      if(component!=='LorSend')assert.equal(f.nodes().find(n=>n.type==='textarea').props.value,'Synthetic unsaved message');
      f.mode('ok');f.submit().props.onClick();await f.flush();
      assert.match(f.feedback(),component==='LorSend'?/PostGrid test letter created/:/Sent/);
      if(component==='LorSend')assert.equal(f.sent(),1);
      else {f.edit('Another draft');assert.doesNotMatch(f.feedback(),/Sent from|Sent\./);}
    }
    const f=await fixture(component,'ok'); const send=f.submit().props.onClick;send();send();await f.flush();assert.equal(f.writes.length,1,`${component} duplicate click`);
  }
  console.log('Legacy send screens: server/network/malformed/empty/false-success handling, draft retention, confirmed callback, retry, pending controls and duplicate prevention passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
