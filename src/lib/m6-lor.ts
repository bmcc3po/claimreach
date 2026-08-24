// Motel 6 LOR letter. ONE definition of the PostGrid compose.
// LawRuler never talks to PostGrid. ClaimReach is the brain.
// Parked pipeline: docs/LOR_PIPELINE_SPEC (git history). This is the
// one-click send surface — preview then send. No fees, no settlement $.

import { M6_SENDING_NUMBER } from "./m6-cadence";

export const M6_LOR_RECIPIENT = {
  key: "g6",
  orgName: "G6 Hospitality Property LLC d/b/a Motel 6",
  attention: "LEGAL DEPT.",
  addressLine1: "6509 Windcrest Drive Suite 100",
  city: "Plano",
  state: "TX",
  zip: "75024",
  countryCode: "US",
  role: "franchisor",
} as const;

export const M6_LOR_INJURY_PHRASE = "sexually abused and exploited";
export const M6_LOR_RESPONSE_DAYS = 30;
export const M6_LOR_TEMPLATE_KEY = "m6_lor_g6";

export type LorLetterFacts = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  claimantName?: string | null;
  leadNo?: string | null;
  gender?: string | null;
  incidentStart?: string | null;
  incidentEnd?: string | null;
  propertyName?: string | null;
  propertyStreet?: string | null;
  propertyCity?: string | null;
  propertyState?: string | null;
  propertyZip?: string | null;
};

export type LorLetter = {
  date: string;
  clientName: string;
  leadNo: string | null;
  pronouns: { they: string; their: string; them: string };
  propertyLine: string;
  windowLine: string;
  preserveFrom: string;
  recipient: typeof M6_LOR_RECIPIENT;
  from: LorFromBlock;
  subject: string;
  body: string;
  html: string;
  missing: string[];
  canPreview: boolean;
  canSend: boolean;
};

export type LorFromBlock = {
  companyName: string;
  attention: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  countryCode: string;
  phone: string;
};

export function displayClientName(facts: LorLetterFacts): string {
  const joined = [facts.firstName, facts.lastName].filter(Boolean).join(" ").trim();
  return (facts.fullName || facts.claimantName || joined || "").trim();
}

export function pronounsFor(gender: string | null | undefined): { they: string; their: string; them: string } {
  const g = (gender || "").trim().toLowerCase();
  if (g === "f" || g === "female" || g === "woman" || g === "she") {
    return { they: "she", their: "her", them: "her" };
  }
  if (g === "m" || g === "male" || g === "man" || g === "he") {
    return { they: "he", their: "his", them: "him" };
  }
  return { they: "they", their: "their", them: "them" };
}

function isoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export function formatLetterDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(d);
}

export function minusYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(y - years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function propertyLine(facts: LorLetterFacts): string {
  const name = (facts.propertyName || "").trim();
  const street = [facts.propertyStreet, facts.propertyCity, facts.propertyState, facts.propertyZip]
    .filter(Boolean).join(", ");
  if (name && street) return `${name}, ${street}`;
  if (name) return name;
  if (street) return street;
  return "";
}

export function windowLine(start: string | null, end: string | null): string {
  if (start && end && start !== end) return `${formatLetterDate(start)} through ${formatLetterDate(end)}`;
  if (start) return `beginning ${formatLetterDate(start)}`;
  if (end) return `through ${formatLetterDate(end)}`;
  return "";
}

export function defaultLorFrom(env: Record<string, string | undefined> = process.env as any): LorFromBlock {
  return {
    companyName: env.M6_LOR_FROM_NAME || "Turnbull Moak & Pendergrass",
    attention: env.M6_LOR_FROM_ATTN || "Legal / Client Care",
    addressLine1: env.M6_LOR_FROM_STREET || "",
    city: env.M6_LOR_FROM_CITY || "",
    state: env.M6_LOR_FROM_STATE || "",
    zip: env.M6_LOR_FROM_ZIP || "",
    countryCode: "US",
    phone: env.M6_LOR_FROM_PHONE || M6_SENDING_NUMBER,
  };
}

export function composeLorLetter(
  facts: LorLetterFacts,
  opts?: { today?: string; from?: LorFromBlock },
): LorLetter {
  const today = opts?.today || new Date().toISOString().slice(0, 10);
  const from = opts?.from || defaultLorFrom();
  const clientName = displayClientName(facts);
  const pronouns = pronounsFor(facts.gender);
  const start = isoDate(facts.incidentStart);
  const end = isoDate(facts.incidentEnd);
  const prop = propertyLine(facts);
  const window = windowLine(start, end);
  const preserveFrom = start ? minusYears(start, 3) : minusYears(today, 3);

  const missing: string[] = [];
  if (!clientName || clientName.toLowerCase() === "unnamed file") missing.push("client name");
  if (!facts.gender) missing.push("gender (for pronouns)");
  if (!start || !end) missing.push("incident dates");
  if (!prop) missing.push("property");
  if (!from.addressLine1 || !from.city || !from.state || !from.zip) {
    missing.push("firm return address (set M6_LOR_FROM_STREET in Pages)");
  }

  const subject = clientName
    ? `Letter of representation — ${clientName}`
    : "Letter of representation";

  const where = prop || "a hospitality property our client can identify";
  const when = window ? ` during ${window}` : "";

  const body = [
    `${formatLetterDate(today)}`,
    ``,
    `${M6_LOR_RECIPIENT.orgName}`,
    `${M6_LOR_RECIPIENT.attention}`,
    `${M6_LOR_RECIPIENT.addressLine1}`,
    `${M6_LOR_RECIPIENT.city}, ${M6_LOR_RECIPIENT.state} ${M6_LOR_RECIPIENT.zip}`,
    ``,
    `Re: ${subject}${facts.leadNo ? ` · ${facts.leadNo}` : ""}`,
    ``,
    `Dear Counsel:`,
    ``,
    `This firm represents ${clientName || "[client name]"} in connection with harm ${pronouns.they} suffered after being ${M6_LOR_INJURY_PHRASE} at ${where}${when}.`,
    ``,
    `Please send all future communications about this matter to this office. Do not contact our client directly.`,
    ``,
    `Please preserve all guest, staff, video, payment, and incident records for this property from ${formatLetterDate(preserveFrom)} through the present.`,
    ``,
    `Please confirm receipt in writing within ${M6_LOR_RESPONSE_DAYS} days.`,
    ``,
    `Very truly yours,`,
    `${from.companyName}`,
    from.attention,
    from.phone,
  ].join("\n");

  const html = `<html><body style="font-family:Georgia,serif;font-size:12pt;line-height:1.45;color:#231F20">
<p>${formatLetterDate(today)}</p>
<p>${M6_LOR_RECIPIENT.orgName}<br/>
${M6_LOR_RECIPIENT.attention}<br/>
${M6_LOR_RECIPIENT.addressLine1}<br/>
${M6_LOR_RECIPIENT.city}, ${M6_LOR_RECIPIENT.state} ${M6_LOR_RECIPIENT.zip}</p>
<p>Re: ${escapeHtml(subject)}${facts.leadNo ? ` · ${escapeHtml(facts.leadNo)}` : ""}</p>
<p>Dear Counsel:</p>
<p>This firm represents ${escapeHtml(clientName || "[client name]")} in connection with harm ${pronouns.they} suffered after being ${M6_LOR_INJURY_PHRASE} at ${escapeHtml(where)}${escapeHtml(when)}.</p>
<p>Please send all future communications about this matter to this office. Do not contact our client directly.</p>
<p>Please preserve all guest, staff, video, payment, and incident records for this property from ${formatLetterDate(preserveFrom)} through the present.</p>
<p>Please confirm receipt in writing within ${M6_LOR_RESPONSE_DAYS} days.</p>
<p>Very truly yours,<br/>
${escapeHtml(from.companyName)}<br/>
${escapeHtml(from.attention)}<br/>
${escapeHtml(from.phone)}</p>
</body></html>`;

  return {
    date: today,
    clientName,
    leadNo: facts.leadNo ?? null,
    pronouns,
    propertyLine: prop,
    windowLine: window,
    preserveFrom,
    recipient: M6_LOR_RECIPIENT,
    from,
    subject,
    body,
    html,
    missing,
    canPreview: true,
    canSend: !!clientName && clientName.toLowerCase() !== "unnamed file",
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
  ));
}

export function postgridMode(apiKey: string | null | undefined): "live" | "test" | "missing" {
  const k = (apiKey || "").trim();
  if (!k) return "missing";
  if (/^test[_-]/i.test(k) || k.toLowerCase().includes("test")) return "test";
  return "live";
}

export function lorAlreadySent(status: string | null | undefined): boolean {
  return status === "sent" || status === "received";
}

export const MONEY_BLIND_RE = /\$\s*\d|settlement|attorney.?s? fee|contingen|percent\s*\d/i;

export function letterIsMoneyBlind(text: string): boolean {
  return !MONEY_BLIND_RE.test(text);
}
