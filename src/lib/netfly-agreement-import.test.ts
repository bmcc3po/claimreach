import assert from 'node:assert/strict';
import { netflyAgreementPdf } from './netfly-agreement-import';
const link = 'https://go.easyclaimcenter.com/documents/v1/00000000-0000-4000-8000-000000000001?locale=en-US';
const document = { _id: 'document0000001', locationId: 'location000001', status: 'completed', recipients: [{ role: 'signer', firstName: 'Synthetic', lastName: 'Client', hasCompleted: true }] };
const download = 'https://storage.googleapis.com/leadgen-proposals-estimates/location/location000001/documents/document0000001/signed.pdf?test=1';
const pdf = '%PDF-1.7\n' + 'Test only '.repeat(30) + '\n%%EOF';
async function main() {
  const urls: string[] = [];
  const fetcher = (async (url: any, options: any) => {
    urls.push(String(url)); assert.equal(options.redirect, 'manual'); assert.equal(options.headers, undefined, 'no private credentials go to viewer or storage');
    return String(url).includes('/download?') ? Response.json({ url: download }) : String(url).startsWith('https://storage.googleapis.com/') ? new Response(pdf) : Response.json({ document });
  }) as typeof fetch;
  const result = await netflyAgreementPdf(link, 'Synthetic Client', fetcher);
  assert.equal(new TextDecoder().decode(result.bytes), pdf); assert.equal(urls.length, 3);
  await assert.rejects(() => netflyAgreementPdf(link.replace('go.easyclaimcenter.com', 'evil.test'), 'Synthetic Client', fetcher), /agreement link/);
  await assert.rejects(() => netflyAgreementPdf(link, 'Someone Else', fetcher), /different client/);
  for (const changed of [{ ...document, status: 'sent' }, { ...document, recipients: [{ ...document.recipients[0], hasCompleted: false }] }]) {
    await assert.rejects(() => netflyAgreementPdf(link, 'Synthetic Client', (async () => Response.json({ document: changed })) as typeof fetch), /completed|signature/);
  }
  for (const bad of ['https://evil.test/a.pdf', download.replace('document0000001/', 'anotherdocument/'), download.replace('/signed.pdf', '/..%2fsigned.pdf')]) {
    await assert.rejects(() => netflyAgreementPdf(link, 'Synthetic Client', (async (url: any) => String(url).includes('/download?') ? Response.json({ url: bad }) : Response.json({ document })) as typeof fetch), /unexpected PDF/);
  }
  await assert.rejects(() => netflyAgreementPdf(link, 'Synthetic Client', (async (url: any, options: any) => String(url).startsWith('https://storage.googleapis.com/') ? new Response('not a pdf') : fetcher(url, options)) as typeof fetch), /PDF/);
  console.log('NETFLY completed-viewer import: matching signer, download, unsigned refusal, fixed host/path and PDF checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
