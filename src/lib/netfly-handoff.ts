import { stateCodeOf } from './mva-call/state';

// Shared by pasted emails, incoming mail, and source read-back. Email headers
// and signatures never become the client's contact information.
export const NETFLY_HANDOFF_LABELS = [
  'Client/Driver', 'Client Phone', 'Client Email', 'Client Address', 'Date of Birth',
  'LawRuler Lead ID', 'Accident Date', 'Location', 'Accident City', 'Accident State',
  'Case #', 'Reporting Agency', 'Passengers', 'Airbags', 'Accident Summary',
  'Insurance', 'Client Insurer', 'Other Driver Insurer', 'Claim Number',
  'Injuries & Treatment', 'Treatment Received', 'Treatment Provider', 'Treatment Date',
  'Health Insurance', 'Representation', 'Next Steps', 'Accident Type', 'At Fault', 'Additional Information',
] as const;
const labelKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string> = {
  client: 'Client/Driver', clientname: 'Client/Driver', fullname: 'Client/Driver',
  cellphone: 'Client Phone', clientphonenumber: 'Client Phone', clientemailaddress: 'Client Email',
  mailingaddress: 'Client Address', dob: 'Date of Birth', leadid: 'LawRuler Lead ID',
  dateofincident: 'Accident Date', dateofaccident: 'Accident Date', dol: 'Accident Date', accidentlocation: 'Location', city: 'Location',
  casenumber: 'Case #', policereportnumber: 'Case #', policereport: 'Case #',
  policedepartment: 'Reporting Agency', policeagency: 'Reporting Agency',
  accidentnarrative: 'Accident Summary', casedescription: 'Accident Summary', summary: 'Accident Summary',
  injuriesandtreatment: 'Injuries & Treatment', autoinsurance: 'Client Insurer',
  otherdriversinsurance: 'Other Driver Insurer', healthinsuranceprovider: 'Health Insurance',
};
const multiline = new Set(['Accident Summary', 'Insurance', 'Injuries & Treatment', 'Representation', 'Next Steps', 'Additional Information']);

/** HTML is converted to plain text only; no email markup is ever rendered. */
export function emailPlainText(input: string): string {
  return input.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi,
      (tag, href) => approvedAgreementUrl(href.replace(/&amp;/gi, '&')) ? `\n${href.replace(/&amp;/gi, '&')}\n` : tag)
    .replace(/<\/?(?:div|p|tr|li|blockquote)\b[^>]*>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ': ').replace(/<([^<>\s]+@[^<>\s]+)>/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n?/g, '\n');
}

/** Keep provider viewer links as evidence; never fetch arbitrary URLs from mail. */
export function approvedAgreementUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'go.easyclaimcenter.com' || url.port || url.username || url.password ||
      !/^\/documents\/v1\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/i.test(url.pathname) ||
      [...url.searchParams.keys()].some(key => key !== 'locale')) return null;
    return url.toString();
  } catch { return null; }
}

const cleanLine = (raw: string) => raw.trim().replace(/^>\s?/, '').replace(/\*\*/g, '').replace(/\\$/, '').trim();
const contactNameKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function handoffContactBlock(lines: string[]) {
  const start = lines.findIndex(line => /^contact\s+information\s*:?$/i.test(line));
  if (start < 0) return null;
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line) continue;
    if (/^(?:(?:the\s+)?signed\s+agreement|accident\s+details|agent\s+comments|note|from|to|cc|subject|contact\s+information)\s*:/i.test(line) || block.length >= 8) break;
    block.push(line);
  }
  const name = (block[0] || '').replace(/^(?:client(?:\/driver)?|client\s+name)\s*:\s*/i, '').trim();
  if (!/^[\p{L}][\p{L} .’'-]{1,159}$/u.test(name)) return null;
  const emails = [...new Set(block.slice(1).map(line => line.replace(/^\[([^\]]+)\]\(mailto:[^)]+\)$/, '$1'))
    .filter(line => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(line)))];
  const phones = [...new Set(block.slice(1).filter(line => /^\+?[\d() .-]+$/.test(line))
    .map(line => line.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')).filter(line => /^\d{10}$/.test(line)))];
  return { name, email: emails.length === 1 ? emails[0] : '', phone: phones.length === 1 ? phones[0] : '' };
}

export function parseNetflyHandoff(note: string): { label: string; value: string }[] {
  const headings = new Map<string, string>(NETFLY_HANDOFF_LABELS.map(label => [labelKey(label), label]));
  for (const [alias, label] of Object.entries(aliases)) headings.set(alias, label);
  const values = new Map<string, string>();
  let current: string | null = null;
  const lines = emailPlainText(note).split('\n').map(cleanLine);
  for (const line of lines) {
    if (!line) continue;
    if (/^(?:--+|_{3,}|thanks(?:,|$)|thank you(?:,|$)|regards|sincerely|sent from|on .+ wrote:)/i.test(line)) { current = null; continue; }
    const match = /^([^:]{2,50}):\s*(.*)$/.exec(line);
    const heading = headings.get(labelKey(match ? match[1] : line));
    // Mail clients wrap prose: a line ending "client." is not a new client.
    // Only narrative section titles can omit the colon.
    const label = match || (heading && multiline.has(heading) && !/[.!?]$/.test(line)) ? heading : undefined;
    if (label) {
      // A second client starts a separate account, not missing fields for the first.
      if (label === 'Client/Driver' && values.has(label)) break;
      // The first labeled account wins. A quoted older email cannot replace it.
      current = values.has(label) ? null : label;
      if (current) values.set(current, match ? match[2].trim() : '');
    } else if (match) current = null;
    else if (current && (!values.get(current) || multiline.has(current))) {
      values.set(current, `${values.get(current) || ''} ${line}`.trim());
    }
  }
  const contact = handoffContactBlock(lines);
  if (contact && (!values.get('Client/Driver') || contactNameKey(contact.name) === contactNameKey(values.get('Client/Driver')!))) {
    if (!values.get('Client/Driver')) values.set('Client/Driver', contact.name);
    if (contact.email && !values.get('Client Email')) values.set('Client Email', contact.email);
    if (contact.phone && !values.get('Client Phone')) values.set('Client Phone', contact.phone);
  }
  // NETFLY's standard email has a compact, comma-separated details block.
  // Explicit agent notes above win; a relative month is never an exact DOL.
  const detailsStart = lines.findIndex(line => /^accident\s+details\s*:?$/i.test(line));
  if (detailsStart >= 0) {
    const details: string[] = [];
    for (const line of lines.slice(detailsStart + 1)) {
      if (/^(?:agent\s+comments|note|from|to|cc|subject|contact\s+information)\s*:/i.test(line)) break;
      details.push(line);
      if (details.length >= 12) break;
    }
    const compact = details.join(' ');
    for (const [key, label] of [['State', 'Accident State'], ['City', 'Accident City'], ['Accident Type', 'Accident Type'], ['At fault', 'At Fault']]) {
      const match = new RegExp('(?:^|,)\\s*' + key + '\\s*:\\s*([^,]*)', 'i').exec(compact);
      if (match?.[1].trim() && !values.has(label)) values.set(label, match[1].trim());
    }
  }
  return NETFLY_HANDOFF_LABELS.filter(label => values.get(label)).map(label => ({ label, value: values.get(label)! }));
}

/** Only explicit routing headings, never a mention of a former lawyer in prose. */
export function handoffFirmNames(note: string): string[] {
  const names = new Set<string>();
  for (const raw of emailPlainText(note).split('\n')) {
    const line = raw.trim().replace(/^>\s?/, '').replace(/\*\*/g, '').trim();
    const match = /^(?:accident\s+intake\s+note\s*[-–—:]|(?:law\s+firm|receiving\s+firm|firm)\s*:)\s*(.{2,160})$/i.exec(line);
    if (match) names.add(match[1].trim());
  }
  return [...names];
}

export function handoffFirmMatches(declared: string, firm: { name: string; slug?: string }): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(word => word && !['the', 'and', 'law', 'firm', 'llp', 'pllc', 'llc', 'pc'].includes(word)).join(' ');
  const source = normalize(declared), expected = normalize(firm.name);
  // Accept a leading partner shorthand such as "Example Law" for
  // "Example, Second & Third"; never partial words or an unrelated name.
  return !!source && (!!expected && (source === expected || expected.startsWith(source + ' ')) || source === normalize(firm.slug || ''));
}

export function emailDate(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  const iso = m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export type HandoffCandidate = { id: string; value: string; source: string };
export function extractNetflyEmail(note: string) {
  const rows = parseNetflyHandoff(note);
  const source = Object.fromEntries(rows.map(row => [row.label, row.value]));
  const lines = emailPlainText(note).split('\n').map(cleanLine);
  const contact = handoffContactBlock(lines);
  const mismatchedContact = !!contact && !!source['Client/Driver'] && contactNameKey(contact.name) !== contactNameKey(source['Client/Driver']);
  const warnings: string[] = [];
  if (mismatchedContact) warnings.push('The contact block names a different client. Its phone, email and agreement link were not applied. Check the original email.');
  const agreementLinks: string[] = [];
  let inAgreement = false;
  for (const line of lines) {
    if (/^(?:the\s+)?signed\s+agreement\s*:?$/i.test(line)) { inAgreement = true; continue; }
    if (!line) continue;
    if (inAgreement) {
      for (const match of line.matchAll(/https:\/\/[^\s<>"')]+/g)) {
        const url = approvedAgreementUrl(match[0]);
        if (url && !mismatchedContact && !agreementLinks.includes(url)) agreementLinks.push(url);
      }
      // The provider's agreement section contains one link; do not search footers.
      break;
    }
  }
  if ((agreementLinks.length || /^(?:Subject:\s*)?(?:(?:Re|Fw|Fwd):\s*)*New Signing[!:]/im.test(note)) &&
    /\b(?:(?:has\s+not|hasn't|not)\s+(?:yet\s+)?retained\s+(?:an?\s+)?(?:attorney|lawyer)|no\s+(?:attorney|lawyer)\s+retained)\b/i.test(source.Representation || ''))
    warnings.push('The email says signed, but its representation note says no attorney retained. Check the signed PDF before approving the file.');
  const candidates: HandoffCandidate[] = [];
  const add = (id: string, label: string, value = source[label]) => {
    if (value?.trim() && !candidates.some(c => c.id === id)) candidates.push({ id, value: value.trim(), source: label });
  };
  add('confirmed_name', 'Client/Driver');
  const phone = (source['Client Phone'] || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (/^\d{10}$/.test(phone)) add('confirmed_phone', 'Client Phone', phone);
  const email = source['Client Email']?.replace(/^\[([^\]]+)\]\(mailto:[^)]+\)$/, '$1');
  if (email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) add('confirmed_email', 'Client Email', email);
  add('mailing_address', 'Client Address');
  for (const [id, label] of [['dob', 'Date of Birth'], ['accident_date', 'Accident Date'], ['first_visit', 'Treatment Date']]) {
    const date = emailDate(source[label] || ''); if (date) add(id, label, date);
  }
  add('accident_city', 'Accident City');
  const state = stateCodeOf(source['Accident State']); if (state) add('accident_state', 'Accident State', state);
  // Only split the explicit "City, State – Road" format; otherwise preserve
  // Location as source text and let the rep resolve it.
  const location = /^([^,]+),\s*([A-Za-z .]+?)(?:\s+[–—-]\s+(.+))?$/.exec(source.Location || '');
  const locationState = location && stateCodeOf(location[2]);
  if (location && locationState) {
    add('accident_city', 'Location', location[1]); add('accident_state', 'Location', locationState);
    if (location[3]) add('road', 'Location', location[3]);
  }
  add('police_report', 'Case #'); add('police_department', 'Reporting Agency');
  add('incident_story', 'Accident Summary');
  // Keep narrative sections intact in their matching notes fields. These are
  // NETFLY's account, not clinical conclusions or answers confirmed on our call.
  add('insurance_notes', 'Insurance');
  add('other_pain', 'Injuries & Treatment');
  const passengers = source.Passengers || '';
  if (/^(?:none|no|0|no passengers)\.?$/i.test(passengers)) add('passengers', 'Passengers', 'No');
  else if (/^yes\b|^[1-9]\d*\b/i.test(passengers)) { add('passengers', 'Passengers', 'Yes'); add('passenger_details', 'Passengers'); }
  add('auto_carrier', 'Client Insurer'); add('other_insurer', 'Other Driver Insurer');
  add('insurance_claim_number', 'Claim Number');
  add('first_provider', 'Treatment Provider');
  if (/^(yes|no)$/i.test(source['Treatment Received'] || '')) add('seen_doctor', 'Treatment Received', /^yes$/i.test(source['Treatment Received']) ? 'Yes' : 'No');
  // Narrative ambiguity stays in the original source. Do not infer medical
  // answers, fault, representation, consent, or signing state from prose.
  const health = source['Health Insurance'] || '';
  if (/^(?:no|none|uninsured)\.?$/i.test(health)) add('health_insured', 'Health Insurance', 'No');
  else if (/^yes\.?$/i.test(health)) add('health_insured', 'Health Insurance', 'Yes');
  else if (health && !/^(?:unknown|not sure|pending)\.?$/i.test(health)) add('health_carrier', 'Health Insurance');
  return { rows, candidates, fields: Object.fromEntries(candidates.map(c => [c.id, c.value])), agreementLinks, warnings };
}

/** A dedicated inbox still receives replies and reminders: those are not new cases. */
export function isNetflyCaseEmail(subject: string, body: string): boolean {
  const extracted = extractNetflyEmail(body);
  return /^(?:(?:re|fw|fwd):\s*)*new signing\b/i.test(subject.trim()) ||
    extracted.agreementLinks.length > 0 ||
    extracted.rows.some(row => row.label === 'Client/Driver') &&
      extracted.rows.some(row => ['Accident Summary', 'Accident Date', 'Case #'].includes(row.label));
}

/** Import into empty answers only. Explicit unavailable answers also win. */
export function planHandoffFields(note: string, current: Record<string, string>, selected: string[]) {
  const allowed = new Set(selected);
  const fields: Record<string, string> = {};
  const skipped: string[] = [];
  for (const candidate of extractNetflyEmail(note).candidates) {
    if (!allowed.has(candidate.id)) continue;
    if (current[candidate.id]?.trim() || current[`${candidate.id}_unavailable`]) skipped.push(candidate.id);
    else fields[candidate.id] = candidate.value;
  }
  return { fields, skipped };
}
