// LawRuler inbound email (Cloudflare Email Worker) + filename identity.
// One definition of: subject token, sender allowlist, leadid-from-filename,
// PDF = Secondary interview, CSV = skip. The Worker and the webhook both
// import this. No Next runtime, no @/ paths — the Worker bundles it.

export const M6_CAMPAIGN = "motel6";
export const M6_CASE_TYPE = "motel_trafficking";
export const TMP_SLUG = "tmp";

export const SECONDARY_INTERVIEW_DOC_TYPE = "secondary_interview";
export const SECONDARY_INTERVIEW_TITLE = "Secondary interview";

export const INTAKE_TO_DEFAULT = "m6-intake@inbound.claimreach.com";
export const LAWRULER_FROM_DOMAINS = ["lawruler.com", "lawruler.net"] as const;

export type LrAttachmentKind = "secondary_interview" | "intake_csv" | "retainer" | "other";

export type LrAttachmentPlan =
  | { action: "store"; kind: LrAttachmentKind; vendorLeadId: string | null; docType: string; fileName: string }
  | { action: "skip"; reason: "csv_thin" | "leadid_mismatch" | "missing_leadid"; kind: LrAttachmentKind; vendorLeadId: string | null };

export function parseLrFilenameLeadId(filename: string): string | null {
  const name = String(filename ?? "").replace(/^.*[/\\]/, "").trim();
  const m = name.match(/^(\d+)-/);
  return m ? m[1] : null;
}

export function classifyLrAttachment(filename: string): {
  vendorLeadId: string | null;
  kind: LrAttachmentKind;
} {
  const name = String(filename ?? "").replace(/^.*[/\\]/, "").trim();
  const vendorLeadId = parseLrFilenameLeadId(name);
  if (/-IntakeForm\.pdf$/i.test(name)) return { vendorLeadId, kind: "secondary_interview" };
  if (/-Intake\.csv$/i.test(name)) return { vendorLeadId, kind: "intake_csv" };
  if (/retain/i.test(name)) return { vendorLeadId, kind: "retainer" };
  return { vendorLeadId, kind: "other" };
}

export function lrAttachmentPlan(filename: string, webhookVendorId: string): LrAttachmentPlan {
  const { vendorLeadId, kind } = classifyLrAttachment(filename);
  if (kind === "intake_csv") {
    return { action: "skip", reason: "csv_thin", kind, vendorLeadId };
  }
  if (kind === "secondary_interview") {
    if (!vendorLeadId) {
      return { action: "skip", reason: "missing_leadid", kind, vendorLeadId };
    }
    if (vendorLeadId !== String(webhookVendorId)) {
      return { action: "skip", reason: "leadid_mismatch", kind, vendorLeadId };
    }
    return {
      action: "store",
      kind,
      vendorLeadId,
      docType: SECONDARY_INTERVIEW_DOC_TYPE,
      fileName: SECONDARY_INTERVIEW_TITLE,
    };
  }
  if (vendorLeadId && vendorLeadId !== String(webhookVendorId)) {
    return { action: "skip", reason: "leadid_mismatch", kind, vendorLeadId };
  }
  return {
    action: "store",
    kind,
    vendorLeadId,
    docType: kind === "retainer" ? "retainer" : "intake",
    fileName: String(filename ?? "").replace(/^.*[/\\]/, "") || "attachment",
  };
}

export function pickSecondaryInterviewPdf(filenames: string[]): {
  filename: string;
  vendorLeadId: string;
} | null {
  for (const filename of filenames) {
    const { vendorLeadId, kind } = classifyLrAttachment(filename);
    if (kind === "secondary_interview" && vendorLeadId) {
      return { filename, vendorLeadId };
    }
  }
  return null;
}

export function extractEmail(raw: string): string {
  const s = String(raw ?? "").trim();
  const angle = s.match(/<([^>]+)>/);
  const value = (angle ? angle[1] : s).replace(/^mailto:/i, "").trim().toLowerCase();
  return value;
}

export function parseM6IntakeSubject(subject: string): string | null {
  const m = String(subject ?? "").trim().match(/^M6INTAKE\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}

export function redactIntakeSubject(subject: string): string {
  return String(subject ?? "").replace(/^(M6INTAKE)\s+\S+/i, "$1 ***").trim();
}

function hostsFromSender(raw: string): string[] {
  const s = String(raw ?? "").trim().toLowerCase();
  const hosts: string[] = [];
  const email = extractEmail(s);
  if (email.includes("@")) hosts.push(email.split("@").pop()!);
  const via = s.match(/\bvia\s+([a-z0-9.-]+\.[a-z]{2,})\b/);
  if (via) hosts.push(via[1]);
  return hosts;
}

function domainAllowed(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith("." + allowed);
}

export function senderDomainAllowed(from: string, extraDomains: string[] = []): boolean {
  const allowed = [
    ...LAWRULER_FROM_DOMAINS,
    ...extraDomains.map((d) => d.trim().toLowerCase()).filter(Boolean),
  ];
  const hosts = hostsFromSender(from);
  if (hosts.length === 0) return false;
  return hosts.some((host) => allowed.some((d) => domainAllowed(host, d)));
}

export function tokenAccepted(got: string, wantCsv: string): boolean {
  const want = String(got ?? "");
  if (!want) return false;
  const accepted = String(wantCsv ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (accepted.length === 0) return false;
  let ok = false;
  for (const a of accepted) {
    if (a.length !== want.length) continue;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ want.charCodeAt(i);
    if (diff === 0) ok = true;
  }
  return ok;
}

export type EmailAuthFailure = "bad_sender" | "bad_recipient" | "bad_token" | "token_unconfigured";

export function authenticateIntakeEmail(input: {
  from: string;
  envelopeFrom?: string;
  to: string;
  subject: string;
  tokenCsv: string;
  intakeTo?: string;
  extraFromDomains?: string[];
}): { ok: true; token: string } | { ok: false; reason: EmailAuthFailure } {
  const fromOk =
    senderDomainAllowed(input.from, input.extraFromDomains) ||
    senderDomainAllowed(input.envelopeFrom || "", input.extraFromDomains);
  if (!fromOk) return { ok: false, reason: "bad_sender" };

  const expectTo = extractEmail(input.intakeTo || INTAKE_TO_DEFAULT);
  if (extractEmail(input.to) !== expectTo) return { ok: false, reason: "bad_recipient" };

  if (!String(input.tokenCsv ?? "").trim()) return { ok: false, reason: "token_unconfigured" };
  const token = parseM6IntakeSubject(input.subject);
  if (!token || !tokenAccepted(token, input.tokenCsv)) return { ok: false, reason: "bad_token" };
  return { ok: true, token };
}

export function isM6LeadShape(row: {
  campaign?: string | null;
  case_type?: string | null;
  archived_at?: string | null;
}): boolean {
  if (row.archived_at) return false;
  return row.campaign === M6_CAMPAIGN || row.case_type === M6_CASE_TYPE;
}
