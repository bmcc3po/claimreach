// ============================================================================
// STANDARD FIELDS (Brett, Sep 28 2026): one name and one source for every
// field that leaves or enters ClaimReach. "A cell is a cell phone, no matter
// what campaign, what file, what screen." Every outbound webhook carries
// these keys, the mapping screen lists them, the standard export prints them,
// and inbound hooks accept them. Each key reads ONE column (or one derived
// value); the older duplicate columns (ip_phone, caller_email, address,
// ec1_*) are never a source for these.
//
// The keys are PERMANENT. Add new ones; never rename or repurpose one.
// The full SSN is not stored in ClaimReach (it goes only into the signed
// agreement), so the standard record carries ssn_last4.
// ============================================================================
import { joinUsAddress } from "@/lib/us-address";
import { agreementName } from "@/lib/mva-call/agreement-names";
import { DISPO_LABEL } from "@/lib/mva-call/dispo";

export type StdGroup = "file" | "person" | "contact" | "emergency" | "incident" | "status" | "agreement" | "timeline";
export interface StdField { key: string; label: string; group: StdGroup; source: string; kind?: "date" | "datetime" | "phone" | "email" | "text" }

export const STANDARD_FIELDS: StdField[] = [
  // The file
  { key: "lead_id", label: "Lead id (internal)", group: "file", source: "leads.id" },
  { key: "lead_no", label: "Lead number", group: "file", source: "leads.lead_no" },
  { key: "claim_id", label: "Matter id (internal)", group: "file", source: "claims.id" },
  { key: "external_id", label: "Source system id", group: "file", source: "leads.external_id" },
  { key: "lawruler_id", label: "LawRuler lead id", group: "file", source: "leads.lawruler_ref_no" },
  { key: "source_link", label: "Source system link", group: "file", source: "leads.lawruler_url" },
  { key: "law_firm", label: "Law firm", group: "file", source: "firms.name" },
  { key: "campaign", label: "Campaign", group: "file", source: "claims.campaign, else leads.campaign" },
  { key: "campaign_id", label: "Campaign id", group: "file", source: "claims.campaign_id, else leads.campaign_id" },
  { key: "case_type", label: "Case type", group: "file", source: "claims.claim_type, else leads.case_type" },
  { key: "handling_attorney", label: "Handling attorney", group: "file", source: "leads.handling_attorney" },
  { key: "marketing_source", label: "Marketing source", group: "file", source: "leads.marketing_source" },

  // The person
  { key: "first_name", label: "First name", group: "person", source: "leads.first_name" },
  { key: "last_name", label: "Last name", group: "person", source: "leads.last_name" },
  { key: "full_name", label: "Full name", group: "person", source: "leads.claimant_name, else first + last" },
  { key: "dob", label: "Date of birth", group: "person", source: "leads.dob", kind: "date" },
  { key: "ssn_last4", label: "SSN (last 4)", group: "person", source: "leads.ssn_last4" },
  { key: "dl_number", label: "Driver's license number", group: "person", source: "leads.dl_number" },
  { key: "gender", label: "Gender", group: "person", source: "leads.gender" },
  { key: "language", label: "Preferred language", group: "person", source: "leads.preferred_language, else leads.language" },

  // Contact
  { key: "cell_phone", label: "Cell phone", group: "contact", source: "leads.phone", kind: "phone" },
  { key: "home_phone", label: "Home phone", group: "contact", source: "leads.home_phone", kind: "phone" },
  { key: "work_phone", label: "Work phone", group: "contact", source: "leads.work_phone", kind: "phone" },
  { key: "alt_phone", label: "Alternate phone", group: "contact", source: "leads.phone_alt", kind: "phone" },
  { key: "email", label: "Email", group: "contact", source: "leads.email", kind: "email" },
  { key: "address1", label: "Street address", group: "contact", source: "leads.mail_addr1" },
  { key: "address2", label: "Address line 2", group: "contact", source: "leads.mail_addr2" },
  { key: "city", label: "City", group: "contact", source: "leads.mail_city" },
  { key: "state", label: "State", group: "contact", source: "leads.mail_state" },
  { key: "zip", label: "ZIP", group: "contact", source: "leads.mail_zip" },
  { key: "full_address", label: "Full address (one line)", group: "contact", source: "street, city, state ZIP" },
  { key: "time_zone", label: "Time zone", group: "contact", source: "leads.client_time_zone" },

  // Emergency contact
  { key: "ec_name", label: "Emergency contact name", group: "emergency", source: "leads.ec_name" },
  { key: "ec_phone", label: "Emergency contact phone", group: "emergency", source: "leads.ec_phone", kind: "phone" },
  { key: "ec_relationship", label: "Emergency contact relationship", group: "emergency", source: "leads.ec_relationship" },

  // The incident
  { key: "incident_date", label: "Date of incident", group: "incident", source: "leads.incident_start", kind: "date" },
  { key: "incident_city", label: "City of incident", group: "incident", source: "leads.incident_city" },
  { key: "incident_state", label: "State of incident", group: "incident", source: "leads.incident_state" },
  { key: "case_summary", label: "Case summary", group: "incident", source: "claims.case_summary, else leads.case_summary, else leads.case_description" },
  { key: "police_report_number", label: "Police report number", group: "incident", source: "the call's File step" },
  { key: "other_driver_insurance", label: "Other driver's insurance", group: "incident", source: "the call's File step" },

  // Status and outcome
  { key: "status", label: "Status (key)", group: "status", source: "claims.status" },
  { key: "status_label", label: "Status", group: "status", source: "statuses.label" },
  { key: "outcome", label: "Last call outcome", group: "status", source: "latest closed call on this matter" },
  { key: "outcome_reason", label: "Last call outcome reason", group: "status", source: "latest closed call on this matter" },
  { key: "callback_at", label: "Call back at", group: "status", source: "latest closed call on this matter", kind: "datetime" },
  { key: "dq_reason", label: "Disqualified reason", group: "status", source: "claims.dq_reason" },

  // The agreement
  { key: "agreement", label: "Agreement", group: "agreement", source: "the matter's newest main agreement" },
  { key: "esign_sent_date", label: "E-sign sent", group: "agreement", source: "esign_submissions.sent_at", kind: "datetime" },
  { key: "sign_date", label: "Sign date", group: "agreement", source: "esign_submissions.completed_at / signed_at, else leads.signed_at", kind: "datetime" },
  { key: "signing_agent", label: "Agent who signed", group: "agreement", source: "the agent who sent the signed agreement" },

  // Timeline
  { key: "date_entered", label: "Date entered in system", group: "timeline", source: "leads.created_at", kind: "datetime" },
  { key: "first_opened_at", label: "First opened", group: "timeline", source: "leads.first_opened_at", kind: "datetime" },
  { key: "first_contact_at", label: "First contact (date and time)", group: "timeline", source: "leads.first_dialed_at", kind: "datetime" },
  { key: "last_called_at", label: "Last called", group: "timeline", source: "leads.last_called_at", kind: "datetime" },
  { key: "sent_to_firm_at", label: "Sent to the firm", group: "timeline", source: "claims.firm_sent_at, else leads.firm_sent_at", kind: "datetime" },
];

export const STANDARD_KEYS = STANDARD_FIELDS.map((f) => f.key);

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

const v = (x: any): string | null => {
  if (x === undefined || x === null) return null;
  const s = String(x).trim();
  return s ? s : null;
};

/**
 * The standard record from rows already loaded. Pure, so the webhook, the
 * export and the tests all build it the same way.
 */
export function standardFromRows(input: {
  lead: any;
  claim?: any | null;
  firmName?: string | null;
  statusLabel?: string | null;
  submission?: any | null;   // the matter's newest main (non-passenger) agreement
  signingAgent?: string | null;
  lastCall?: any | null;     // the matter's newest closed call
}): Record<string, string | null> {
  const L = input.lead || {};
  const C = input.claim || null;
  const S = input.submission || null;
  const K = input.lastCall || null;
  const file = (C?.answers?.mva_call?.file) || {};
  const dispo = K?.disposition ? (DISPO_LABEL as any)[K.disposition] || K.disposition : null;
  const carrier = v(file.carrier);
  return {
    lead_id: v(L.id),
    lead_no: v(L.lead_no),
    claim_id: v(C?.id),
    external_id: v(L.external_id),
    lawruler_id: v(L.lawruler_ref_no),
    source_link: v(L.lawruler_url),
    law_firm: v(input.firmName),
    campaign: v(C?.campaign) ?? v(L.campaign),
    campaign_id: v(C?.campaign_id) ?? v(L.campaign_id),
    case_type: v(C?.claim_type) ?? v(L.case_type),
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

    incident_date: v(L.incident_start),
    incident_city: v(L.incident_city),
    incident_state: v(L.incident_state),
    case_summary: v(C?.case_summary) ?? v(L.case_summary) ?? v(L.case_description),
    police_report_number: v(file.report),
    other_driver_insurance: carrier && carrier !== "Pick one" ? carrier : null,

    status: v(C?.status),
    status_label: v(input.statusLabel) ?? v(C?.status),
    outcome: v(dispo),
    outcome_reason: v(K?.reason),
    callback_at: v(K?.callback_at),
    dq_reason: v(C?.dq_reason),

    agreement: v(agreementName(S?.template_key)),
    esign_sent_date: v(S?.sent_at),
    sign_date: v(S?.completed_at) ?? v(S?.signed_at) ?? v(L.signed_at),
    signing_agent: S && (S.status === "completed" || S.status === "signed") ? v(input.signingAgent) : null,

    date_entered: v(L.created_at),
    first_opened_at: v(L.first_opened_at),
    first_contact_at: v(L.first_dialed_at),
    last_called_at: v(L.last_called_at),
    sent_to_firm_at: v(C?.firm_sent_at) ?? v(L.firm_sent_at),
  };
}

/**
 * Load and build the standard record for one lead (and its matter, when one
 * is named or the lead has a single one). Service-role client expected: this
 * feeds webhooks, which run server-side for the firm that owns the file.
 */
export async function buildStandardRecord(db: any, leadId: string, claimId?: string | null): Promise<Record<string, string | null> | null> {
  const { data: lead } = await db.from("leads").select(STD_LEAD_COLS).eq("id", leadId).maybeSingle();
  if (!lead) return null;
  let claim: any = null;
  if (claimId) {
    const { data } = await db.from("claims").select(STD_CLAIM_COLS).eq("id", claimId).eq("lead_id", leadId).maybeSingle();
    claim = data ?? null;
  } else {
    const { data } = await db.from("claims").select(STD_CLAIM_COLS).eq("lead_id", leadId).order("created_at", { ascending: true }).limit(3);
    const list = data ?? [];
    // Only an unambiguous matter: the single one, or the single one on the
    // lead's campaign. Otherwise the record stays lead-level.
    if (list.length === 1) claim = list[0];
    else {
      const same = list.filter((c: any) => lead.campaign_id && c.campaign_id === lead.campaign_id);
      if (same.length === 1) claim = same[0];
    }
  }
  const single = !claimId && claim != null;
  const scope = (q: any) => (claim ? (single ? q.or(`claim_id.eq.${claim.id},claim_id.is.null`) : q.eq("claim_id", claim.id)) : q);

  const [firmRes, statusRes, subRes, callRes] = await Promise.all([
    lead.firm_id ? db.from("firms").select("name").eq("id", lead.firm_id).maybeSingle() : Promise.resolve({ data: null }),
    claim?.status ? db.from("statuses").select("label").eq("key", claim.status).maybeSingle() : Promise.resolve({ data: null }),
    scope(db.from("esign_submissions").select("template_key, status, sent_at, signed_at, completed_at, sent_by, call_id").eq("lead_id", leadId).is("pax_index", null))
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    scope(db.from("intake_calls").select("disposition, reason, callback_at, agent_name, ended_at").eq("lead_id", leadId).eq("status", "ended"))
      .order("ended_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  const sub = subRes?.data ?? null;
  let signingAgent: string | null = null;
  if (sub?.sent_by) {
    const { data: u } = await db.from("app_users").select("full_name").eq("id", sub.sent_by).maybeSingle();
    signingAgent = u?.full_name ?? null;
  }
  if (!signingAgent && sub?.call_id) {
    const { data: c } = await db.from("intake_calls").select("agent_name").eq("id", sub.call_id).maybeSingle();
    signingAgent = c?.agent_name ?? null;
  }
  return standardFromRows({
    lead, claim, firmName: firmRes?.data?.name ?? null, statusLabel: statusRes?.data?.label ?? null,
    submission: sub, signingAgent, lastCall: callRes?.data ?? null,
  });
}
