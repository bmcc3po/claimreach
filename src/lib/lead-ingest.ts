// ============================================================================
// One way a lead from outside becomes a file in the App.
//
// Two front doors use it: the LawRuler webhook (/api/webhooks/lawruler) and the
// marketer webhook (/api/webhooks/marketer). Marketers name their fields every
// way there is ("LeadID", "lead_id", "First Name", "ContactMethod"), so keys are
// matched loosely and anything we do not have a column for is kept on the file
// in leads.vendor_fields, never dropped. SSNs are never stored from a webhook.
//
// The same person arriving through both doors (marketer first, then LawRuler
// with its lead ID) lands on ONE file: matched by LawRuler lead ID, then by
// phone on the same campaign in the last 30 days.
// ============================================================================
import { normPhone } from "@/lib/comms";

export type Fields = Record<string, unknown>;

/** "Lead ID", "lead_id", "LeadID" -> "leadid". */
export const nk = (k: string) => String(k).toLowerCase().replace(/[^a-z0-9]/g, "");

export function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s) return null;
  const l = s.toLowerCase();
  if (l === "null" || l === "undefined" || l === "n/a" || s === ".") return null;
  // LawRuler's Test button posts its own tokens ("{{default95}}-Lead ID").
  if (s.includes("{{") && s.includes("}}")) return null;
  return s.replace(/\.$/, "").trim() || null;
}

// Field name -> every way marketers spell it (already normalized with nk()).
export const ALIASES: Record<string, string[]> = {
  leadId: ["leadid", "lawrulerleadid", "lrleadid", "lawrulerid", "leadnumber"],
  vendorLeadId: ["vendorleadid", "marketerleadid", "externalid", "sourceleadid", "id"],
  first: ["firstname", "first", "fname", "givenname"],
  last: ["lastname", "last", "lname", "surname", "familyname"],
  name: ["name", "fullname", "claimantname", "clientname", "contactname"],
  phone: ["phone", "cellphone", "cell", "mobile", "mobilephone", "phonenumber", "primaryphone", "homephone", "phone1"],
  email: ["email", "emailaddress", "mail"],
  dob: ["dob", "dateofbirth", "birthdate", "birthday"],
  addr1: ["address", "address1", "street", "streetaddress", "mailingaddress", "homeaddress"],
  city: ["city", "mailingcity"],
  state: ["state", "mailingstate", "st"],
  zip: ["zip", "zipcode", "postal", "postalcode", "mailingzip"],
  caseType: ["casetype", "typeofcase", "campaign", "case", "leadtype"],
  channel: ["marketingsource", "channel", "platform", "medium", "media", "mediasource", "trafficsource"],
  source: ["source", "leadsource"],
  marketer: ["contactmethod", "marketer", "vendor", "publisher", "agency", "partner", "leadvendor", "contactused", "supplier", "affiliate"],
  adCampaign: ["adcampaign", "adname", "adset", "utmcampaign", "creative"],
  description: ["description", "casedescription", "details", "story", "summary", "comments", "notes", "message", "whathappened"],
  doi: ["doi", "dateofincident", "incidentdate", "accidentdate", "dateofaccident", "dateofloss", "crashdate", "dol"],
  accidentState: ["accidentstate", "incidentstate", "stateofaccident", "lossstate", "crashstate"],
  accidentCity: ["accidentcity", "incidentcity", "cityofaccident", "losscity", "crashcity"],
  status: ["status", "leadstatus"],
  assignee: ["assignee", "leadassignee", "owner"],
  leadLink: ["leadlink", "lawrulerurl", "lawrulerlink", "url", "link"],
  leadCreated: ["leadcreated", "createdat", "created", "datecreated"],
};

// Channels, so a "Source" of "Facebook" is read as where the ad ran and a
// "Source" of "PR Digital" as who sent it.
const CHANNELS = /^(facebook|fb|meta|instagram|ig|gram|insta|tiktok|tik tok|google|youtube|yt|snapchat|snap|twitter|x|linkedin|bing|tv|radio|billboard|sms|text|web|website|organic|referral|email|seo|ppc)$/i;

export function isSensitiveKey(k: string): boolean {
  const n = nk(k);
  return n.includes("ssn") || n.includes("socialsecurity") || n === "social" || n.includes("taxid");
}

export interface NormalizedLead {
  leadId: string | null; vendorLeadId: string | null;
  first: string | null; last: string | null; name: string | null;
  phone: string | null; email: string | null; dob: string | null;
  addr1: string | null; city: string | null; state: string | null; zip: string | null;
  caseType: string | null; channel: string | null; marketer: string | null; adCampaign: string | null;
  description: string | null; doi: string | null; accidentState: string | null; accidentCity: string | null;
  status: string | null; assignee: string | null; leadLink: string | null; leadCreated: string | null;
  /** Everything that came in, minus SSNs, with the sender's own key names. */
  raw: Record<string, string>;
}

export function normalizeLead(fields: Fields): NormalizedLead {
  const byKey = new Map<string, string>();
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (isSensitiveKey(k)) continue;
    const c = clean(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
    if (c == null) continue;
    raw[k] = c.slice(0, 4000);
    const n = nk(k);
    if (!byKey.has(n)) byKey.set(n, c);
  }
  const pick = (name: string) => {
    for (const a of ALIASES[name] || []) { const v = byKey.get(a); if (v) return v; }
    return null;
  };
  const out: any = {};
  for (const name of Object.keys(ALIASES)) out[name] = pick(name);
  // "Source" is either the channel or the marketer, depending on what it says.
  if (out.source) {
    if (!out.channel && CHANNELS.test(out.source)) out.channel = out.source;
    else if (!out.marketer && !CHANNELS.test(out.source)) out.marketer = out.source;
  }
  delete out.source;
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) out.email = null;
  out.raw = raw;
  return out as NormalizedLead;
}

// ---------------------------------------------------------------------------
// Which campaign a lead belongs to.
//
// An exact campaign name wins. Otherwise a case type that says MVA goes to the
// MVA campaign of the firm it names; INNO (Innovative's own intake) signs for
// TMP. Add a firm here when it starts taking MVA leads.
// ---------------------------------------------------------------------------
export const MVA_WORDS = /\b(mva|motor vehicle|auto accident|car accident|car wreck|vehicle accident|truck accident|motorcycle|auto)\b/i;
export const LEAD_ROUTES: { match: RegExp; firm: string }[] = [
  { match: /\bTMT\b|money team/i, firm: "tmt" },
  { match: /\bROTH\b/i, firm: "roth" },
  { match: /\bTMP\b|turnbull|\bINNO\b|innovative/i, firm: "tmp" },
];
export const DEFAULT_MVA_FIRM = "tmp";

export interface CampaignRow { id: string; name: string; firm_id: string; case_type: string; active: boolean; firm_slug: string | null }

export function chooseCampaign(text: string | null, camps: CampaignRow[], opts: { defaultToMva?: boolean } = {}): CampaignRow | null {
  const live = camps.filter((c) => c.active);
  const t = (text || "").trim();
  if (t) {
    const exact = live.find((c) => c.name.toLowerCase() === t.toLowerCase());
    if (exact) return exact;
  }
  if (!(t && MVA_WORDS.test(t)) && !opts.defaultToMva) return null;
  const route = LEAD_ROUTES.find((r) => t && r.match.test(t));
  const slug = route?.firm || DEFAULT_MVA_FIRM;
  const mva = live.filter((c) => c.case_type === "mva" && c.firm_slug === slug).sort((a, b) => a.name.localeCompare(b.name));
  return mva[0] || null;
}

export async function loadCampaigns(admin: any): Promise<CampaignRow[]> {
  const { data } = await admin.from("campaigns").select("id, name, firm_id, case_type, active, firms(slug)");
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, firm_id: c.firm_id, case_type: c.case_type, active: !!c.active, firm_slug: c.firms?.slug ?? null }));
}

function dateOnly(v: string | null): string | null {
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = v.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return null;
}

export interface IngestResult { ok: boolean; lead_id?: string; lead_no?: string | null; created?: boolean; error?: string; status?: number }

/**
 * Create or update the file. Never overwrites a value someone already has on
 * the file (the agent may have fixed a name mid-call); only fills blanks.
 */
export async function ingestLead(admin: any, opts: {
  lead: NormalizedLead;
  campaign: CampaignRow;
  via: "lawruler" | "marketer";
  /** Marketer name from the door they used, when the payload does not say. */
  marketerName?: string | null;
}): Promise<IngestResult> {
  const { lead: n, campaign: camp, via } = opts;
  const firmId = camp.firm_id;
  // LawRuler lead IDs are plain numbers; anything else is not trusted in a filter.
  const lrId = via === "lawruler" && n.leadId && /^[\w.-]{1,64}$/.test(n.leadId) ? n.leadId : null;
  const phoneNorm = normPhone(n.phone || "");
  if (via === "lawruler" && !lrId) return { ok: false, status: 400, error: "missing LeadID" };
  if (!lrId && phoneNorm.length !== 10 && !n.email) return { ok: false, status: 400, error: "a lead needs a phone number or email" };

  const COLS = "id, lead_no, first_name, last_name, claimant_name, phone, email, dob, mail_addr1, mail_city, mail_state, mail_zip, marketing_source, case_description, lawruler_url, lawruler_ref_no, external_id, campaign_id";
  let existing: any = null;
  if (lrId) {
    const { data } = await admin.from("leads").select(COLS).eq("firm_id", firmId)
      .or(`lawruler_ref_no.eq.${lrId},external_id.eq.${lrId}`)
      .order("created_at", { ascending: false }).limit(1);
    existing = data?.[0] ?? null;
  }
  if (!existing && phoneNorm.length === 10) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await admin.from("leads").select(COLS).eq("campaign_id", camp.id).eq("phone_norm", phoneNorm)
      .is("archived_at", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
    existing = data?.[0] ?? null;
  }

  const name = n.name || [n.first, n.last].filter(Boolean).join(" ") || null;
  const parts = (n.name || "").split(/\s+/).filter(Boolean);
  const want: Record<string, any> = {
    first_name: n.first || parts[0] || null,
    last_name: n.last || (parts.length > 1 ? parts.slice(1).join(" ") : null),
    claimant_name: name,
    phone: n.phone,
    email: n.email ? n.email.toLowerCase() : null,
    dob: dateOnly(n.dob),
    mail_addr1: n.addr1, mail_city: n.city, mail_state: n.state, mail_zip: n.zip,
    marketing_source: n.channel || n.marketer || opts.marketerName || null,
    case_description: n.description,
    lawruler_url: n.leadLink && /^https?:\/\//i.test(n.leadLink) ? n.leadLink : null,
    lawruler_ref_no: lrId,
  };

  let leadId: string, leadNo: string | null, created = false;
  if (existing) {
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(want)) if (v != null && v !== "" && (existing[k] == null || existing[k] === "")) patch[k] = v;
    if (lrId && !existing.external_id) patch.external_id = lrId;
    if (!existing.campaign_id) { patch.campaign_id = camp.id; patch.campaign = camp.name; patch.case_type = camp.case_type; }
    if (Object.keys(patch).length) {
      const { error } = await admin.from("leads").update(patch).eq("id", existing.id);
      if (error) return { ok: false, status: 500, error: `update: ${error.message}` };
    }
    leadId = existing.id; leadNo = existing.lead_no;
  } else {
    const ins: Record<string, any> = {
      firm_id: firmId, campaign_id: camp.id, campaign: camp.name, case_type: camp.case_type,
      external_id: lrId, origin: via, source_system: via,
    };
    for (const [k, v] of Object.entries(want)) if (v != null && v !== "") ins[k] = v;
    const { data: minted } = await admin.rpc("mint_lead_no", { p_firm: firmId });
    if (minted) ins.lead_no = minted;
    const { data: row, error } = await admin.from("leads").insert(ins).select("id, lead_no").single();
    if (error) return { ok: false, status: 500, error: `insert: ${error.message}` };
    leadId = row.id; leadNo = row.lead_no; created = true;
    const { error: cErr } = await admin.from("claims").insert({
      firm_id: firmId, lead_id: leadId, claim_type: camp.case_type, campaign: camp.name,
      campaign_id: camp.id, status: "new", is_this_file: true,
    });
    if (cErr) return { ok: false, status: 500, lead_id: leadId, lead_no: leadNo, created, error: `The file was made but its claim was not: ${cErr.message}` };
  }

  // What has no column: kept whole. Needs migration 0098 (leads.vendor_fields);
  // before that runs, this one write is skipped and logged, the file still lands.
  const vendorError = await saveVendorFields(admin, leadId, n, via, opts.marketerName);

  const who = [n.channel, n.marketer || opts.marketerName].filter(Boolean).join(" via ");
  await admin.from("lead_activity").insert({
    firm_id: firmId, lead_id: leadId, kind: "system",
    body: created ? `New lead${who ? ` from ${who}` : ""}${via === "lawruler" ? " (LawRuler)" : ""}.` : `Lead updated${via === "lawruler" && n.status ? `. LawRuler status: ${n.status}` : ""}.`,
    meta: { source: via, lawruler_lead_id: lrId, marketer: n.marketer || opts.marketerName || null, channel: n.channel, status: n.status },
  }).then(() => null, () => null);

  if (created && n.phone) {
    try { const { reconcileUnmatched } = await import("@/lib/comms"); await reconcileUnmatched(leadId, n.phone, firmId); } catch (e) { console.error("reconcile failed", e); }
  }
  if (created) {
    try {
      const { fireEvent } = await import("@/lib/webhook-deliver");
      await fireEvent(firmId, "lead.created", { lead_id: leadId, lead_no: leadNo, ...want, source: via }, { campaignId: camp.id });
    } catch (e) { console.error("lead.created webhook failed", e); }
  }
  return { ok: true, lead_id: leadId, lead_no: leadNo, created, ...(vendorError ? { error: vendorError } : {}) };
}

async function saveVendorFields(admin: any, leadId: string, n: NormalizedLead, via: string, marketerName?: string | null): Promise<string | null> {
  const { data, error: rErr } = await admin.from("leads").select("vendor_fields").eq("id", leadId).maybeSingle();
  if (rErr) return `vendor_fields not saved (run migration 0098): ${rErr.message}`;
  const prev = (data?.vendor_fields && typeof data.vendor_fields === "object") ? data.vendor_fields : {};
  const keep = (k: string, v: string | null) => (v ? { [k]: v } : prev[k] ? { [k]: prev[k] } : {});
  const next = {
    ...prev,
    ...keep("marketer", n.marketer || marketerName || null),
    ...keep("channel", n.channel),
    ...keep("ad_campaign", n.adCampaign),
    ...keep("doi", n.doi),
    ...keep("accident_state", n.accidentState),
    ...keep("accident_city", n.accidentCity),
    ...keep("case_type", n.caseType),
    ...keep("lawruler_status", via === "lawruler" ? n.status : null),
    ...keep("assignee", n.assignee),
    ...keep("marketer_lead_id", via === "marketer" ? (n.vendorLeadId || n.leadId) : null),
    sources: { ...(prev.sources || {}), [via === "marketer" ? `marketer:${nk(n.marketer || marketerName || "unknown")}` : "lawruler"]: { ...n.raw, _at: new Date().toISOString() } },
  };
  const { error } = await admin.from("leads").update({ vendor_fields: next }).eq("id", leadId);
  return error ? `vendor_fields not saved (run migration 0098): ${error.message}` : null;
}

// ---------------------------------------------------------------------------
// Body parsing shared by both doors: form-data, urlencoded or JSON.
// ---------------------------------------------------------------------------
export interface Attachment { name: string; contentType: string; bytes: ArrayBuffer }
export async function parseLeadBody(req: Request): Promise<{ fields: Record<string, any>; files: Attachment[]; rawNote: string }> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  const fields: Record<string, any> = {};
  const files: Attachment[] = [];
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") fields[k] = v;
      else {
        const f = v as File;
        files.push({ name: f.name || `${k}.bin`, contentType: f.type || "application/octet-stream", bytes: await f.arrayBuffer() });
      }
    }
    return { fields, files, rawNote: ct.split(";")[0] };
  }
  const text = await req.text();
  try {
    const j = JSON.parse(text);
    // Some platforms wrap the lead: { lead: {...} } or { data: {...} }.
    const inner = j && typeof j === "object" && !Array.isArray(j) ? (j.lead && typeof j.lead === "object" ? j.lead : j.data && typeof j.data === "object" && !Array.isArray(j.data) ? j.data : j) : {};
    return { fields: inner, files, rawNote: "json" };
  } catch {
    const p = new URLSearchParams(text);
    for (const [k, v] of p.entries()) fields[k] = v;
    return { fields, files, rawNote: `unparsed:${ct || "none"}` };
  }
}

/** Fields safe to keep in the webhook log: SSNs removed. */
export function redactForLog(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = isSensitiveKey(k) ? "[removed]" : v;
  return out;
}
