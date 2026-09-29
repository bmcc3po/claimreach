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

/** The body DocuSeal's POST /templates/pdf expects. The fields sit inside the
 *  document they belong to; fields at the top level are ignored and DocuSeal
 *  makes an empty template ("Template does not contain fields" on send). */
export function templateBody(packet: Packet, fileUrl: string) {
  return {
    name: packet.name,
    external_id: packet.external_id,
    documents: [{ name: packet.name, file: fileUrl, fields: packet.fields }],
  };
}

/** One template from a packet. The PDF is fetched by DocuSeal from `fileUrl`. */
export async function createTemplate(packet: Packet, fileUrl: string, fetchImpl?: typeof fetch) {
  return ds<{ id: number; name: string; fields?: { name: string }[]; submitters?: { name: string }[] }>("/templates/pdf", {
    method: "POST",
    body: JSON.stringify(templateBody(packet, fileUrl)),
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

export interface SubmissionOpts {
  templateId: string | number;
  client: { name: string; email?: string | null; phone?: string | null; values: Record<string, string> };
  intake: { email: string; name?: string };
  emailClient: boolean;
  externalId?: string;
}

/** The body DocuSeal's POST /submissions expects. The client's name and dates
 *  are locked by the template itself (those fields are readonly there). */
export function submissionBody(opts: SubmissionOpts) {
  const client: any = {
    role: "Client",
    name: opts.client.name,
    values: opts.client.values,
    send_email: opts.emailClient,
    send_sms: false,
  };
  if (opts.client.email) client.email = opts.client.email;
  if (opts.client.phone) client.phone = opts.client.phone;
  if (opts.externalId) client.external_id = opts.externalId;
  return {
    template_id: Number(opts.templateId),
    order: "preserved",
    send_email: opts.emailClient,
    send_sms: false,
    submitters: [client, { role: "Intake", email: opts.intake.email, name: opts.intake.name || "Intake", send_email: false, send_sms: false }],
  };
}

/** Send one agreement. Client signs first, Intake (us, through the API) second. */
export async function createSubmission(opts: SubmissionOpts, fetchImpl?: typeof fetch) {
  return ds<DsSubmitter[]>("/submissions", {
    method: "POST",
    body: JSON.stringify(submissionBody(opts)),
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

/** Archive a submission: its signing link stops working. A signed packet
 *  stays in DocuSeal's archive; ClaimReach keeps its own copy either way. */
export async function archiveSubmission(id: string | number, fetchImpl?: typeof fetch) {
  return ds<any>(`/submissions/${encodeURIComponent(String(id))}`, { method: "DELETE" }, fetchImpl);
}

/** Second signer: fill DOB and SSN, then mark Intake complete. */
export async function completeIntake(submitterId: string | number, values: Record<string, string>, fetchImpl?: typeof fetch) {
  return ds<DsSubmitter>(`/submitters/${encodeURIComponent(String(submitterId))}`, {
    method: "PUT",
    body: JSON.stringify({ values, completed: true, send_email: false, send_sms: false }),
  }, fetchImpl);
}

/**
 * What DocuSeal said, in words an agent can act on. `stage` is what we were
 * doing: making the agreement template, or sending it to the client.
 */
export function plainDocuSeal(error: string, status: number | undefined, stage: "template" | "send"): string {
  const e = String(error || "").trim();
  const low = e.toLowerCase();
  if (e === MISSING_DOCUSEAL) return e;
  if (status === 401 || status === 403 || /not authenticated|unauthori[sz]ed|invalid.*token|api key/.test(low))
    return "DocuSeal refused our key. Nothing was sent. Tell your admin: DOCUSEAL_API_KEY in Cloudflare is wrong or expired.";
  if (status === 429 || /too many|rate limit/.test(low))
    return "DocuSeal is busy right now. Nothing was sent. Wait one minute and press Send again.";
  if (!status || (status >= 500 && status < 600) || /could not reach|fetch failed|network|timed? ?out/.test(low))
    return "DocuSeal did not answer. Nothing was sent. Wait a few seconds and press Send again.";
  if (/phone/.test(low)) return `DocuSeal says her cell number is not valid (${e}). Check the number, fix it, and send again.`;
  if (/email/.test(low)) return `DocuSeal says the email is not valid (${e}). Check the email, fix it, and send again.`;
  if (stage === "template" && /file|pdf|download|document/.test(low))
    return `DocuSeal could not open the agreement PDF (${e}). Nothing was sent. Tell your admin.`;
  if (stage === "template") return `DocuSeal would not set up the agreement (${e}). Nothing was sent. Tell your admin.`;
  return `DocuSeal would not send the agreement (${e}). Nothing was sent. Press Send again; if it fails twice, tell your admin.`;
}

/** A send that failed because the stored template is gone or empty in DocuSeal.
 *  The send route makes the template new and tries once more. */
export function templateProblem(error: string, status: number | undefined): boolean {
  const low = String(error || "").toLowerCase();
  return status === 404 || (/template/.test(low) && /(not found|does not contain|no fields|archived|missing)/.test(low));
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

export { agreementKey } from "./mva-call/agreement-choice";
