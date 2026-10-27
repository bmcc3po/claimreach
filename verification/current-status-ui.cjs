const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');
const {createRequire}=require('node:module');const rr=createRequire('/tmp/claimreach-test-tools/node_modules/react-test-renderer/package.json');
const React=rr('react'),{create,act}=rr('react-test-renderer');
const registry=require('../src/lib/current-status.ts');
let listeners=[],refreshes=0,posts=0;
const router={refresh:()=>refreshes++};
let saved={key:'contacting',claim_id:'claim',lead_id:'lead',updated_at:'v1',can_edit:true};
global.window={addEventListener(){},removeEventListener(){}};
global.fetch=async(_url,opts)=>{
 if(opts?.method==='POST'){
  posts++;const b=JSON.parse(opts.body);if(b.expected_updated_at!==saved.updated_at)return {ok:false,json:async()=>({error:'This claim changed.'})};
  saved={...saved,key:b.status,updated_at:'v2',note:b.note};
 }
 return {ok:true,json:async()=>({current:{...saved}})};
};
const compiled=ts.transpileModule(fs.readFileSync('src/components/FileStatusControl.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const out={};new Function('require','exports',compiled)(id=>{
 if(id==='react')return React;if(id==='react/jsx-runtime')return rr(id);if(id==='next/navigation')return {useRouter:()=>router};
 if(id==='@/lib/current-status')return registry;
 if(id==='@/lib/current-status-events')return {EDIT_CURRENT_STATUS_EVENT:'edit',subscribeCurrentStatus:(_id,fn)=>{listeners.push(fn);return()=>{listeners=listeners.filter(l=>l!==fn);};},publishCurrentStatus:()=>listeners.forEach(fn=>fn())};
 throw new Error(id);
},out);
const Control=out.default;
const settle=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
 let ui;await act(async()=>{ui=create(React.createElement('div',null,React.createElement(Control,{leadId:'lead',claimId:'claim',current:'contacting',role:'agent'}),React.createElement(Control,{leadId:'lead',claimId:'claim',current:'contacting',role:'agent'})));await settle();});
 const selects=()=>ui.root.findAllByProps({'aria-label':'Current Status'});
 await act(async()=>selects()[0].props.onChange({target:{value:'dq'}}));
 const button=()=>ui.root.findAllByType('button').find(b=>b.children.join('')==='Save status');
 await act(async()=>{button().props.onClick();await settle();});assert.equal(posts,0,'blank note must not post');
 await act(async()=>ui.root.findByProps({'aria-label':'Reason category'}).props.onChange({target:{value:'contact'}}));
 await act(async()=>ui.root.findByProps({'aria-label':'Specific descriptor'}).props.onChange({target:{value:'wrong_number'}}));
 await act(async()=>ui.root.findByProps({'aria-label':'Agent note'}).props.onChange({target:{value:'The caller confirmed the wrong number.'}}));
 await act(async()=>{button().props.onClick();await settle();});
 assert.equal(posts,1);assert.equal(selects()[0].props.value,'dq');assert.equal(selects()[1].props.value,'dq','other mounted screen refetches saved status');assert.ok(refreshes>0);
 await act(async()=>selects()[0].props.onChange({target:{value:'contacting'}}));
 saved={...saved,key:'flag',updated_at:'v3'};
 await act(async()=>{listeners.forEach(fn=>fn());await settle();});
 assert.equal(button().props.disabled,true,'stale edit cannot save');
 await act(async()=>ui.unmount());
 // Middleware and proxy responses may be plain text or HTML, not API JSON.
 const goodFetch=global.fetch;
 for (const status of [401,403,502,200]) {
  global.fetch=async()=>({ok:status===200,status,json:async()=>{throw new SyntaxError('Unexpected token');}});
  await act(async()=>{ui=create(React.createElement(Control,{leadId:'lead',claimId:'claim',current:'contacting',role:'agent'}));await settle();});
  assert.equal(ui.root.findByProps({'aria-label':'Current Status'}).props.disabled,true);
  const message=ui.root.findByProps({role:'alert'}).children.join('');
  assert.match(message,status===403?/permission/:status===401?/session expired/:/Could not load current status/);
  assert.doesNotMatch(message,/Unexpected token/);
  await act(async()=>ui.unmount());
 }
 global.fetch=goodFetch;
 saved={...saved,category:'review',descriptor:'supervisor_review'};
 await act(async()=>{ui=create(React.createElement(Control,{leadId:'lead',claimId:'claim',current:'flag',role:'agent'}));await settle();});
 await act(async()=>ui.root.findAllByType('button').find(b=>b.children.join('')==='Add status note').props.onClick());
 await act(async()=>ui.root.findByProps({'aria-label':'Agent note'}).props.onChange({target:{value:'Synthetic denied save verification.'}}));
 const beforeVersion=saved.updated_at,beforeRefreshes=refreshes;
 global.fetch=async()=>({ok:false,status:403,json:async()=>{throw new SyntaxError('Unexpected token');}});
 await act(async()=>{button().props.onClick();await settle();});
 assert.match(ui.root.findByProps({role:'alert'}).children.join(''),/permission/);
 assert.equal(saved.updated_at,beforeVersion,'denied save cannot change saved state');
 assert.equal(refreshes,beforeRefreshes,'denied save cannot publish a success refresh');
 assert.equal(ui.root.findByProps({'aria-label':'Agent note'}).props.value,'Synthetic denied save verification.');
 await act(async()=>ui.unmount());console.log('Header interaction: required inputs, cross-screen saved-state propagation, stale edits and refresh passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
