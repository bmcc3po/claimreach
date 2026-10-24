import assert from 'node:assert/strict';
import { fileSearchMatch,fileSearchRows,mergeFileSearchRows } from './file-search';
const lead={id:'a',firm_id:'f',campaign_id:'camp',campaign:'INNO MVA',updated_at:'2026-10-22',phone:'2025550100'};
const claim={id:'c',lead_id:'a',firm_id:'f',campaign_id:'camp',claim_type:'mva',status:'delivered'};
assert.equal(fileSearchRows([lead],[claim],'agent')[0].href,'/app/a?claim=c');
assert.equal(fileSearchRows([lead],[claim],'owner')[0].href,'/leads/a?claim=c');
assert.equal(fileSearchRows([lead],[claim],'agent',true)[0].href,'/app/netfly/a');
assert.equal(fileSearchRows([lead],[{...claim,firm_id:'other'}],'agent').length,0);
assert.equal(fileSearchRows([{...lead,archived_at:'2026-10-22'}],[claim],'owner').length,0);
assert.equal(fileSearchRows([lead],[claim,{...claim,id:'c2'}],'agent',true).length,0);
const rows=[...fileSearchRows([lead],[claim],'agent'),...fileSearchRows([lead],[claim],'agent',true)];assert.equal(mergeFileSearchRows(rows).length,1);assert.equal(mergeFileSearchRows(rows)[0].href,'/app/netfly/a');
// Shared phone never merges different existing file IDs.
assert.equal(mergeFileSearchRows([...rows,{...rows[0],id:'b'}]).length,2);
const calls:any[]=[];const q={or:(...a:any[])=>calls.push(['or',...a]),eq:(...a:any[])=>calls.push(['eq',...a]),ilike:(...a:any[])=>calls.push(['ilike',...a])};
fileSearchMatch(q,'(202) 555-0100');fileSearchMatch(q,'TMP-1201');fileSearchMatch(q,'Tartt');
assert.deepEqual(calls,[['eq','phone_norm','2025550100'],['or','lead_no.ilike.%TMP-1201%,lead_no_aliases.cs.{TMP-1201}'],['ilike','claimant_name','%Tartt%']]);
console.log('Global search identity, destination, deduplication, archive/tenant/matter filtering and query normalization passed.');

fileSearchMatch(q,'NF-TMP1001');assert.deepEqual(calls.at(-1),['or','lead_no.ilike.%NF-TMP1001%,lead_no_aliases.cs.{NF-TMP1001}']);
