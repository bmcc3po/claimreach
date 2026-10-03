// Resend/Svix's documented HMAC scheme, using Web Crypto on the edge.
// https://docs.svix.com/receiving/verifying-payloads/how-manual
export async function verifyResendWebhook(raw: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get('svix-id') || '';
  const timestamp = headers.get('svix-timestamp') || '';
  const signatures = headers.get('svix-signature') || '';
  if (!id || !/^\d+$/.test(timestamp) || !secret.startsWith('whsec_') ||
    Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(secret.slice(6)), c => c.charCodeAt(0)),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    for (const part of signatures.split(' ').slice(0, 8)) {
      if (!part.startsWith('v1,')) continue;
      const bytes = Uint8Array.from(atob(part.slice(3)), c => c.charCodeAt(0));
      if (await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${id}.${timestamp}.${raw}`))) return true;
    }
  } catch { return false; }
  return false;
}

export async function cappedBytes(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > max) { await reader.cancel(); throw new Error('Incoming content exceeds the size limit.'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export type ReceivedEmail = { id: string; from: string; to: string[]; received_for?: string[]; subject: string;
  text: string | null; html: string | null; created_at: string; message_id: string;
  headers?: Record<string, string>; authentication?: { dmarc?: string; dkim?: string; spf?: string };
  attachments?: { id: string; filename: string; content_type: string; content_disposition?: string; size?: number }[] };
export const mailbox = (raw: string) => (raw.match(/<([^<>]+)>/)?.[1] || raw).trim().toLowerCase();
export function receiveAllowed(email: ReceivedEmail, recipient: string, domains: string[]) {
  const recipients = [...(email.to || []), ...(email.received_for || [])].map(mailbox);
  if (!recipient || !recipients.includes(recipient.toLowerCase())) return 'different_recipient';
  const sender = mailbox(email.from);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender) || !domains.includes(sender.split('@')[1])) return 'unapproved_sender';
  if (email.authentication?.dmarc?.toLowerCase() !== 'pass') return 'sender_authentication_unverified';
  return null;
}

export async function resendGet(path: string, apiKey: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${apiKey}` },
    redirect: 'manual', signal: AbortSignal.timeout(20000) });
  // Cloudflare does not implement redirect: 'error'. Reject redirects here,
  // before consuming content, so the API credential never follows another URL.
  if (!response.ok) throw new Error(`Resend could not provide the incoming email (${response.status}).`);
  return JSON.parse(new TextDecoder().decode(await cappedBytes(response.body, 1024 * 1024)));
}

/** Download URLs come only from the authenticated provider API, never email text. */
export async function receivedPdf(emailId: string, attachmentId: string, apiKey: string, fetcher: typeof fetch = fetch) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(emailId) || !/^[a-zA-Z0-9-]{1,80}$/.test(attachmentId)) throw new Error('Invalid incoming attachment identity.');
  const metadata = await resendGet(`/emails/receiving/${emailId}/attachments/${attachmentId}`, apiKey, fetcher);
  const url = new URL(metadata.download_url);
  if (url.protocol !== 'https:' || !['inbound-cdn.resend.com', 'cdn.resend.app'].includes(url.hostname) || url.port || url.username || url.password)
    throw new Error('Incoming PDF download host is not approved.');
  if (metadata.size > 15 * 1024 * 1024) throw new Error('Incoming PDF is larger than 15 MB.');
  const response = await fetcher(url.toString(), { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('The incoming PDF could not be downloaded.');
  const bytes = await cappedBytes(response.body, 15 * 1024 * 1024);
  if (bytes.length < 100 || !new TextDecoder().decode(bytes.slice(0, 8)).startsWith('%PDF-') ||
    !new TextDecoder().decode(bytes.slice(-2048)).includes('%%EOF')) throw new Error('The incoming attachment is not a complete PDF.');
  return bytes;
}

export async function contentHash(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function emailObjectId(value: string) {
  const h = await contentHash(new TextEncoder().encode(value));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
