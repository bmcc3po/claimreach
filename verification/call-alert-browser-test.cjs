// Synthetic browser regression. Requires Playwright, Chromium and esbuild in test-only tooling.
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const testTools = (process.env.NODE_PATH || '').split(path.delimiter).find(dir => dir && fs.existsSync(path.join(dir, 'esbuild')));
if (!testTools) throw new Error('Set NODE_PATH to the test-only tooling node_modules directory (README).');
const { build } = require(path.resolve(testTools, 'esbuild'));
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
 const output=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'claimreach-call-alert-ui-'));fs.mkdirSync(output,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import CallAlerts from './src/components/CallAlerts';createRoot(document.getElementById('root')).render(<CallAlerts/>);`,resolveDir:root,loader:'tsx'},bundle:true,outfile:path.join(output,'fixture.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-stub',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`import {useSyncExternalStore} from 'react';export function usePathname(){return useSyncExternalStore(cb=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb)},()=>location.pathname,()=>'/dashboard')}`,resolveDir:root}));}}],tsconfigRaw:{compilerOptions:{jsx:'react-jsx',baseUrl:root,paths:{'@/*':['src/*']}}}});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext();let feed=[],failure=0;
 await context.addInitScript(()=>{window.__toneStarts=0;const Native=window.AudioContext;window.AudioContext=class extends Native {createOscillator(){const osc=super.createOscillator();const start=osc.start.bind(osc);osc.start=(...args)=>{window.__toneStarts++;return start(...args)};return osc}};});
 await context.route('https://alert-fixture.invalid/**',async route=>{
  if(route.request().url().includes('/api/calls/alerts')){return route.fulfill({status:failure||200,contentType:'application/json',body:JSON.stringify(failure?{error:'offline'}:{viewer:'synthetic-agent',alerts:feed,checkedAt:await route.request().frame().evaluate(()=>Date.now())})})}
  const js=fs.readFileSync(path.join(output,'fixture.js'),'utf8'),css=fs.readFileSync(path.join(output,'fixture.css'),'utf8');
  await route.fulfill({contentType:'text/html',body:`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f5f7fa;font-family:system-ui;color:#15304a}main{padding:36px;max-width:980px;margin:auto}h1{font-size:32px}textarea{padding:20px;width:80%;height:180px;border:1px solid #d1dbe4;border-radius:14px}small{color:#768795}${css}</style></head><body><main><small>CLAIMREACH / SYNTHETIC CASE</small><h1>Intake workspace</h1><p>Your case stays open. Your notes stay where you left them.</p><textarea aria-label="Case notes">Unsaved synthetic note</textarea></main><div id="root"></div><script>${js}</script></body></html>`});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});
 console.log('STEP browser launched');await page.goto('https://alert-fixture.invalid/dashboard');await page.getByText('Call alerts live').waitFor();
 await page.getByRole('button',{name:'Enable sound'}).click();await page.getByRole('button',{name:'Sound on',exact:true}).waitFor();
 console.log('STEP sound enabled');assert.equal(await page.evaluate(()=>window.__toneStarts),3);
 await page.getByRole('button',{name:'Test alert',exact:true}).click();await page.getByText('PREVIEW · NO CALL CREATED').waitFor();
 for(const [name,width,height] of [['desktop',1440,900],['tablet',1024,768],['phone',390,844]]){
  await page.setViewportSize({width,height});const dock=await page.locator('.ca-dock').boundingBox(),banner=await page.locator('.ca-banner').boundingBox();assert.ok(dock.x>=0&&dock.x+dock.width<=width+1,`${name} dock fits`);assert.ok(banner.x>=0&&banner.x+banner.width<=width+1,`${name} banner fits`);assert.equal(await page.locator('textarea').inputValue(),'Unsaved synthetic note');await page.screenshot({path:path.join(output,`${name}.png`)});console.log('STEP layout',name);
 }
 await page.getByRole('button',{name:'Dismiss call alert'}).click();await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{history.pushState(null,'','/leads/another-file');window.dispatchEvent(new PopStateEvent('popstate'));});
 console.log('STEP navigation done');const tab=await context.newPage();await tab.goto('https://alert-fixture.invalid/queue');await tab.getByText('Call alerts live').waitFor();await tab.getByRole('button',{name:'Enable sound'}).click();
 const count=async()=>await page.evaluate(()=>window.__toneStarts)+await tab.evaluate(()=>window.__toneStarts);
 const before=await count();console.log('STEP two tabs armed',before);
 feed=[{key:'new:exact-matter',kind:'new',href:'/app/synthetic?claim=exact-matter'}];
 await page.getByText('A new lead is ready.').waitFor({timeout:15000});await tab.getByText('A new lead is ready.').waitFor();
 console.log('STEP new lead seen');await page.waitForTimeout(500);assert.equal(await count()-before,3,'one chime across two armed tabs');
 assert.equal(await page.locator('textarea').inputValue(),'Unsaved synthetic note');assert.ok(page.url().includes('/leads/another-file'));
 await page.waitForTimeout(11000);assert.equal(await count()-before,3,'same lead does not ring on subsequent polls');
 await page.getByRole('button',{name:'Dismiss call alert'}).click();await tab.getByRole('button',{name:'Dismiss call alert'}).click();
 feed.push({key:'callback:second-matter:later',kind:'callback',href:'/app/other?claim=second-matter',due:new Date(Date.now()+12000).toISOString()});
 await page.getByText('It’s time to call back.').waitFor({timeout:25000});await tab.getByText('It’s time to call back.').waitFor();await page.waitForTimeout(500);assert.equal(await count()-before,6,'callback rings once at due time');
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Test alert',exact:true}).click();assert.equal(await page.locator('.ca-green-pulse').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.evaluate(()=>{history.pushState(null,'','/sign/synthetic');window.dispatchEvent(new PopStateEvent('popstate'));});await page.waitForTimeout(100);assert.equal(await page.locator('.ca-dock').count(),0,'public signing page has no staff alert');
 assert.deepEqual(errors,[]);console.log('PASS browser: real audio unlock, 3 viewport layouts, test alert, navigation/unsaved notes, two-tab single chime, callback timing, reduced motion, public page suppression');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
