import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function route(name: string, modules: Record<string, any>) {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/api/netfly', name, 'route.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  new Function('require', 'exports', compiled)((id: string) => { if (!(id in modules)) throw new Error(id); return modules[id]; }, exports);
  return exports;
}
const campaign = { id: 'netfly', firm_id: 'firm' };
let access: string[] | null = ['intake.fill', 'leads.view', 'docs.upload'];
const context = () => access && ({ actor: { name: 'Synthetic Agent', can: (key: string) => access!.includes(key) }, campaign, db: {} });
const note = 'Client: Synthetic Agent Test\nThe Signed Agreement:\nhttps://go.easyclaimcenter.com/documents/v1/00000000-0000-4000-8000-000000000001';
const matter = { lead: { id: 'scoped-lead', claimant_name: 'Synthetic Agent Test' }, claim: { id: 'scoped-claim', answers: { netfly_secondary: { handoffs: [{ note }] } } } };
const shared = {
  'next/server': { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
  '@/lib/netfly-server': { netflyContext: async () => context(), netflyMatter: async (_ctx: any, key: string) => key === 'TMP-TEST' ? matter : null },
};
let deliveries: any[] = [], deliveryResult: any = { ok: true }, deliveryThrows = false;
const delivery = route('delivery', { ...shared,
  '@/lib/netfly-packet': {}, '@/lib/firm-delivery-dispatch': {}, '@/lib/intake-render': {},
  '@/lib/firm-delivery': { deliverLeadToFirm: async (opts: any) => { deliveries.push(opts); if (deliveryThrows) throw new Error('provider uncertain'); return deliveryResult; } },
});
const request = (body: any) => ({ json: async () => body });
const valid = { file: 'TMP-TEST', reviewed: true, snapshot: 'a'.repeat(64) };
let downloads: any[] = [], saves: any[] = [];
const agreement = route('agreement-import', { ...shared,
  '@/lib/netfly-handoff': { extractNetflyEmail: (value: string) => { assert.equal(value, note); return { agreementLinks: [note.split('\n').at(-1)] }; } },
  '@/lib/netfly-agreement-import': { netflyAgreementPdf: async (...args: any[]) => { downloads.push(args); return { filename: 'test.pdf', bytes: new Uint8Array([1]) }; } },
  '@/lib/netfly-email-import': { preserveNetflySource: async (...args: any[]) => { saves.push(args); return 'stored'; } },
  '@/lib/netfly-ontake': { NETFLY_RETAINER_TYPE: 'netfly_signed_retainer' },
});
async function main() {
  access = null;
  assert.equal((await delivery.POST(request(valid))).status, 403);
  assert.equal((await agreement.POST(request(valid))).status, 403);
  access = ['leads.view'];
  assert.equal((await delivery.POST(request(valid))).status, 403);
  assert.equal((await agreement.POST(request(valid))).status, 403);
  access = ['intake.fill', 'leads.view', 'docs.upload'];
  assert.equal((await delivery.POST(request({ ...valid, file: 'foreign' }))).status, 404);
  assert.equal((await agreement.POST(request({ ...valid, file: 'foreign' }))).status, 404);
  assert.equal((await delivery.POST(request({ ...valid, reviewed: false }))).status, 409);
  assert.equal((await delivery.POST(request({ ...valid, snapshot: 'bad' }))).status, 409);
  assert.equal((await delivery.POST({ json: async () => { throw new Error('bad json'); } })).status, 400);
  assert.equal(deliveries.length, 0);
  assert.equal((await delivery.POST(request({ ...valid, force: true, claimId: 'foreign', to: 'arbitrary@example.test' }))).status, 200);
  assert.deepEqual(deliveries[0], { leadId: 'scoped-lead', claimId: 'scoped-claim', triggeredBy: 'manual', actorName: 'Synthetic Agent', includeOwner: true, netflySnapshot: valid.snapshot });
  deliveryResult = { ok: false, error: 'Review changed' };
  assert.equal((await delivery.POST(request(valid))).status, 409);
  deliveryThrows = true;
  const uncertain = await delivery.POST(request(valid));
  assert.equal(uncertain.status, 503); assert.match(uncertain.body.error, /Refresh delivery status/);
  assert.equal((await agreement.POST(request({ file: 'TMP-TEST', url: 'https://evil.test' }))).status, 200);
  assert.deepEqual(downloads[0], [note.split('\n').at(-1), 'Synthetic Agent Test']);
  assert.deepEqual(saves[0][1], { firmId: 'firm', campaignId: 'netfly', leadId: 'scoped-lead', claimId: 'scoped-claim' });
  console.log('NETFLY delivery/import routes: staff permissions, scoped file, current review, recipient/URL override refusal and uncertain send handling passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

