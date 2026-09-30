const fs = require('node:fs'), path = require('node:path'), {spawnSync} = require('node:child_process');
const app = path.resolve(__dirname, '..');
const tsx = require.resolve('tsx/cli');
function scan(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?scan(path.join(dir,d.name)):/\.test\.tsx?$/.test(d.name)?[path.join(dir,d.name)]:[]); }
const files = [...scan(path.join(app,'src')), ...fs.readdirSync(app).filter(n=>/\.test\.tsx?$/.test(n)).map(n=>path.join(app,n))].sort();
const extra = ['signing-routes-test.cjs','agreement-routes-test.cjs','emergency-sql-test.cjs','dispatch-sql-checks.cjs','pilot-sql-test.cjs','pilot-boundary-sql-test.cjs','durable-esign-send-sql-test.cjs','send-reconcile-routes-test.cjs','dq-terminal-sql-test.cjs','identity-sql-test.cjs','users-routes-test.cjs','drip-scheduler-sql-test.cjs','drip-manager-test.cjs','netfly-new-call-test.cjs'].map(n=>path.resolve(__dirname,n));
const outputDir=process.env.CLAIMREACH_TEST_OUTPUT || fs.mkdtempSync(path.join(require('node:os').tmpdir(),'claimreach-v9-tests-'));
fs.mkdirSync(path.join(outputDir,'test-logs'),{recursive:true});
const results=[];
for (const file of [...files,...extra]) {
  const name=path.relative(app,file).replaceAll('\\','/');
  const args=['--require',path.join(__dirname,'no-network.cjs'),
    ...(process.platform==='win32'?['--require',path.join(__dirname,'os-user-fallback.cjs')]:[]),
    ...(file.endsWith('.cjs')?[]:[tsx]),file];
  const start=Date.now();
  const userShim=path.join(__dirname,'os-user-fallback.cjs').replaceAll('\\','/');
  const r=spawnSync(process.execPath,args,{cwd:app,encoding:'utf8',timeout:120000,env:{...process.env,NODE_OPTIONS:process.platform==='win32'?`--require=${userShim}`:'',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'offline-placeholder',SUPABASE_SERVICE_ROLE_KEY:'offline-placeholder'}});
  const output=(r.stdout||'')+(r.stderr||'')+(r.error?'\n'+r.error:'');
  const log=path.join(outputDir,'test-logs',name.replace(/[^a-z0-9_.-]/gi,'_')+'.log');fs.writeFileSync(log,output);
  results.push({suite:name,exitCode:r.status,ms:Date.now()-start,log:path.relative(outputDir,log),tail:output.trim().split('\n').slice(-4).join('\n')});
  console.log(`${r.status===0?'PASS':'FAIL'} ${name}`);
  fs.writeFileSync(path.join(outputDir,'test-results.json'),JSON.stringify(results,null,2));
}
console.log(`${results.filter(r=>r.exitCode===0).length}/${results.length} suites passed`);
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
