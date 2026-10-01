// ============================================================================
// STANDARD FIELDS (Brett, Sep 28 2026): one name and one source for every
// field that leaves or enters ClaimReach. "A cell is a cell phone, no matter
// what campaign, what file, what screen." Every outbound webhook carries
// these keys, the mapping screen lists them, the standard export prints them,
// and inbound hooks accept the WRITABLE ones. Each key reads ONE column (or
// one derived value); the older duplicate columns (ip_phone, caller_email,
// address, ec1_*) are never a source for these.
//
// The keys are PERMANENT. Add new ones; never rename or repurpose one.
// The full SSN is not stored in ClaimReach (it goes only into the signed
// agreement), so the standard record carries ssn_last4.
//
// Access (Astra round 7b):
//   writable   a sender may set it; inbound hooks store it in `column`.
//   derived    computed from other records (the matter's call, agreement,
//              status list, timestamps). Never set from outside.
//   protected  ids, workflow, ownership and SSN. Never set from outside.
//
// Matter fields (`matter: true`) belong to ONE claim. A record that is not
// bound to a matter (a lead with several matters and no way to tell which,
// or no claim at all) leaves every one of them empty rather than borrowing
// some other matter's status, agreement, call or incident.
// ============================================================================
import { joinUsAddress } from "@/lib/us-address";
import { agreementName } from "@/lib/mva-call/agreement-names";
import { DISPO_LABEL } from "@/lib/mva-call/dispo";
import { crashDateOf } from "@/lib/mva-call/server";
import { stateCodeOf } from "@/lib/mva-call/state";
import { isoDate } from "@/lib/mva-call/lead-story";
import { resolveMatter, matterRowsFilter, rowBelongsToMatter } from "@/lib/matter";
import { pacificCalendarDay, pacificDayStartUtc } from "@/lib/packet-worklist";

export type StdGroup = "file" | "person" | "contact" | "emergency" | "incident" | "status" | "agreement" | "timeline";
export type StdAccess = "writable" | "derived" | "protected";
export interface StdField {
  key: string;
  label: string;
  group: StdGroup;
  source: string;
  kind?: "date" | "datetime" | "phone" | "email" | "text";
  access: StdAccess;
  /** Writable only: the leads column an inbound value is stored in. */
  column?: string;
  /** Writable only: the canonical id the inbound mapper files it under. */
  inbound?: string;
  /** Belongs to one matter (claim). Empty on a record with no matter. */
  matter?: true;
}

export const STANDARD_FIELDS: StdField[] = [
  // The file
  { key: "lead_id", label: "Lead id (internal)", group: "file", source: "leads.id", access: "protected" },
  { key: "lead_no", label: "Lead number", group: "file", source: "leads.lead_no", access: "protected" },
  { key: "claim_id", label: "Matter id (internal)", group: "file", source: "claims.id", access: "protected", matter: true },
  { key: "external_id", label: "Source system id", group: "file", source: "leads.external_id", access: "writable", column: "external_id", inbound: "external_id" },
  { key: "lawruler_id", label: "LawRuler lead id", group: "file", source: "leads.lawruler_ref_no", access: "protected" },
  { key: "source_link", label: "Source system link", group: "file", source: "leads.lawruler_url", access: "writable", column: "lawruler_url", inbound: "source_lead_link" },
  { key: "law_firm", label: "Law firm", group: "file", source: "firms.name", access: "protected" },
  { key: "campaign", label: "Campaign", group: "file", source: "claims.campaign, else leads.campaign", access: "writable", column: "campaign", inbound: "campaign_name" },
  { key: "campaign_id", label: "Campaign id", group: "file", source: "claims.campaign_id, else leads.campaign_id", access: "protected" },
  { key: "case_type", label: "Case type", group: "file", source: "claims.claim_type, else leads.case_type", access: "writable", column: "case_type", inbound: "case_type" },
  { key: "handling_attorney", label: "Handling attorney", group: "file", source: "leads.handling_attorney", access: "writable", column: "handling_attorney", inbound: "handling_attorney" },
  { key: "marketing_source", label: "Marketing source", group: "file", source: "leads.marketing_source", access: "writable", column: "marketing_source", inbound: "marketing_source" },

  // The person
  { key: "first_name", label: "First name", group: "person", source: "leads.first_name", access: "writable", column: "first_name", inbound: "claimant_first_name" },
  { key: "last_name", label: "Last name", group: "person", source: "leads.last_name", access: "writable", column: "last_name", inbound: "claimant_last_name" },
  { key: "full_name", label: "Full name", group: "person", source: "leads.claimant_name, else first + last", access: "writable", column: "claimant_name", inbound: "claimant_full_name" },
  { key: "dob", label: "Date of birth", group: "person", source: "leads.dob", kind: "date", access: "writable", column: "dob", inbound: "claimant_dob" },
  { key: "ssn_last4", label: "SSN (last 4)", group: "person", source: "leads.ssn_last4", access: "protected" },
  { key: "dl_number", label: "Driver's license number", group: "person", source: "leads.dl_number", access: "writable", column: "dl_number", inbound: "claimant_dl_number" },
  { key: "gender", label: "Gender", group: "person", source: "leads.gender", access: "writable", column: "gender", inbound: "claimant_gender" },
  { key: "language", label: "Preferred language", group: "person", source: "leads.preferred_language, else leads.language", access: "writable", column: "preferred_language", inbound: "claimant_language" },

  // Contact
  { key: "cell_phone", label: "Cell phone", group: "contact", source: "leads.phone", kind: "phone", access: "writable", column: "phone", inbound: "claimant_phone" },
  { key: "home_phone", label: "Home phone", group: "contact", source: "leads.home_phone", kind: "phone", access: "writable", column: "home_phone", inbound: "claimant_home_phone" },
  { key: "work_phone", label: "Work phone", group: "contact", source: "leads.work_phone", kind: "phone", access: "writable", column: "work_phone", inbound: "claimant_work_phone" },
  { key: "alt_phone", label: "Alternate phone", group: "contact", source: "leads.phone_alt", kind: "phone", access: "writable", column: "phone_alt", inbound: "claimant_phone_alt" },
  { key: "email", label: "Email", group: "contact", source: "leads.email", kind: "email", access: "writable", column: "email", inbound: "claimant_email" },
  { key: "address1", label: "Street address", group: "contact", source: "leads.mail_addr1", access: "writable", column: "mail_addr1", inbound: "mail_address1" },
  { key: "address2", label: "Address line 2", group: "contact", source: "leads.mail_addr2", access: "writable", column: "mail_addr2", inbound: "mail_address2" },
  { key: "city", label: "City", group: "contact", source: "leads.mail_city", access: "writable", column: "mail_city", inbound: "mail_city" },
  { key: "state", label: "State", group: "contact", source: "leads.mail_state", access: "writable", column: "mail_state", inbound: "mail_state" },
  { key: "zip", label: "ZIP", group: "contact", source: "leads.mail_zip", access: "writable", column: "mail_zip", inbound: "mail_zip" },
  { key: "full_address", label: "Full address (one line)", group: "contact", source: "street, city, state ZIP", access: "derived" },
  { key: "time_zone", label: "Time zone", group: "contact", source: "leads.client_time_zone", access: "writable", column: "client_time_zone", inbound: "client_time_zone" },

  // Emergency contact
  { key: "ec_name", label: "Emergency contact name", group: "emergency", source: "leads.ec_name", access: "writable", column: "ec_name", inbound: "ec_name" },
  { key: "ec_phone", label: "Emergency contact phone", group: "emergency", source: "leads.ec_phone", kind: "phone", access: "writable", column: "ec_phone", inbound: "ec_phone" },
  { key: "ec_relationship", label: "Emergency contact relationship", group: "emergency", source: "leads.ec_relationship", access: "writable", column: "ec_relationship", inbound: "ec_relationship" },

  // The incident. The matter's own call answers first; the lead's columns
  // only when the lead has this one matter.
  { key: "incident_date", label: "Date of incident", group: "incident", source: "the matter's call (Story), else leads.incident_start when it is the only matter", kind: "date", access: "writable", column: "incident_start", inbound: "date_of_incident", matter: true },
  { key: "incident_city", label: "City of incident", group: "incident", source: "the matter's call (Story), else leads.incident_city when it is the only matter", access: "writable", column: "incident_city", inbound: "incident_city", matter: true },
  { key: "incident_state", label: "State of incident", group: "incident", source: "the matter's call (Story), else leads.incident_state when it is the only matter", access: "writable", column: "incident_state", inbound: "incident_state", matter: true },
  { key: "case_summary", label: "Case summary", group: "incident", source: "claims.case_summary, else leads.case_summary, else leads.case_description", access: "writable", column: "case_summary", inbound: "case_summary" },
  { key: "police_report_number", label: "Police report number", group: "incident", source: "the call's File step", access: "derived", matter: true },
  { key: "other_driver_insurance", label: "Other driver's insurance", group: "incident", source: "the call's File step", access: "derived", matter: true },

  // Status and outcome
  { key: "status", label: "Status (key)", group: "status", source: "claims.status", access: "protected", matter: true },
  { key: "status_label", label: "Status", group: "status", source: "statuses.label", access: "derived", matter: true },
  { key: "outcome", label: "Last call outcome", group: "status", source: "latest closed call on this matter", access: "derived", matter: true },
  { key: "outcome_reason", label: "Last call outcome reason", group: "status", source: "latest closed call on this matter", access: "derived", matter: true },
  { key: "callback_at", label: "Call back at", group: "status", source: "latest closed call on this matter", kind: "datetime", access: "derived", matter: true },
  { key: "dq_reason", label: "Disqualified reason", group: "status", source: "claims.dq_reason", access: "protected", matter: true },

  // The agreement: the matter's newest main agreement that is not voided.
  { key: "agreement", label: "Agreement", group: "agreement", source: "the matter's current agreement (newest main one, not voided)", access: "derived", matter: true },
  { key: "esign_sent_date", label: "E-sign sent", group: "agreement", source: "esign_submissions.sent_at", kind: "datetime", access: "derived", matter: true },
  { key: "sign_date", label: "Sign date", group: "agreement", source: "esign_submissions.completed_at / signed_at, else leads.signed_at for an only matter with no agreement on record", kind: "datetime", access: "derived", matter: true },
  { key: "signing_agent", label: "Agent who signed", group: "agreement", source: "the agent who sent the signed agreement", access: "derived", matter: true },

  // Timeline
  { key: "date_entered", label: "Date entered in system", group: "timeline", source: "leads.created_at", kind: "datetime", access: "derived" },
  { key: "first_opened_at", label: "First opened", group: "timeline", source: "leads.first_opened_at", kind: "datetime", access: "derived" },
  { key: "first_contact_at", label: "First contact (date and time)", group: "timeline", source: "leads.first_dialed_at", kind: "datetime", access: "derived" },
  { key: "last_called_at", label: "Last called", group: "timeline", source: "leads.last_called_at", kind: "datetime", access: "derived" },
  { key: "sent_to_firm_at", label: "Sent to the firm", group: "timeline", source: "claims.firm_sent_at, else leads.firm_sent_at when it is the only matter", kind: "datetime", access: "derived", matter: true },
];

export const STANDARD_KEYS = STANDARD_FIELDS.map((f) => f.key);
/** The fields a sender may set, each with the column it is stored in. */
export const WRITABLE_FIELDS = STANDARD_FIELDS.filter((f) => f.access === "writable") as (StdField & { column: string; inbound: string })[];
export const MATTER_KEYS = STANDARD_FIELDS.filter((f) => f.matter).map((f) => f.key);

/** Every column the standard record reads from leads, for one select. */
export const STD_LEAD_COLS = [
  "id", "firm_id", "lead_no", "external_id", "lawruler_ref_no", "lawruler_url", "campaign", "campaign_id", "case_type",
  "handling_attorney", "marketing_source", "first_name", "last_name", "claimant_name", "dob", "ssn_last4", "dl_number",
  "gender", "preferred_language", "language", "phone", "home_phone", "work_phone", "phone_alt", "email",
  "mail_addr1", "mail_addr2", "mail_city", "mail_state", "mail_zip", "client_time_zone",
  "ec_name", "ec_phone", "ec_relationship", "incident_start", "incident_city", "incident_state",
  "case_summary", "case_description", "signed_at", "created_at", "first_opened_at", "first_dialed_at", "last_called_at", "firm_sent_at",
].join(", ");
export const STD_CLAIM_COLS = "id, lead_id, campaign, campaign_id, claim_type, status, dq_reason, case_summary, answers, firm_sent_at, created_at";
/** Main (non-passenger) agreements, voided ones included: history decides the sign date fallback. */
export const STD_SUB_COLS = "id, lead_id, claim_id, campaign_id, pax_index, template_key, status, sent_at, signed_at, completed_at, sent_by, call_id, created_at";
/** The matter's calls. Only the Story of each call's answers is read. */
export const STD_CALL_COLS = "id, lead_id, claim_id, campaign_id, status, disposition, reason, callback_at, agent_name, ended_at, created_at, story:answers->story";

const v = (x: any): string | null => {
  if (x === undefined || x === null) return null;
  const s = String(x).trim();
  return s ? s : null;
};
const desc = (a: any, b: any) => String(b ?? "").localeCompare(String(a ?? ""));
const asc = (a: any, b: any) => String(a ?? "").localeCompare(String(b ?? ""));

// ---------------------------------------------------------------------------
// Where and when. One reading of an incident place, used by the record (the
// call's Story city, "Las Vegas, NV"), the generic inbound hook and the
// LawRuler/marketer ingest, so all three store the same shape: a two-letter
// state code and the city without the state.
// ---------------------------------------------------------------------------
export function incidentColumns(i: { date?: unknown; city?: unknown; state?: unknown }): {
  incident_start: string | null; incident_city: string | null; incident_state: string | null;
} {
  const line = v(i.city);
  const hint = v(i.state);
  let city: string | null = null;
  let fromLine: string | null = null;
  if (line) {
    const code = stateCodeOf(line);
    if (code && line.includes(",")) { fromLine = code; city = v(line.slice(0, line.lastIndexOf(","))); }
    else if (code && !hint) fromLine = code;   // "Alabama" alone (the Story prefill): a state, no city
    else city = line;                          // "Washington" with state DC is a city
  }
  // Only a state we recognize is stored; anything else stays in the sender's raw data.
  const state = stateCodeOf(hint) ?? fromLine;
  return {
    incident_start: isoDate(i.date),
    incident_city: city ? city.slice(0, 80) : null,
    incident_state: state,
  };
}

/**
 * The incident as the MATTER's own call recorded it. A relative crash date
 * ("Today", "Yesterday") is read from the day of the first call on this
 * matter that gave that answer, never from today.
 */
export function matterIncident(story: any, calls: any[] = []): { date: string | null; city: string | null; state: string | null } {
  if (!story || typeof story !== "object") return { date: null, city: null, state: null };
  const place = incidentColumns({ city: story.city });
  let date: string | null = null;
  if (story.when === "Pick a date") date = crashDateOf(story);
  else if (story.when === "Today" || story.when === "Yesterday") {
    const first = calls.filter((c) => c?.story?.when === story.when && c.created_at).sort((a, b) => asc(a.created_at, b.created_at))[0];
    const at = first ? new Date(first.created_at) : null;
    date = at && !isNaN(at.getTime()) ? crashDateOf(story, at) : null;
  }
  return { date, city: place.incident_city, state: place.incident_state };
}

/** The matter's current agreement: the newest main one that is not voided. */
export function currentAgreement(rows: any[]): any | null {
  return (rows ?? []).filter((r) => r && (r.pax_index ?? null) === null && r.status !== "voided")
    .sort((a, b) => desc(a.created_at, b.created_at) || desc(a.id, b.id))[0] ?? null;
}

/** The matter's newest closed call. */
export function lastClosedCall(rows: any[]): any | null {
  return (rows ?? []).filter((r) => r && r.status === "ended")
    .sort((a, b) => (a.ended_at ? 0 : 1) - (b.ended_at ? 0 : 1) || desc(a.ended_at, b.ended_at) || desc(a.created_at, b.created_at) || desc(a.id, b.id))[0] ?? null;
}

/**
 * The standard record from rows already chosen for ONE matter (or none).
 * Pure, so the webhook, the export and the tests all build it the same way.
 * `claim` null = a lead-level record: every matter field is empty.
 * `sole` = the lead has exactly this one claim, the only case where the
 * lead's own copies (incident, signed_at, firm_sent_at) describe the matter.
 */
export function standardFromRows(input: {
  lead: any;
  claim?: any | null;
  sole?: boolean;
  firmName?: string | null;
  statusLabel?: string | null;
  submission?: any | null;    // the matter's current agreement
  hasAgreements?: boolean;    // the matter has any main agreement on record, voided included
  signingAgent?: string | null;
  lastCall?: any | null;      // the matter's newest closed call
  calls?: any[];              // the matter's calls, to date a relative crash day
}): Record<string, string | null> {
  const L = input.lead || {};
  const C = input.claim || null;
  const sole = !!(C && input.sole);
  const leadOnly = !C;
  const S = C ? input.submission || null : null;
  const K = C ? input.lastCall || null : null;
  // The matter's value; the lead's only when the lead IS the matter.
  const own = (claimVal: any, leadVal: any) => v(claimVal) ?? (leadOnly || sole ? v(leadVal) : null);
  const file = (C?.answers?.mva_call?.file) || {};
  const dispo = K?.disposition ? (DISPO_LABEL as any)[K.disposition] || K.disposition : null;
  const carrier = v(file.carrier);
  const inc = C ? matterIncident(C.answers?.mva_call?.story, input.calls ?? []) : { date: null, city: null, state: null };
  // City and state travel together: never the call's state with the lead's city.
  const place = inc.city || inc.state ? { city: inc.city, state: inc.state }
    : sole ? { city: v(L.incident_city), state: v(L.incident_state) } : { city: null, state: null };
  const signed = S && (S.status === "completed" || S.status === "signed");
  return {
    lead_id: v(L.id),
    lead_no: v(L.lead_no),
    claim_id: v(C?.id),
    external_id: v(L.external_id),
    lawruler_id: v(L.lawruler_ref_no),
    source_link: v(L.lawruler_url),
    law_firm: v(input.firmName),
    campaign: own(C?.campaign, L.campaign),
    campaign_id: own(C?.campaign_id, L.campaign_id),
    case_type: own(C?.claim_type, L.case_type),
    handling_attorney: v(L.handling_attorney),
    marketing_source: v(L.marketing_source),

    first_name: v(L.first_name),
    last_name: v(L.last_name),
    full_name: v(L.claimant_name) ?? v([L.first_name, L.last_name].filter(Boolean).join(" ")),
    dob: v(L.dob),
    ssn_last4: v(L.ssn_last4),
    dl_number: v(L.dl_number),
    gender: v(L.gender),
    language: v(L.preferred_language) ?? v(L.language),

    cell_phone: v(L.phone),
    home_phone: v(L.home_phone),
    work_phone: v(L.work_phone),
    alt_phone: v(L.phone_alt),
    email: v(L.email),
    address1: v(L.mail_addr1),
    address2: v(L.mail_addr2),
    city: v(L.mail_city),
    state: v(L.mail_state),
    zip: v(L.mail_zip),
    full_address: v(joinUsAddress({ street: [L.mail_addr1, L.mail_addr2].filter(Boolean).join(", "), city: L.mail_city, state: L.mail_state, zip: L.mail_zip })),
    time_zone: v(L.client_time_zone),

    ec_name: v(L.ec_name),
    ec_phone: v(L.ec_phone),
    ec_relationship: v(L.ec_relationship),

    incident_date: C ? inc.date ?? (sole ? v(L.incident_start) : null) : null,
    incident_city: C ? place.city : null,
    incident_state: C ? place.state : null,
    case_summary: v(C?.case_summary) ?? (leadOnly || sole ? v(L.case_summary) ?? v(L.case_description) : null),
    police_report_number: C ? v(file.report) : null,
    other_driver_insurance: C && carrier && carrier !== "Pick one" ? carrier : null,

    status: v(C?.status),
    status_label: C ? v(input.statusLabel) ?? v(C.status) : null,
    outcome: v(dispo),
    outcome_reason: v(K?.reason),
    callback_at: v(K?.callback_at),
    dq_reason: v(C?.dq_reason),

    agreement: v(agreementName(S?.template_key)),
    esign_sent_date: v(S?.sent_at),
    // A current agreement speaks for itself. The lead's signed_at stands in
    // only for an only matter that has no agreement on record at all (signed
    // before e-sign lived here); a voided one is history, not a signature.
    sign_date: S ? v(S.completed_at) ?? v(S.signed_at) : (sole && !input.hasAgreements ? v(L.signed_at) : null),
    signing_agent: signed ? v(input.signingAgent) : null,

    date_entered: v(L.created_at),
    first_opened_at: v(L.first_opened_at),
    first_contact_at: v(L.first_dialed_at),
    last_called_at: v(L.last_called_at),
    sent_to_firm_at: C ? v(C.firm_sent_at) ?? (sole ? v(L.firm_sent_at) : null) : null,
  };
}

/**
 * The record for one matter from the lead's rows. Picks the matter's own
 * agreements and calls with the shared association rule (a legacy row with
 * no claim counts only for an only matter on a compatible campaign), so the
 * webhook and the CSV choose the same rows.
 */
export function standardForMatter(i: {
  lead: any;
  claim: any | null;
  sole: boolean;
  firmName?: string | null;
  statusLabel?: string | null;
  submissions?: any[];
  calls?: any[];
  staffName?: (id: string) => string | null;
  agentOfCall?: (id: string) => string | null;
}): Record<string, string | null> {
  const m = i.claim ? { claim: { id: String(i.claim.id), campaign_id: i.claim.campaign_id ?? null }, sole: !!i.sole } : null;
  const subs = m ? (i.submissions ?? []).filter((r) => (r.pax_index ?? null) === null && rowBelongsToMatter(r, m)) : [];
  const calls = m ? (i.calls ?? []).filter((r) => rowBelongsToMatter(r, m)) : [];
  const submission = currentAgreement(subs);
  let signingAgent: string | null = null;
  if (submission?.sent_by && i.staffName) signingAgent = i.staffName(String(submission.sent_by));
  if (!signingAgent && submission?.call_id && i.agentOfCall) signingAgent = i.agentOfCall(String(submission.call_id));
  return standardFromRows({
    lead: i.lead, claim: i.claim, sole: i.sole, firmName: i.firmName, statusLabel: i.statusLabel,
    submission, hasAgreements: subs.length > 0, signingAgent, lastCall: lastClosedCall(calls), calls,
  });
}

export type StandardResult =
  | { ok: true; record: Record<string, string | null>; matter: "named" | "only" | "campaign" | "none" }
  | { ok: false; error: string };

/**
 * Load and build the standard record for one lead and its matter. The matter
 * comes from resolveMatter (the one rule): a named claim must exist and
 * belong to the lead, or this fails; unnamed, the only claim or the single
 * one on the campaign. Several matters with no single campaign match (or no
 * claim at all) gives a lead-level record ("none") with every matter field
 * empty. Any failed read fails the whole record: never a partial one.
 * Service-role client expected: this feeds webhooks, which run server-side
 * for the firm that owns the file.
 */
export async function buildStandardRecord(
  db: any,
  leadId: string,
  opts: { claimId?: string | null; campaignId?: string | null; firmId?: string | null } = {},
): Promise<StandardResult> {
  const { data: lead, error: leadErr } = await db.from("leads").select(STD_LEAD_COLS).eq("id", leadId).maybeSingle();
  if (leadErr) return { ok: false, error: `Could not read the file: ${leadErr.message}` };
  if (!lead) return { ok: false, error: "That file no longer exists." };
  // A service-role read: the file must belong to the firm the event is going to.
  if (opts.firmId && lead.firm_id !== opts.firmId) return { ok: false, error: "That file belongs to a different firm." };

  const named = opts.claimId ? String(opts.claimId) : null;
  const m = await resolveMatter(db, leadId, { claimId: named, campaignId: opts.campaignId ?? lead.campaign_id ?? null });
  let claim: any = null;
  let sole = false;
  let matter: "named" | "only" | "campaign" | "none" = "none";
  if (m.ok) {
    const { data, error } = await db.from("claims").select(STD_CLAIM_COLS).eq("id", m.claim.id).eq("lead_id", leadId).maybeSingle();
    if (error) return { ok: false, error: `Could not read the claim: ${error.message}` };
    if (!data) return { ok: false, error: "That claim no longer exists." };
    claim = data; sole = m.sole; matter = m.via;
  } else if (named || m.status !== 409) {
    // A named claim that is missing or on another file, or a failed read.
    return { ok: false, error: m.error };
  }

  const none = { data: null, error: null };
  const filter = claim ? matterRowsFilter({ claim: { id: claim.id, campaign_id: claim.campaign_id ?? null }, sole }) : "";
  const [firmRes, statusRes, subRes, callRes] = await Promise.all([
    lead.firm_id ? db.from("firms").select("name").eq("id", lead.firm_id).maybeSingle() : Promise.resolve(none),
    claim?.status ? db.from("statuses").select("label").eq("key", claim.status).maybeSingle() : Promise.resolve(none),
    claim ? db.from("esign_submissions").select(STD_SUB_COLS).eq("lead_id", leadId).is("pax_index", null).or(filter).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    claim ? db.from("intake_calls").select(STD_CALL_COLS).eq("lead_id", leadId).or(filter).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [r, what] of [[firmRes, "the firm"], [statusRes, "the status list"], [subRes, "the agreements"], [callRes, "the calls"]] as const) {
    if (r?.error) return { ok: false, error: `Could not read ${what}: ${r.error.message}` };
  }
  const subs: any[] = subRes?.data ?? [];
  const calls: any[] = callRes?.data ?? [];

  // Who signed: the sender of the current agreement, else the agent on its call.
  const cur = claim ? currentAgreement(subs.filter((r) => rowBelongsToMatter(r, { claim: { id: claim.id, campaign_id: claim.campaign_id ?? null }, sole }))) : null;
  const staff = new Map<string, string | null>();
  const callAgent = new Map<string, string | null>(calls.map((c) => [String(c.id), c.agent_name ?? null]));
  if (cur?.sent_by) {
    const { data: u, error } = await db.from("app_users").select("full_name").eq("id", cur.sent_by).maybeSingle();
    if (error) return { ok: false, error: `Could not read who sent the agreement: ${error.message}` };
    staff.set(String(cur.sent_by), u?.full_name ?? null);
  }
  if (cur?.call_id && !callAgent.has(String(cur.call_id)) && !staff.get(String(cur.sent_by ?? ""))) {
    const { data: c, error } = await db.from("intake_calls").select("id, agent_name").eq("id", cur.call_id).eq("lead_id", leadId).maybeSingle();
    if (error) return { ok: false, error: `Could not read the agreement's call: ${error.message}` };
    callAgent.set(String(cur.call_id), c?.agent_name ?? null);
  }

  const record = standardForMatter({
    lead, claim, sole, firmName: firmRes?.data?.name ?? null, statusLabel: statusRes?.data?.label ?? null,
    submissions: subs, calls,
    staffName: (id) => staff.get(id) ?? null,
    agentOfCall: (id) => callAgent.get(id) ?? null,
  });
  return { ok: true, record, matter };
}

/**
 * The flat field bag an outbound event carries. Standard keys are
 * authoritative: the standard record's value wins over anything the event
 * producer spread in under the same name (Astra round 7b: leads.case_type
 * overwrote the matter's case_type). Every other event key is kept.
 * When the standard record could not be built, the event still goes out,
 * without standard values (only its own lead_id and claim_id, which name
 * the file it is about) and with `standard_error` saying why.
 * `standard` null = not attempted (an event that is not about a file).
 */
export function eventFields(data: Record<string, any>, standard: StandardResult | null, answers?: Record<string, any> | null): Record<string, any> {
  const bag: Record<string, any> = { ...(answers ?? {}), ...(data ?? {}) };
  if (!standard) return bag;
  if (standard.ok) {
    for (const k of STANDARD_KEYS) bag[k] = standard.record[k] ?? null;
    return bag;
  }
  for (const k of STANDARD_KEYS) if (k !== "lead_id" && k !== "claim_id") delete bag[k];
  bag.standard_error = standard.error;
  return bag;
}

// ============================================================================
// THE STANDARD EXPORT. One row per matter; a file with no claim is one
// lead-level row. Filters that describe a matter (campaign, case type,
// status) test the MATTER's own values, so a campaign export holds that
// campaign's matters and never their siblings. Reads page through
// everything in a fixed order; a failed or changing read fails the export.
// ============================================================================
export interface ExportFilter {
  campaignId?: string | null;
  campaign?: string | null;
  caseType?: string | null;
  status?: string | null;
  firmId?: string | null;
  state?: string | null;
  city?: string | null;
  since?: string | null;       // created on or after (YYYY-MM-DD)
  until?: string | null;       // created on or before
  signedFrom?: string | null;
  signedTo?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[\w-]{1,64}$/;

/** Read the export's filters from a query string. A malformed filter is an error, never "no filter". */
export function exportFilterFrom(p: URLSearchParams): { ok: true; filter: ExportFilter } | { ok: false; error: string } {
  const get = (k: string) => { const s = (p.get(k) || "").trim(); return s || null; };
  const f: ExportFilter = {
    campaignId: get("campaign_id"), campaign: get("campaign"), caseType: get("case_type"), status: get("status"),
    firmId: get("firm_id"), state: get("state"), city: get("city"),
    since: get("since"), until: get("until"), signedFrom: get("signed_from"), signedTo: get("signed_to"),
  };
  if (f.campaignId && !UUID.test(f.campaignId)) return { ok: false, error: "That campaign id is not valid." };
  if (f.firmId && !UUID.test(f.firmId)) return { ok: false, error: "That firm id is not valid." };
  if (f.caseType && !KEY.test(f.caseType)) return { ok: false, error: "That case type is not valid." };
  if (f.status && !KEY.test(f.status)) return { ok: false, error: "That status is not valid." };
  for (const [k, val] of [["since", f.since], ["until", f.until], ["signed_from", f.signedFrom], ["signed_to", f.signedTo]] as const) {
    if (val && !DAY.test(val)) return { ok: false, error: `The ${k.replace("_", " ")} date must look like 2026-09-28.` };
  }
  if ((f.campaign && f.campaign.length > 200) || (f.state && f.state.length > 60) || (f.city && f.city.length > 120)) return { ok: false, error: "A filter is too long." };
  return { ok: true, filter: f };
}

const nextDay = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

/** Does this record's matter pass the matter filters? Same values the CSV prints. */
export function matterMatches(rec: Record<string, string | null>, f: ExportFilter): boolean {
  if (f.campaignId && rec.campaign_id !== f.campaignId) return false;
  if (f.campaign && rec.campaign !== f.campaign) return false;
  if (f.caseType && rec.case_type !== f.caseType) return false;
  // The Leads page shows a file with no status as New.
  if (f.status && (rec.status ?? "new") !== f.status) return false;
  return true;
}

/** Each lead's matters (a lead with no claim is one lead-level matter), those passing the filter. Pure. */
export function selectExportMatters(leads: any[], claims: any[], f: ExportFilter): { lead: any; claim: any | null; sole: boolean }[] {
  const byLead = new Map<string, any[]>();
  for (const c of claims ?? []) { const k = String(c.lead_id); (byLead.get(k) ?? byLead.set(k, []).get(k)!).push(c); }
  const out: { lead: any; claim: any | null; sole: boolean }[] = [];
  for (const lead of leads ?? []) {
    const list = (byLead.get(String(lead.id)) ?? []).slice().sort((a, b) => asc(a.created_at, b.created_at) || asc(a.id, b.id));
    const sole = list.length === 1;
    for (const claim of list.length ? list : [null]) {
      // The matter filters read only the lead and claim, so this is the final answer.
      if (matterMatches(standardFromRows({ lead, claim, sole }), f)) out.push({ lead, claim, sole });
    }
  }
  return out;
}

/** The export's records from the selected matters and the rows loaded for their files. Pure. */
export function exportRows(input: {
  matters: { lead: any; claim: any | null; sole: boolean }[];
  submissions: any[];
  calls: any[];
  statusLabels: Map<string, string>;
  firmNames: Map<string, string>;
  staffNames: Map<string, string>;
}): Record<string, string | null>[] {
  const group = (rows: any[]) => {
    const m = new Map<string, any[]>();
    for (const r of rows ?? []) { const k = String(r.lead_id); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return m;
  };
  const subsBy = group(input.submissions), callsBy = group(input.calls);
  return input.matters.map(({ lead, claim, sole }) => {
    const calls = callsBy.get(String(lead.id)) ?? [];
    const agent = new Map<string, string | null>(calls.map((c) => [String(c.id), c.agent_name ?? null]));
    return standardForMatter({
      lead, claim, sole,
      firmName: input.firmNames.get(String(lead.firm_id)) ?? null,
      statusLabel: claim?.status ? input.statusLabels.get(String(claim.status)) ?? null : null,
      submissions: subsBy.get(String(lead.id)) ?? [],
      calls,
      staffName: (id) => input.staffNames.get(id) ?? null,
      agentOfCall: (id) => agent.get(id) ?? null,
    });
  });
}

type Read = { ok: true; rows: any[] } | { ok: false; error: string };

/**
 * Every row a query returns, a page at a time in its fixed order. The first
 * page carries the total; the read is complete only when every row came
 * back. A failed page, or rows vanishing mid-read, fails the read.
 */
export async function readAll(make: () => any, what: string, page = 1000): Promise<Read> {
  const rows: any[] = [];
  let total: number | null = null;
  for (let from = 0; ;) {
    const { data, error, count } = await make().range(from, from + page - 1);
    if (error) return { ok: false, error: `Could not read ${what}: ${error.message}` };
    const got: any[] = data ?? [];
    if (total === null && typeof count === "number") total = count;
    rows.push(...got);
    from += got.length;
    if (!got.length || (total !== null ? rows.length >= total : got.length < page)) break;
  }
  if (total !== null && rows.length < total) return { ok: false, error: `The ${what} changed while exporting. Try again.` };
  return { ok: true, rows };
}

/** The same read over a long id list, a slice of ids at a time. */
export async function readAllIn(ids: string[], size: number, make: (part: string[]) => any, what: string): Promise<Read> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size);
    const r = await readAll(() => make(part), what);
    if (!r.ok) return r;
    rows.push(...r.rows);
  }
  return { ok: true, rows };
}

/**
 * Load everything the export needs and build its records. The caller's own
 * session client is expected (RLS decides which files it sees).
 */
export async function loadStandardExport(db: any, f: ExportFilter, chunk = 150): Promise<{ ok: true; records: Record<string, string | null>[] } | { ok: false; error: string }> {
  const leads = await readAll(() => {
    let q = db.from("leads").select(STD_LEAD_COLS, { count: "exact" }).is("archived_at", null);
    if (f.firmId) q = q.eq("firm_id", f.firmId);
    if (f.state) q = q.eq("mail_state", f.state);
    if (f.city) q = q.eq("mail_city", f.city);
    if (f.since) q = q.gte("created_at", pacificDayStartUtc(f.since));
    if (f.until) q = q.lt("created_at", pacificDayStartUtc(nextDay(f.until)));
    return q.order("created_at", { ascending: true }).order("id", { ascending: true });
  }, "the files");
  if (!leads.ok) return leads;
  const leadIds = leads.rows.map((l) => String(l.id));

  const claims = await readAllIn(leadIds, chunk, (part) => db.from("claims").select(STD_CLAIM_COLS, { count: "exact" }).in("lead_id", part)
    .order("created_at", { ascending: true }).order("id", { ascending: true }), "the claims");
  if (!claims.ok) return claims;

  const matters = selectExportMatters(leads.rows, claims.rows, f);
  const keptLeads = Array.from(new Set(matters.filter((m) => m.claim).map((m) => String(m.lead.id))));
  const firmIds = Array.from(new Set(matters.map((m) => m.lead.firm_id).filter(Boolean).map(String)));

  const [subs, calls, statuses, firms] = await Promise.all([
    readAllIn(keptLeads, chunk, (part) => db.from("esign_submissions").select(STD_SUB_COLS, { count: "exact" }).in("lead_id", part).is("pax_index", null)
      .order("id", { ascending: true }), "the agreements"),
    readAllIn(keptLeads, chunk, (part) => db.from("intake_calls").select(STD_CALL_COLS, { count: "exact" }).in("lead_id", part)
      .order("id", { ascending: true }), "the calls"),
    readAll(() => db.from("statuses").select("key, label", { count: "exact" }).order("key", { ascending: true }), "the status list"),
    readAllIn(firmIds, chunk, (part) => db.from("firms").select("id, name", { count: "exact" }).in("id", part).order("id", { ascending: true }), "the firms"),
  ]);
  for (const r of [subs, calls, statuses, firms]) if (!r.ok) return r;
  const ok = (r: Read) => (r as { ok: true; rows: any[] }).rows;

  const staffIds = Array.from(new Set(ok(subs).map((s) => s.sent_by).filter(Boolean).map(String)));
  const staff = await readAllIn(staffIds, chunk, (part) => db.from("app_users").select("id, full_name", { count: "exact" }).in("id", part).order("id", { ascending: true }), "who sent the agreements");
  if (!staff.ok) return staff;

  const records = exportRows({
    matters,
    submissions: ok(subs),
    calls: ok(calls),
    statusLabels: new Map(ok(statuses).map((s) => [String(s.key), s.label])),
    firmNames: new Map(ok(firms).map((x) => [String(x.id), x.name])),
    staffNames: new Map(staff.rows.map((u) => [String(u.id), u.full_name])),
  });
  // Signing belongs to the exported matter, not its person's lead-level copy.
  // Filter only after resolving each record's own agreement evidence/date.
  const signedFrom = f.signedFrom ?? null;
  const signedUntil = f.signedTo ?? null;
  const filtered = signedFrom === null && signedUntil === null ? records : records.filter((record) => {
    const signed = record.sign_date ? pacificCalendarDay(record.sign_date) : null;
    return signed !== null && (signedFrom === null || signed >= signedFrom) && (signedUntil === null || signed <= signedUntil);
  });
  return { ok: true, records: filtered };
}

function csvEscape(x: any): string {
  const s = x === null || x === undefined ? "" : String(x);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Header row of standard names, then one row per record, in the standard order. */
export function standardCsv(records: Record<string, string | null>[]): string {
  const lines = [STANDARD_KEYS.join(",")];
  for (const rec of records) lines.push(STANDARD_KEYS.map((k) => csvEscape(rec[k])).join(","));
  return lines.join("\n");
}
