// Motel 6 LOR letter. ONE definition of the PostGrid compose.
// Official TMP Letter of Representation — investigation file, insurance
// under oath, and the numbered preserve / spoliation list. LawRuler never
// talks to PostGrid. One-click send. No fees, no settlement $.

export const M6_LOR_RECIPIENT = {
  key: "g6",
  orgName: "G6 Hospitality Property LLC d/b/a Motel 6",
  attention: "LEGAL DEPT.",
  addressLine1: "6509 Windcrest Drive, Suite 100",
  city: "Plano",
  state: "TX",
  zip: "75024",
  countryCode: "US",
  role: "franchisor",
} as const;

export const M6_LOR_INJURY_PHRASE = "sexually abused and exploited";
export const M6_LOR_RESPONSE_DAYS = 30;
export const M6_LOR_TEMPLATE_KEY = "m6_lor_g6";
export const M6_LOR_DELIVERY = "USPS Certified Mail";
export const M6_LOR_FROM_NAME_DEFAULT = "Josh Bauer";
export const M6_LOR_FROM_PHONE_DEFAULT = "(281) 888-0911";
export const M6_LOR_FROM_FAX_DEFAULT = "(205) 848-6300";
export const M6_LOR_FROM_EMAIL_DEFAULT = "jbauer@turnbullfirm.com";
export const M6_LOR_FROM_INITIALS_DEFAULT = "JB";
export const M6_LOR_TYPIST_INITIALS_DEFAULT = "am";

export type LorRecipient = {
  key: string;
  orgName: string;
  attention: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  countryCode: string;
  role: string;
};

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
  propertyAddress: string;
  cityStateZip: string;
  windowLine: string;
  dateRange: string;
  preserveFrom: string;
  recipient: LorRecipient;
  from: LorFromBlock;
  delivery: string;
  injuryPhrase: string;
  responseDays: number;
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
  fax: string;
  email: string;
  initials: string;
  typistInitials: string;
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

export function cityStateZip(city?: string | null, state?: string | null, zip?: string | null): string {
  const left = [city, state].filter(Boolean).join(", ");
  return [left, zip].filter(Boolean).join(" ").trim();
}

export function propertyAddress(facts: LorLetterFacts): string {
  const street = (facts.propertyStreet || "").trim();
  const csz = cityStateZip(facts.propertyCity, facts.propertyState, facts.propertyZip);
  return [street, csz].filter(Boolean).join(", ");
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

export function dateRangeLine(start: string | null, end: string | null): string {
  const a = start ? formatLetterDate(start) : "";
  const b = end ? formatLetterDate(end) : "";
  if (a && b && a !== b) return `On / about ${a} to ${b}`;
  if (a) return `On / about ${a}`;
  if (b) return `On / about ${b}`;
  return "";
}

export function recipientCityStateZip(r: Pick<LorRecipient, "city" | "state" | "zip">): string {
  return cityStateZip(r.city, r.state, r.zip);
}

export function recipientCanMail(r: Pick<LorRecipient, "addressLine1" | "city" | "state" | "zip">): boolean {
  return !!(r.addressLine1 && r.city && r.state && r.zip);
}

export function parseOwnerMailing(raw: string | null | undefined): {
  addressLine1: string; city: string; state: string; zip: string;
} {
  const s = String(raw || "").replace(/,\s*USA$/i, "").trim();
  const empty = { addressLine1: s, city: "", state: "", zip: "" };
  if (!s) return { addressLine1: "", city: "", state: "", zip: "" };
  const strict = s.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (strict) return { addressLine1: strict[1].trim(), city: strict[2].trim(), state: strict[3], zip: strict[4] };
  const loose = s.match(/^(.+?),\s*([^,]+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (loose) return { addressLine1: loose[1].trim(), city: loose[2].trim(), state: loose[3], zip: loose[4] };
  return empty;
}

export function franchiseeRecipientFromHistory(entry: {
  llc?: string | null; owner?: string | null; address?: string | null;
  brand?: string | null; from?: number | null; to?: number | null; source?: string | null;
} | null | undefined): LorRecipient | null {
  const llc = (entry?.llc || "").trim();
  if (!llc) return null;
  const parsed = parseOwnerMailing(entry?.address);
  return {
    key: "franchisee",
    orgName: llc,
    attention: (entry?.owner || "").trim() || "LEGAL DEPT.",
    addressLine1: parsed.addressLine1,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    countryCode: "US",
    role: "franchisee",
  };
}

export function pickLorRecipient(
  key: string | null | undefined,
  franchisee: LorRecipient | null,
): LorRecipient {
  if (key === "franchisee" && franchisee && recipientCanMail(franchisee)) return franchisee;
  return { ...M6_LOR_RECIPIENT };
}

export function defaultLorFrom(env: Record<string, string | undefined> = process.env as any): LorFromBlock {
  return {
    companyName: env.M6_LOR_FROM_NAME || "Turnbull Moak & Pendergrass",
    attention: env.M6_LOR_FROM_ATTN || M6_LOR_FROM_NAME_DEFAULT,
    addressLine1: env.M6_LOR_FROM_STREET || "",
    city: env.M6_LOR_FROM_CITY || "",
    state: env.M6_LOR_FROM_STATE || "",
    zip: env.M6_LOR_FROM_ZIP || "",
    countryCode: "US",
    phone: env.M6_LOR_FROM_PHONE || M6_LOR_FROM_PHONE_DEFAULT,
    fax: env.M6_LOR_FROM_FAX || M6_LOR_FROM_FAX_DEFAULT,
    email: env.M6_LOR_FROM_EMAIL || M6_LOR_FROM_EMAIL_DEFAULT,
    initials: env.M6_LOR_FROM_INITIALS || M6_LOR_FROM_INITIALS_DEFAULT,
    typistInitials: env.M6_LOR_TYPIST_INITIALS || M6_LOR_TYPIST_INITIALS_DEFAULT,
  };
}

function withFrom(from?: Partial<LorFromBlock> | null): LorFromBlock {
  const base = defaultLorFrom();
  if (!from) return base;
  return {
    companyName: from.companyName ?? base.companyName,
    attention: from.attention ?? base.attention,
    addressLine1: from.addressLine1 ?? base.addressLine1,
    city: from.city ?? base.city,
    state: from.state ?? base.state,
    zip: from.zip ?? base.zip,
    countryCode: from.countryCode ?? base.countryCode,
    phone: from.phone ?? base.phone,
    fax: from.fax ?? base.fax,
    email: from.email ?? base.email,
    initials: from.initials ?? base.initials,
    typistInitials: from.typistInitials ?? base.typistInitials,
  };
}

export function composeLorLetter(
  facts: LorLetterFacts,
  opts?: { today?: string; from?: Partial<LorFromBlock> | null; recipient?: LorRecipient | null },
): LorLetter {
  const today = opts?.today || new Date().toISOString().slice(0, 10);
  const from = withFrom(opts?.from);
  const recipient: LorRecipient = opts?.recipient ? { ...opts.recipient } : { ...M6_LOR_RECIPIENT };
  const clientName = displayClientName(facts);
  const pronouns = pronounsFor(facts.gender);
  const start = isoDate(facts.incidentStart);
  const end = isoDate(facts.incidentEnd);
  const prop = propertyLine(facts);
  const addr = propertyAddress(facts);
  const csz = cityStateZip(facts.propertyCity, facts.propertyState, facts.propertyZip);
  const window = windowLine(start, end);
  const range = dateRangeLine(start, end);
  const preserveFrom = start ? minusYears(start, 3) : minusYears(today, 3);
  const startLong = start ? formatLetterDate(start) : "[start date]";
  const endLong = end ? formatLetterDate(end) : (start ? formatLetterDate(start) : "[end date]");
  const propName = (facts.propertyName || "").trim() || "the property";
  const propStreet = (facts.propertyStreet || "").trim() || "[property street]";
  const fullAddr = addr || "[property address]";
  const who = clientName || "[client name]";
  const sender = from.attention || M6_LOR_FROM_NAME_DEFAULT;
  const injury = M6_LOR_INJURY_PHRASE;
  const days = M6_LOR_RESPONSE_DAYS;
  const recCsz = recipientCityStateZip(recipient);

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

  const preserveItems = [
    `All video recordings of the Property from ${startLong}, through and including ${endLong};`,
    `All surveillance footage of/at the Property from ${startLong}, through and including ${endLong};`,
    `All audio recordings of the Property from ${startLong}, through and including ${endLong};`,
    `All photographs of the Property from ${startLong}, through and including ${endLong};`,
    `All writings, incident reports, statements, and/or other documents related in any manner to ${who} and the Property from ${startLong} through and including ${endLong};`,
    `All writings, incident reports, statements, crime reports, crime notice letters and/or other documents related to previous criminal activity at the Property;`,
    `Any communications of any type with law enforcement about criminal activity or security at the Property;`,
    `All emails, electronic messages, letters, memos, or other documents concerning ${who} and/or the above-referenced incident;`,
    `All contracts, correspondence, invoices and any other documentation concerning any security services for the Property;`,
    `All contracts, correspondence, and any other documentation concerning the ownership and maintenance of the Property;`,
    `All documents related to any employees who worked at or had responsibilities related to the Property including the owner/operator/property manager of the Property from ${startLong} through and including ${endLong};`,
    `All cellular phones and cellular data for any current or former employees and/or property managers who worked at the Property during the six (6) months before and after the above-referenced incident and who were employed by the Property and any third-party vendor hired to perform services at the Property;`,
    `All incident reports involving any injuries of or crimes against employees or invitees at the Property from ${startLong} through and including ${endLong};`,
    `All company policies, procedures, or other internal documents that relate to security, safety, crime, crime prevention, or the like applicable for the three years preceding ${startLong} through and including ${endLong};`,
    `All financial documents related to ownership and/or management of the Property from ${startLong} through and including ${endLong};`,
    `All documents related to the above-referenced incident;`,
    `All other documents that may relate to ${who} and/or this subject incident; and,`,
    `Any other documents and things that may relate to the safety, security, and threat of crime at the Property.`,
  ];

  const insuranceItems = [
    `Each policy of insurance, including excess or umbrella insurance;`,
    `The name of the insurer(s);`,
    `The name of each insured (including all “additional insured(s)”); and,`,
    `Limits of coverage.`,
  ];

  const intro = `This firm represents ${who}, who sustained severe injuries when ${pronouns.they} was ${injury} at the ${propName} located at ${fullAddr}, between ${startLong} through and including ${endLong}. Our client intends to pursue claims against you and any other entity that may be responsible for ${pronouns.their} injuries. We kindly request that upon receipt of this correspondence, you please immediately forward to our office a copy of your complete investigation file, including but not limited to, any and all police reports, investigation reports, witness reports, supplemental reports, photographs, videos, surveillance videos and/or audio you may have in your possession regarding this subject incident involving our client, ${who}.`;

  const insuranceIntro = `Please also allow this letter to serve as a request that you provide our office with a written statement, under oath, of a corporate officer or insurance claim manager of your company for each known insurer that may be liable to my client regarding this incident, indicating within the next ${days} days the following information in regard to the liability insurance policy(ies) issued to, or that may inure to the benefit of, you by your insurance carrier(s):`;

  const insuranceClose = `This request applies to any and all insurance companies that you have insurance coverage with which may provide coverage for the above-referenced incident. Please place your insurance carrier(s) on notice of this incident if you have not already done so.`;

  const preserveIntro = `Please further allow this letter to serve as our formal request that you preserve all documents, evidence, employee files, videos, surveillance, photographs, and any / all other evidence related to the above-referenced incident. We specifically request that you preserve and do not destroy, spoil, alter, modify, repair, or tamper in any way with materials or things relevant to the incident involving our client, ${who}. Specifically, you are hereby directed to maintain and preserve the following:`;

  const preserveClose = `If you are unsure whether a document or thing needs to be saved, please save it. Destruction of these records or things may result in an adverse presumption against you at trial and/or sanctions by the Court. Further, any falsification or alteration of the records or things may be a crime. You may contact me at the number below to discuss whether to preserve any items about which you are unsure. If you fail to preserve and maintain evidence, we will have no alternative but to seek any sanctions allowed under the law.`;

  const thanks = `Thank you for your anticipated cooperation. I welcome the opportunity to discuss this matter with you or your attorney and would certainly appreciate any materials you have in this regard. Please feel free to contact me at your earliest convenience.`;

  const body = [
    sender,
    from.phone,
    `${from.fax}, fax`,
    from.email,
    formatLetterDate(today),
    `${M6_LOR_DELIVERY}:`,
    recipient.orgName,
    `Attention: ${recipient.attention}`,
    recipient.addressLine1,
    recCsz,
    `RE:\tOur Client:\t${who}`,
    `Date of Incident:\t${range || "On / about [incident dates]"}`,
    `Location:\t${propName} located at ${propStreet}`,
    csz,
    `Dear Sir or Madam:`,
    intro,
    `Request for Insurance Information`,
    insuranceIntro,
    ...insuranceItems.map((item, i) => `${i + 1}. ${item}`),
    insuranceClose,
    `Request to Preserve Evidence and Notice Against Spoliation of Evidence`,
    preserveIntro,
    ...preserveItems.map((item, i) => `${i + 1}. ${item}`),
    preserveClose,
    thanks,
    `Sincerely,`,
    sender,
    `${from.initials}/${from.typistInitials}`,
  ].join("\n");

  const html = `<html><body style="font-family:Georgia,'Times New Roman',serif;font-size:11.5pt;line-height:1.45;color:#231F20;max-width:7.2in">
<p style="margin:0 0 2px">${escapeHtml(sender)}<br/>
${escapeHtml(from.phone)}<br/>
${escapeHtml(from.fax)}, fax<br/>
${escapeHtml(from.email)}</p>
<p style="margin:14px 0 2px">${escapeHtml(formatLetterDate(today))}</p>
<p style="margin:14px 0 2px">${escapeHtml(M6_LOR_DELIVERY)}:<br/>
${escapeHtml(recipient.orgName)}<br/>
Attention: ${escapeHtml(recipient.attention)}<br/>
${escapeHtml(recipient.addressLine1)}<br/>
${escapeHtml(recCsz)}</p>
<p style="margin:16px 0 2px"><strong>RE:</strong> Our Client: ${escapeHtml(who)}<br/>
Date of Incident: ${escapeHtml(range || "On / about [incident dates]")}<br/>
Location: ${escapeHtml(propName)} located at ${escapeHtml(propStreet)}<br/>
${escapeHtml(csz)}</p>
<p style="margin:16px 0 10px">Dear Sir or Madam:</p>
<p>${escapeHtml(intro)}</p>
<p style="margin:18px 0 8px"><strong>Request for Insurance Information</strong></p>
<p>${escapeHtml(insuranceIntro)}</p>
<ol>${insuranceItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
<p>${escapeHtml(insuranceClose)}</p>
<p style="margin:18px 0 8px"><strong>Request to Preserve Evidence and Notice Against Spoliation of Evidence</strong></p>
<p>${escapeHtml(preserveIntro)}</p>
<ol>${preserveItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
<p>${escapeHtml(preserveClose)}</p>
<p>${escapeHtml(thanks)}</p>
<p style="margin:22px 0 0">Sincerely,<br/>
${escapeHtml(sender)}<br/>
${escapeHtml(from.initials)}/${escapeHtml(from.typistInitials)}</p>
</body></html>`;

  return {
    date: today,
    clientName,
    leadNo: facts.leadNo ?? null,
    pronouns,
    propertyLine: prop,
    propertyAddress: addr,
    cityStateZip: csz,
    windowLine: window,
    dateRange: range,
    preserveFrom,
    recipient,
    from,
    delivery: M6_LOR_DELIVERY,
    injuryPhrase: injury,
    responseDays: days,
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
