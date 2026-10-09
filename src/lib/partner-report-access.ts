// Server-only credentials are loaded by the route; this module has no secrets.
export const PARTNER_REPORT_KEY = 'pr-digital';
export const PARTNER_REPORT_HOME = '/pr-digital';
export const PARTNER_REPORT_API = '/api/pr-digital';
export const PARTNER_REPORT_COOKIE = 'cr_pr_digital';
export const REPORT_SESSION_SECONDS = 12 * 60 * 60;
export type ReportAccess = {
  report_key: string; firm_id: string; campaign_id: string;
  scope: 'campaign' | 'approved_sources'; active: boolean;
  password_salt: string; password_hash: string; token_secret: string;
};
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hex = (v: unknown, length: number) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(v);
export function validReportAccess(v: any): v is ReportAccess {
  return v?.report_key === PARTNER_REPORT_KEY && v.active === true && uuid(v.firm_id) && uuid(v.campaign_id) &&
    ['campaign', 'approved_sources'].includes(v.scope) && hex(v.password_salt, 32) && hex(v.password_hash, 64) && hex(v.token_secret, 64);
}
const encoder = new TextEncoder();
const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
export async function reportPasswordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256));
}
export async function reportPasswordMatches(password: string, access: ReportAccess) {
  const hash = await reportPasswordHash(password, access.password_salt);
  let diff = hash.length ^ access.password_hash.length;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ access.password_hash.charCodeAt(i);
  return diff === 0;
}
async function signingKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function reportHmac(value: string, secret: string) {
  return toHex(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(value)));
}
function sessionScope(access: ReportAccess) { return `${access.report_key}:${access.firm_id}:${access.campaign_id}:${access.scope}`; }
export async function createReportSession(access: ReportAccess, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const payload = btoa(JSON.stringify({ scope: sessionScope(access), issued, expires: issued + REPORT_SESSION_SECONDS, nonce: crypto.randomUUID() }));
  return `${payload}.${await reportHmac(payload, access.token_secret)}`;
}
export async function verifyReportSession(token: string | undefined, access: ReportAccess, now = Date.now()): Promise<boolean> {
  if (!validReportAccess(access) || !token || token.length > 1500) return false;
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra || !hex(signature, 64)) return false;
    const bytes = new Uint8Array(signature.match(/../g)!.map(v => parseInt(v, 16)));
    if (!await crypto.subtle.verify('HMAC', await signingKey(access.token_secret), bytes, encoder.encode(payload))) return false;
    const value = JSON.parse(atob(payload)), seconds = Math.floor(now / 1000);
    return value.scope === sessionScope(access) && Number.isInteger(value.issued) && Number.isInteger(value.expires) &&
      value.issued <= seconds && value.expires > seconds && value.expires - value.issued === REPORT_SESSION_SECONDS;
  } catch { return false; }
}
export const REPORT_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie',
};
