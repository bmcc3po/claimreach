import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as m6 from '../../lib/m6';

type Mode = 'ok' | 'server' | 'network' | 'malformed' | 'empty' | 'falseOk' | 'errorOk';
function fixture(component: string, initial: Mode) {
  let cursor=0, tree:any, mode=initial, refreshes=0;
  const slots:any[]=[], writes:any[]=[];
  const hooks={
    useState(value:any){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(value:any){const i=cursor++;return slots[i]||=({current:value});},
    useEffect(){cursor++;},
  };
  const fetchMock=async(_url:string,init:any)=>{
    writes.push(JSON.parse(init.body));
    if(mode==='network')throw Error('network');
    return {ok:mode!=='server'&&mode!=='falseOk',json:async()=>{
      if(mode==='malformed')throw SyntaxError('HTML');
      if(mode==='empty')return {};
      if(mode==='errorOk')return {ok:true,error:'Synthetic failure'};
      if(mode==='server')return {error:'Synthetic failure'};
      return {ok:true};
    }};
  };
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,`${component}.tsx`),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:any={};
  const Blank=()=>null;
  new Function('require','exports','fetch',code)((id:string)=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id==='next/navigation'?{useRouter:()=>({refresh:()=>refreshes++})}:id==='@/lib/m6'?m6:id==='@/lib/property-tool'?{propertyFileHref:()=>'/synthetic'}:id==='./M6Modals'?{LogTouch:Blank,ModalShell:Blank}:{__esModule:true,default:Blank},exports,fetchMock);
  const props={leadId:'synthetic',lead:{id:'synthetic',first_name:'SYNTHETIC'},status:{},points:[],notes:[],comms:[],schedule:[],docs:[],lor:{}};
  const render=()=>{cursor=0;tree=exports.default(props);};
  const nodes=(root:any=tree):any[]=>!root||typeof root!=='object'?[]:Array.isArray(root)?root.flatMap(x=>nodes(x??null)):[root,...nodes(root.props?.children??null)];
  const text=(root:any=tree):string=>root==null||typeof root==='boolean'?'':typeof root!=='object'?String(root):Array.isArray(root)?root.map(x=>text(x??null)).join(''):text(root.props?.children??null);
  const button=(label:string)=>nodes().find(n=>n.type==='button'&&text(n)===label);
  const modal=()=>nodes().find(n=>n.props?.onSave);
  const change=()=>{
    if(component==='CaseFile')nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'Synthetic unsaved note'}});
    if(component==='LorCard')nodes().find(n=>n.type==='select').props.onChange({target:{value:'ready'}});
    if(component==='LogTouchButton')button('Log a touch').props.onClick();
    render();
  };
  const save=()=>component==='LogTouchButton'?()=>modal().props.onSave({body:'Synthetic unsaved note',outcome:'no_answer'}):button(component==='CaseFile'?'Send':'Save status').props.onClick;
  const flush=async()=>{await new Promise(r=>setImmediate(r));render();};
  render();change();
  return {nodes,render,change,save,flush,modal,text,writes,feedback:()=>text()+String(modal()?.props.err||''),refreshes:()=>refreshes,mode:(v:Mode)=>mode=v};
}

async function main(){
  for(const component of ['CaseFile','LorCard','LogTouchButton']){
    for(const mode of ['server','network','malformed','empty','falseOk','errorOk'] as const){
      const f=fixture(component,mode);const save=f.save();save();save();f.render();
      assert.equal(f.writes.length,1,`${component} duplicate click`);
      if(component==='CaseFile')assert.equal(f.nodes().find(n=>n.type==='textarea').props.disabled,true);
      if(component==='LorCard')assert.ok(f.nodes().filter(n=>n.type==='select'||n.type==='input').every(n=>n.props.disabled));
      if(component==='LogTouchButton'){assert.equal(f.modal().props.busy,true);f.modal().props.onClose();f.render();assert.ok(f.modal(),'pending save cannot discard modal');}
      await f.flush();
      assert.match(f.feedback(),/Synthetic failure|Could not confirm/);
      assert.equal(f.refreshes(),0);
      if(component==='CaseFile')assert.equal(f.nodes().find(n=>n.type==='textarea').props.value,'Synthetic unsaved note');
      if(component==='LorCard'){assert.equal(f.nodes().find(n=>n.type==='select').props.value,'ready');assert.doesNotMatch(f.feedback(),/Status saved/);}
      if(component==='LogTouchButton')assert.ok(f.modal(),'unconfirmed result keeps modal open');
      f.mode('ok');f.save()();await f.flush();assert.equal(f.refreshes(),1);
      if(component==='CaseFile')assert.equal(f.nodes().find(n=>n.type==='textarea').props.value,'');
      if(component==='LorCard'){assert.match(f.feedback(),/Status saved/);f.change();assert.doesNotMatch(f.feedback(),/Status saved/);}
      if(component==='LogTouchButton')assert.equal(f.modal(),undefined);
    }
  }
  console.log('Legacy save screens: failures keep drafts, confirmed acknowledgement required, busy controls and duplicate guards passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
