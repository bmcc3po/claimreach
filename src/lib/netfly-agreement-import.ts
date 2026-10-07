import { approvedAgreementUrl, netflyContactNameKey } from './netfly-handoff';
import { cappedBytes } from './resend-inbound';

const api = 'https://services.leadconnectorhq.com/proposals/document/public';

/** Public viewer API used by NETFLY's own Download PDF button. No credentials. */
export async function netflyAgreementPdf(link: string, clientName: string, fetcher: typeof fetch = fetch) {
  const approved = approvedAgreementUrl(link);
  if (!approved || !clientName.trim()) throw new Error('A NETFLY agreement link and client name are required.');
  const referenceId = new URL(approved).pathname.split('/').filter(Boolean).at(-1)!;
  const getJson = async (url: string) => {
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('NETFLY agreement service is unavailable. Retry or upload the original PDF.');
    return JSON.parse(new TextDecoder().decode(await cappedBytes(response.body, 4 * 1024 * 1024)));
  };
  const { document } = await getJson(`${api}?referenceId=${encodeURIComponent(referenceId)}`);
  if (!document || document.status !== 'completed') throw new Error('NETFLY has not confirmed this agreement as completed.');
  const signers = (Array.isArray(document.recipients) ? document.recipients : []).filter((person: any) => person.role === 'signer');
  if (!signers.length || signers.some((person: any) => person.hasCompleted !== true)) throw new Error('This NETFLY agreement still needs a signature.');
  if (!signers.some((person: any) => netflyContactNameKey(person.contactName || [person.firstName, person.lastName].filter(Boolean).join(' ')) === netflyContactNameKey(clientName)))
    throw new Error('The NETFLY agreement names a different client. Review the original before attaching it.');
  if (!/^[a-zA-Z0-9]{10,80}$/.test(document._id || '') || !/^[a-zA-Z0-9]{10,80}$/.test(document.locationId || ''))
    throw new Error('NETFLY returned an invalid document identity.');
  const params = new URLSearchParams({ documentId: document._id, altType: 'location', altId: document.locationId, isPublicRequest: 'true' });
  const download = await getJson(`${api}/download?${params}`);
  const url = new URL(download.url);
  const prefix = `/leadgen-proposals-estimates/location/${document.locationId}/documents/${document._id}/`;
  if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com' || url.port || url.username || url.password ||
      !url.pathname.startsWith(prefix) || !/\.pdf$/i.test(url.pathname) || /(?:%2f|%5c|\.\.)/i.test(url.pathname))
    throw new Error('NETFLY returned an unexpected PDF location. Use the original viewer to review it.');
  const response = await fetcher(url.toString(), { redirect: 'manual', signal: AbortSignal.timeout(25_000) });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > 15 * 1024 * 1024)
    throw new Error('The completed NETFLY PDF could not be downloaded (15 MB maximum).');
  const bytes = await cappedBytes(response.body, 15 * 1024 * 1024);
  if (bytes.length < 100 || !new TextDecoder().decode(bytes.slice(0, 8)).startsWith('%PDF-') || !new TextDecoder().decode(bytes.slice(-2048)).includes('%%EOF'))
    throw new Error('The NETFLY download is not a complete PDF.');
  const filename = `${clientName.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 90)}_NETFLY_signed.pdf`;
  return { bytes, filename, referenceId, documentId: document._id };
}
