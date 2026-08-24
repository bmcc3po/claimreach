// Shared JustCall SMS send. Used by /api/m6/compose so TMP firm writers on
// motel6 files can send without going through /api/justcall (which forbids role=firm).

export const JUSTCALL_TEXTS_URL = "https://api.justcall.io/v2.1/texts/new";
export const MISSING_JUSTCALL_KEYS =
  "JustCall keys are not in Cloudflare Pages. Logged only.";

export function toE164(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  const trimmed = String(raw ?? "").trim();
  if (trimmed.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

export function phoneDigits(raw: string | null | undefined): string {
  const e = toE164(raw);
  if (!e) return "";
  return e.replace(/\D/g, "").replace(/^1/, "");
}

export function formatFromNumber(raw: string | null | undefined): string {
  const e = toE164(raw);
  if (!e) return String(raw ?? "").trim();
  const d = phoneDigits(e);
  if (d.length !== 10) return e;
  return `+1 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export type ContactPointLite = {
  id: string;
  kind: string;
  value: string;
  status: string;
};

export function resolveM6SmsDestination(opts: {
  contactPointId?: string | null;
  leadPhone?: string | null;
  points: ContactPointLite[];
}): { to: string | null; contactPointId: string | null; optedOut: boolean } {
  const points = opts.points ?? [];
  const selected = opts.contactPointId
    ? points.find((p) => p.id === opts.contactPointId) ?? null
    : null;
  const livePhone = points.find((p) =>
    (p.kind === "mobile" || p.kind === "landline")
    && p.status !== "dead"
    && p.status !== "opted_out"
    && !!toE164(p.value),
  ) ?? null;
  const raw = selected?.value || opts.leadPhone || livePhone?.value || null;
  const to = toE164(raw);
  const digits = phoneDigits(to);
  const optedOut = selected?.status === "opted_out" || points.some((p) => {
    if (p.status !== "opted_out") return false;
    return !!digits && phoneDigits(p.value) === digits;
  });
  return {
    to,
    contactPointId: selected?.id || (opts.leadPhone ? null : livePhone?.id) || null,
    optedOut,
  };
}

export type JustCallSmsResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

function basicAuth(raw: string): string {
  if (typeof btoa === "function") return `Basic ${btoa(raw)}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

function justCallError(data: any, fallback: string): string {
  if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  if (typeof data?.error === "string" && data.error.trim()) return data.error.trim();
  return fallback;
}

export async function sendJustCallSms(opts: {
  to: string;
  body: string;
  from: string;
  apiKey?: string | null;
  apiSecret?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<JustCallSmsResult> {
  const apiKey = opts.apiKey ?? process.env.JUSTCALL_API_KEY;
  const apiSecret = opts.apiSecret ?? process.env.JUSTCALL_API_SECRET;
  if (!apiKey || !apiSecret) return { ok: false, error: MISSING_JUSTCALL_KEYS };

  const to = toE164(opts.to);
  if (!to) return { ok: false, error: "No number to text." };
  const from = toE164(opts.from) || opts.from;
  if (!from) return { ok: false, error: "No Motel 6 sending number is set." };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const payload = JSON.stringify({
    justcall_number: from,
    contact_number: to,
    body: opts.body,
  });
  const rawAuth = `${apiKey}:${apiSecret}`;
  const jsonHeaders = {
    Authorization: rawAuth,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    let r = await fetchImpl(JUSTCALL_TEXTS_URL, {
      method: "POST",
      headers: jsonHeaders,
      body: payload,
    });
    if (r.status === 401) {
      r = await fetchImpl(JUSTCALL_TEXTS_URL, {
        method: "POST",
        headers: { ...jsonHeaders, Authorization: basicAuth(rawAuth) },
        body: payload,
      });
    }
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: justCallError(data, "JustCall did not send the text.") };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "JustCall did not send the text." };
  }
}
