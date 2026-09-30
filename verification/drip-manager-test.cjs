const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {renderToStaticMarkup}=require('react-dom/server');
let values=[],cursor=0,effect;
const hooks={useState(initial){const at=cursor++;if(!(at in values))values[at]=initial;return[values[at],value=>{values[at]=typeof value==='function'?value(values[at]):value}];},useEffect(fn){effect=fn}};
const code=ts.transpileModule(fs.readFileSync('src/components/DripManager.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exp={};new Function('require','exports',code)(id=>{if(id==='react')return hooks;if(id==='react/jsx-runtime')return require('react/jsx-runtime');throw Error('Unexpected import '+id)},exp);
const tree=()=>{cursor=0;return exp.default()};
const html=()=>renderToStaticMarkup(tree());
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function load(response){values=[];global.fetch=async()=>response;tree();effect();await settle();return html();}
function buttons(node){if(!node||typeof node!=='object')return[];return [...(node.type==='button'?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(buttons)];}
let count=0;async function test(name,fn){await fn();count++;console.log('ok',name)}
(async()=>{
 await test('failed load has Retry and never a false empty schedule',async()=>{const h=await load({ok:false,json:async()=>({error:'Synthetic unavailable'})});assert.match(h,/Synthetic unavailable/);assert.match(h,/Retry/);assert.doesNotMatch(h,/No eligible reminders/);assert.ok(buttons(tree())[0].props.disabled)});
 await test('bad response fails visibly and does not leave loading stuck',async()=>{const h=await load({ok:true,json:async()=>{throw Error('Synthetic parse failure')}});assert.match(h,/Retry/);assert.doesNotMatch(h,/Loading/)});
 await test('valid empty/off schedule states automatic SMS is unavailable and keeps run disabled',async()=>{const h=await load({ok:true,json:async()=>({due:[],held:[],sending:'off'})});assert.match(h,/No eligible reminders/);assert.match(h,/Automatic texts and emails are not configured/);assert.match(h,/switched off/);assert.ok(buttons(tree())[0].props.disabled)});
 await test('run failure restores button and never announces a sent message',async()=>{await load({ok:true,json:async()=>({due:[{enrollment_id:'e',name:'Synthetic',channel:'call_reminder'}],held:[],sending:'reminders_only'})});global.fetch=async()=>{throw Error('Synthetic disconnect')};await buttons(tree())[0].props.onClick();const h=html();assert.match(h,/Synthetic disconnect/);assert.ok(!buttons(tree())[0].props.disabled);assert.doesNotMatch(h,/Recorded 1|Fired/)});
 await test('successful reminder reports notes and held work, explicitly no outbound',async()=>{await load({ok:true,json:async()=>({due:[],held:[],sending:'reminders_only'})});let n=0;global.fetch=async()=>({ok:true,json:async()=>++n===1?{ok:true,fired:1,held:[{reason:'SMS unavailable'}]}:{due:[],held:[],sending:'reminders_only'}});await buttons(tree())[0].props.onClick();const h=html();assert.match(h,/Recorded 1 call reminder/);assert.match(h,/1 held/);assert.match(h,/No calls, texts or emails were sent/)});
 await test('capped preview cannot claim no other reminders exist',async()=>{const h=await load({ok:true,json:async()=>({due:[],held:[],sending:'reminders_only',preview:{limit:200,truncated:true}})});assert.match(h,/first 200 due items/);assert.match(h,/No eligible reminders in this preview/);assert.doesNotMatch(h,/No eligible reminders are due/)});
 await test('reload failure clears previously displayed work and disables processing',async()=>{await load({ok:true,json:async()=>({due:[{enrollment_id:'e',name:'Old synthetic item'}],held:[],sending:'reminders_only'})});let n=0;global.fetch=async()=>{if(++n===1)return{ok:true,json:async()=>({ok:true,fired:1,held:[]})};throw Error('Reload unavailable')};await buttons(tree())[0].props.onClick();const h=html();assert.match(h,/Reload unavailable/);assert.doesNotMatch(h,/Old synthetic item/);assert.ok(buttons(tree())[0].props.disabled)});
 console.log(`${count} actual DripManager UI checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
