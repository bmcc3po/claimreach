// Synthetic fixtures only; actual report/status components, Chromium iPhone viewport.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,devices}=require('@playwright/test');
const esbuild=require('esbuild');
(async()=>{
 const app=path.resolve(__dirname,'..'),out=fs.mkdtempSync('/tmp/claimreach-dq-ui-');
 const entry=`import '${app}/src/app/globals.css';import React from '${app}/node_modules/react';import {createRoot} from '${app}/node_modules/react-dom/client';import PartnerSheet from '${app}/src/app/pr-digital/PartnerSheet';import FileStatusControl from '${app}/src/components/FileStatusControl';createRoot(document.getElementById('app')!).render(location.pathname==='/status'?<FileStatusControl leadId="fixture" claimId="fixture-claim" current="contacting" role="agent"/>:<PartnerSheet/>);`;
 fs.writeFileSync(path.join(out,'tsconfig.json'),JSON.stringify({compilerOptions:{...JSON.parse(fs.readFileSync(path.join(app,'tsconfig.json'),'utf8')).compilerOptions,jsx:'react-jsx',baseUrl:app}}));
 await esbuild.build({stdin:{contents:entry,resolveDir:app,loader:'tsx'},bundle:true,outfile:path.join(out,'bundle.js'),jsx:'automatic',tsconfig:path.join(out,'tsconfig.json')});
 const server=http.createServer((req,res)=>{const f=req.url==='/bundle.js'?'bundle.js':req.url==='/bundle.css'?'bundle.css':null;if(f){res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(out,f)));}else res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/bundle.css"><div id="app"></div><script src="/bundle.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({...devices['iPhone 13'],defaultBrowserType:undefined});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>console.error('Browser error:',e.message));
  const base={phone:'2025550100',receivedAt:'2026-10-18T12:00:00Z',called:true,signed:'No',signedAt:null,status:'DQ',statusKey:'dq',deliveryGroup:null,speedMinutes:12,callDurationSeconds:50,state:'CA',lastActivityAt:null,campaign:'INNO MVA',dqKind:'Current intake DQ',dqReason:'Already represented',dqReview:'Reviewed explanation recorded',notes:'Client confirmed existing representation.'};
  const rows=[{...base,name:'Synthetic Client A'},{...base,name:'Synthetic Client B',dqReason:'Reason missing',dqReview:'Review required: reason and explanation missing',notes:null},{...base,name:'Synthetic Historical',status:'Contacting',statusKey:'contacting',dqKind:'Historical DQ'},{...base,name:'Synthetic Firm Decision',status:'Signed and declined',statusKey:'signed_dropped',dqKind:'Firm turn-down',signed:'Yes',deliveryGroup:'declined'},{...base,name:'Synthetic Old',receivedAt:'2026-09-01T12:00:00Z'}];
  await page.route('**/api/pr-digital',r=>r.fulfill({json:{rows,summary:{},updatedAt:'2026-10-19T12:00:00Z'}}));
  const url=`http://127.0.0.1:${server.address().port}`;await page.goto(url);
  console.log('Loaded synthetic report');await page.getByLabel('Date range').selectOption('Last 14 days');
  await page.getByRole('heading',{name:'Current intake DQ (2)',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Historical DQ (1)',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Firm turn-down (1)',exact:true}).waitFor();
  assert.ok(await page.getByText(/Test data excluded/).first().isVisible());
  const evidence=path.join(app,'verification/artifacts/marketer-dq');fs.mkdirSync(evidence,{recursive:true});
  await page.screenshot({path:path.join(evidence,'iphone-summary.png'),fullPage:true});
  await page.getByRole('button',{name:'Already represented 1',exact:true}).first().click();
  await page.getByText('Synthetic Client A',{exact:true}).waitFor();
  assert.equal(await page.getByText('Synthetic Historical',{exact:true}).count(),0);assert.equal(await page.getByText('Synthetic Old',{exact:true}).count(),0);
  await page.getByText('Client confirmed existing representation.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(evidence,'iphone-drilldown.png'),fullPage:true});
  await page.route('**/api/statuses',r=>r.fulfill({json:{}}));await page.route('**/api/dq-reasons',r=>r.fulfill({json:{reasons:[{key:'already_rep',label:'Already represented',category:'Eligibility'}]}}));
  let body;await page.route('**/api/leads',async r=>{body=r.request().postDataJSON();await r.fulfill({status:500,json:{error:'Synthetic save failure. Try again.'}});});
  await page.goto(url+'/status');await page.getByRole('button',{name:/Change status:/}).click();await page.getByRole('button',{name:/^DQ\s*reason$/}).click();
  const explanation=page.getByRole('textbox');await explanation.fill('   \n  ');await page.getByRole('button',{name:/Already represented/}).click();
  assert.equal(await page.getByRole('button',{name:'Save disqualification'}).isDisabled(),true);
  await explanation.fill('Client confirmed existing representation.');await page.getByRole('button',{name:'Save disqualification'}).click();await page.getByText('Synthetic save failure. Try again.').waitFor();
  assert.equal(await explanation.inputValue(),'Client confirmed existing representation.');assert.equal(body.dq_reason_key,'already_rep');assert.equal(body.dq_explanation,'Client confirmed existing representation.');
  assert.equal(await page.getByRole('button',{name:/Already represented/}).getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(evidence,'iphone-save-failure.png'),fullPage:true});
  console.log('PASS: iPhone 13 summary counts, 14-day filter, reason drilldown, private/missing text, no horizontal overflow, whitespace disabled, and draft/reason retained after failure');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
