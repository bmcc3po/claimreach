// ============================================================================
// DocuSeal (Cloud Pro). Edge-safe: plain fetch, no SDK.
//
// Env: DOCUSEAL_API_KEY (required), DOCUSEAL_API_URL (optional, default
// https://api.docuseal.com), DOCUSEAL_WEBHOOK_SECRET (required for webhooks).
//
// We never let DocuSeal text or email the client. For a text we send the
// signing link ourselves through JustCall, so it comes from the firm's number
// and lands in the file. For an email, DocuSeal sends it.
// ============================================================================
import type { Packet } from "@/lib/esign-packets/tmp-mva";

export const MISSING_DOCUSEAL = "DocuSeal is not set up. Add DOCUSEAL_API_KEY in Cloudflare.";

function base(): string {
  return ((globalThis as any)?.process?.env?.DOCUSEAL_API_URL || "https://api.docuseal.com").replace(/\/+$/, "");
}
function key(): string | null {
  return (globalThis as any)?.process?.env?.DOCUSEAL_API_KEY || null;
}
export function docusealConfigured(): boolean {
  return !!key();
}

type DsResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

async function ds<T>(path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<DsResult<T>> {
  const k = key();
  if (!k) return { ok: false, error: MISSING_DOCUSEAL };
  try {
    const r = await fetchImpl(base() + path, {
      ...init,
      headers: { "X-Auth-Token": k, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
    if (!r.ok) {
      const msg = (data && (data.error || data.message)) || `DocuSeal said ${r.status}.`;
      return { ok: false, error: String(msg), status: r.status };
    }
    return { ok: true, data: data as T };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach DocuSeal." };
  }
}

/** One template from a packet. The PDF is fetched by DocuSeal from `fileUrl`. */
export async function createTemplate(packet: Packet, fileUrl: string, fetchImpl?: typeof fetch) {
  return ds<{ id: number; name: string }>("/templates/pdf", {
    method: "POST",
    body: JSON.stringify({
      name: packet.name,
      external_id: packet.external_id,
      documents: [{ name: packet.name, file: fileUrl }],
      fields: packet.fields,
    }),
  }, fetchImpl);
}

export interface DsSubmitter {
  id: number;
  submission_id?: number;
  slug?: string;
  role: string;
  status?: string;
  email?: string | null;
  embed_src?: string;
  opened_at?: string | null;
  completed_at?: string | null;
  declined_at?: string | null;
}

/**
 * Send one agreement. Client signs first, Intake (us, through the API) second.
 * Client values are locked so the signer cannot edit her own name or date.
 */
export async function createSubmission(opts: {
  templateId: string | number;
  client: { name: string; email?: string | null; phone?: string | null; values: Record<string, string> };
  intake: { email: string; name?: string };
  emailClient: boolean;
  externalId?: string;
}, fetchImpl?: typeof fetch) {
  const client: any = {
    role: "Client",
    name: opts.client.name,
    values: opts.client.values,
    readonly_fields: Object.keys(opts.client.values),
    send_email: opts.emailClient,
    send_sms: false,
  };
  if (opts.client.email) client.email = opts.client.email;
  if (opts.client.phone) client.phone = opts.client.phone;
  if (opts.externalId) client.external_id = opts.externalId;
  return ds<DsSubmitter[]>("/submissions", {
    method: "POST",
    body: JSON.stringify({
      template_id: Number(opts.templateId),
      order: "preserved",
      send_email: opts.emailClient,
      send_sms: false,
      submitters: [client, { role: "Intake", email: opts.intake.email, name: opts.intake.name || "Intake", send_email: false, send_sms: false }],
    }),
  }, fetchImpl);
}

export async function getSubmission(id: string | number, fetchImpl?: typeof fetch) {
  return ds<{
    id: number; status: string; completed_at?: string | null;
    submitters: DsSubmitter[];
    documents?: { name: string; url: string }[];
    audit_log_url?: string | null;
  }>(`/submissions/${encodeURIComponent(String(id))}`, {}, fetchImpl);
}

/** Second signer: fill DOB and SSN, then mark Intake complete. */
export async function completeIntake(submitterId: string | number, values: Record<string, string>, fetchImpl?: typeof fetch) {
  return ds<DsSubmitter>(`/submitters/${encodeURIComponent(String(submitterId))}`, {
    method: "PUT",
    body: JSON.stringify({ values, completed: true, send_email: false, send_sms: false }),
  }, fetchImpl);
}

/** Where our status sits given DocuSeal's view of the client and the whole packet. */
export function statusFrom(sub: { status?: string; submitters?: DsSubmitter[] }): "sent" | "opened" | "signed" | "completed" | "declined" | "expired" {
  if (sub.status === "completed") return "completed";
  if (sub.status === "expired") return "expired";
  const c = (sub.submitters || []).find((s) => s.role === "Client");
  if (!c) return "sent";
  if (c.declined_at || c.status === "declined") return "declined";
  if (c.completed_at || c.status === "completed") return "signed";
  if (c.opened_at || c.status === "opened") return "opened";
  return "sent";
}

/** Rank so a late poll can never move a file backwards. */
export const STATUS_RANK: Record<string, number> = { failed: -1, sending: 0, sent: 1, opened: 2, declined: 3, expired: 3, signed: 4, completed: 5 };

/** Webhook check: DocuSeal lets you add a secret header; we require it. */
export function webhookAuthorized(headerValue: string | null, secret: string | null | undefined): boolean {
  if (!secret) return false;
  if (!headerValue || headerValue.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ headerValue.charCodeAt(i);
  return diff === 0;
}

/** Which agreement a crash state gets. TX and FL have their own; every other state uses AL/GA. */
export function agreementKey(stateCode: string | null | undefined): "TX" | "FL" | "OTHER" | null {
  const c = String(stateCode || "").toUpperCase();
  if (!c) return null;
  if (c === "TX") return "TX";
  if (c === "FL") return "FL";
  return "OTHER";
}
