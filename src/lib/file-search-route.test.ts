import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as searchFunctions from './file-search';
const stamp = '2026-10-22T12:00:00Z';
const lead = { id: 'netfly', firm_id: 'tmp', campaign_id: 'nf', campaign: 'NETFLY ONTAKE', case_type: 'mva', lead_no: 'NF-TMP1001', lead_no_aliases:['TMP-1234'], claimant_name: 'Synthetic Kolb', phone_norm: '2025550100', archived_at: null, created_at: stamp, updated_at: stamp };
const regular = { ...lead, id: 'regular', campaign_id: 'inno', campaign: 'INNO MVA', lead_no: 'TMP-9999' };
const ops: any[] = [];
let failTable = '', staff = true, allowed = true, permission = true;
function db(tables: Record<string, any[]>, admin = false) {
  return { from(table: string) {
    let rows = [...(tables[table] || [])], limit = 100; const filters: any[] = []; ops.push({ table, admin, filters });
    const query: any = {
      select() { return query; },
      eq(k: string, v: any) { filters.push([k,v]); rows = rows.filter(r => r[k] === v); return query; },
      is(k: string, v: any) { rows = rows.filter(r => v === null ? r[k] == null : r[k] === v); return query; },
      in(k: string, v: any[]) { rows = rows.filter(r => v.includes(r[k])); return query; },
      ilike(k: string, v: string) { const term = v.slice(1,-1).toLowerCase(); rows = rows.filter(r => String(r[k] || '').toLowerCase().includes(term)); return query; },
      or(v: string) { if(v.startsWith('lead_no.')){const term=v.split('%')[1].toLowerCase();rows=rows.filter(r=>String(r.lead_no).toLowerCase().includes(term)||(r.lead_no_aliases||[]).some((a:string)=>a.toLowerCase()===term));} else if(v.startsWith('campaign.')) rows=rows.filter(r=>r.campaign!=='NETFLY ONTAKE'); else if(v.startsWith('campaign_id.')) rows=rows.filter(r=>r.campaign_id!=='nf'); else rows=rows.filter(r=>r.case_type!=='mva'); return query; },
      order() { return query; }, limit(n: number) { limit=n;return query; },
      then(resolve: any, reject: any) { return Promise.resolve({ data: admin && failTable===table ? null : rows.slice(0,limit), error: admin && failTable===table ? { message:'unavailable' } : null }).then(resolve,reject); }
    }; return query;
  }};
}
const session = db({ campaigns:[{id:'nf',name:'NETFLY ONTAKE',case_type:'mva'}], leads:[regular,lead], claims:[{id:'regular-claim',lead_id:'regular',firm_id:'tmp',campaign_id:'inno',campaign:'INNO MVA',claim_type:'mva',status:'delivered'}], cr_mva_dial_summary:[], esign_submissions:[] });
const candidates = [lead,{...lead,id:'foreign',firm_id:'other'}, {...lead,id:'wrong-campaign',campaign_id:'other'}, {...lead,id:'archived',archived_at:stamp}, {...lead,id:'wrong-type',case_type:'motel'}, {...lead,id:'ambiguous'}, {...lead,id:'missing-matter'}];
const admin = db({leads:candidates, claims:[{id:'claim',lead_id:'netfly',firm_id:'tmp',campaign_id:'nf',claim_type:'mva',status:'delivered'}, ...['one','two'].map(id=>({id,lead_id:'ambiguous',firm_id:'tmp',campaign_id:'nf',claim_type:'mva'}))]},true);
const deps: any = {
  'next/server': { NextResponse: { json:(body:any,options:any={})=>({body,status:options.status||200}) } },
  '@/lib/file-search':searchFunctions, '@/lib/supabase-server': { supabaseServer:async()=>session },
  '@/lib/mva-call/server': { requireStaff:async()=>staff?{id:'actor',role:'agent',can:()=>permission}:null },
  '@/lib/comms': { normPhone:(q:string)=>q.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'') },
  '@/lib/mva-call/search-status': { searchStatusLabel:()=>null },
  '@/lib/netfly-ontake': { NETFLY_CAMPAIGN:'NETFLY ONTAKE' },
  '@/lib/netfly-server': { netflyContext:async()=>allowed?{ actor:{ can:()=>permission }, campaign:{id:'nf',firm_id:'tmp'},db:admin }:null }
};
const output=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../app/api/files/search/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const route:any={};new Function('require','exports',output)((id:string)=>{assert.ok(deps[id],id);return deps[id];},route);
const search=(q:string,area='mva')=>{const url=new URL('https://example.test/api/calls/search');url.searchParams.set('q',q);url.searchParams.set('area',area);return route.GET({url:String(url),nextUrl:url});};
async function main(){
  for(const term of ['Kolb','(202) 555-0100','TMP-1234','NF-TMP1001']){
    const r=await search(term);assert.equal(r.status,200);const nf=r.body.results.find((x:any)=>x.id==='netfly');assert.equal(nf.href,'/app/netfly/netfly');assert.equal(nf.status,'delivered');
    assert.ok(!r.body.results.some((x:any)=>['foreign','wrong-campaign','archived','wrong-type','ambiguous','missing-matter'].includes(x.id)));
  }
  const all=await search('Kolb');assert.equal(all.body.results.find((x:any)=>x.id==='regular').href,'/app/regular?claim=regular-claim');
  for(const op of ops.filter(op=>op.admin)){assert.ok(op.filters.some(([k,v]:any)=>k==='firm_id'&&v==='tmp'));assert.ok(op.filters.some(([k,v]:any)=>k==='campaign_id'&&v==='nf'));}
  allowed=false;ops.length=0;assert.deepEqual((await search('Kolb')).body.results.map((x:any)=>x.id),['regular']);assert.equal(ops.some(x=>x.admin),false);
  allowed=true;permission=false;ops.length=0;assert.equal((await search('Kolb')).status,403);assert.equal(ops.some(x=>x.admin),false);
  permission=true;ops.length=0;await search('Kolb','other');assert.equal(ops.some(x=>x.admin),true);
  failTable='leads';assert.equal((await search('Kolb')).status,503);failTable='claims';assert.equal((await search('Kolb')).status,503);failTable='';
  staff=false;ops.length=0;assert.equal((await search('Kolb')).status,401);assert.equal(ops.length,0);
  staff=true;assert.deepEqual((await search('K')).body.results,[]);
  console.log('Global search: NETFLY name/phone/lead number, delivered records, separate navigation, exact tenant/campaign, archive/type/matter filtering, access denial, work area and read failures passed; no write methods available');
}
main().catch(e=>{console.error(e);process.exitCode=1});
