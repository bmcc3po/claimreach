// Webhook + API core: HMAC signing/verification (Web Crypto, edge-safe),
// key generation, and field mapping. Shared by inbound hooks, outbound delivery,
// and the REST API.
import { supabaseAdmin } from "@/lib/supabase-server";
import { STANDARD_KEYS, WRITABLE_FIELDS, incidentColumns } from "@/lib/standard-fields";

// ---- HMAC (SHA-256) over the raw body, hex digest. ----
async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(secret: string, body: string): Promise<string> {
  return `sha256=${await hmacHex(secret, body)}`;
}

// constant-time-ish compare
export async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const expected = await signPayload(secret, body);
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

// ---- Key generation (public key_id + secret). ----
function rand(n: number): string {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function newKeyPair(scope: "master" | "firm") {
  return { key_id: `crk_${scope === "master" ? "m" : "f"}_${rand(8)}`, secret: `crs_${rand(24)}` };
}

// ---- Look up an api key row by its public key_id. ----
export async function lookupKey(key_id: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.from("api_keys").select("*").eq("key_id", key_id).eq("active", true).maybeSingle();
  return data;
}

// ---- Field mapping: translate an external object into our lead shape. ----
// Default inbound map: external field name -> canonical id. Covers LawRuler's
// standard webhook plus common variants. Per-firm overrides layer on top.
// A key that is one of OUR standard names is never an alias here: standard
// names come from STANDARD_FIELDS below, and only the WRITABLE ones (Astra
// round 7b: ids, status, ownership and SSN are never set from outside, so
// `status`, `lead_no`, `claim_id`, `lawruler_id` and `ssn_last4` map to
// nothing).
const ALIASES: Record<string, string> = {
  // LawRuler standard webhook
  leadid: "vendor_lead_id", leadcreated: "date_referred",
  firstname: "claimant_first_name", lastname: "claimant_last_name",
  phone: "claimant_phone",
  postal: "mail_zip", postal_code: "mail_zip", zipcode: "mail_zip", mail_zip: "mail_zip",
  assignee: "handling_attorney", source: "marketing_source",
  description: "injury_description",
  signeddate: "esign_signed_date", signedconfirm: "signed_contract_received", leadlink: "source_lead_link",
  // common generic variants
  firstName: "claimant_first_name", lastName: "claimant_last_name",
  name: "claimant_full_name",
  phone_number: "claimant_phone", email_address: "claimant_email",
  claim_type: "case_type", id: "external_id",
  phone_alt: "claimant_phone_alt", date_of_incident: "date_of_incident", state_of_incident: "incident_state",
};
const STANDARD_NAMES = new Set(STANDARD_KEYS);
const DEFAULT_INBOUND: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ALIASES).filter(([k]) => !STANDARD_NAMES.has(k))),
  // ClaimReach's own standard field names (Brett, Sep 28): a sender that
  // uses our documented names needs no mapping at all.
  ...Object.fromEntries(WRITABLE_FIELDS.map((f) => [f.key, f.inbound])),
};
function applyTransform(field: string, value: any, transforms: Record<string, any>): any {
  const t = transforms?.[field];
  if (!t) return value;
  if (t === "digits" && typeof value === "string") return value.replace(/\D/g, "");
  if (t === "lower" && typeof value === "string") return value.toLowerCase();
  if (typeof t === "object" && value != null) return t[String(value)] ?? value; // value map
  return value;
}
// LawRuler Test posts "{{token}}" placeholders; treat those as empty.
export function inboundClean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return null;
  if (s.includes("{{") && s.includes("}}")) return null;
  return s;
}

export function firstNonEmpty(...vals: unknown[]): string | null {
  for (const v of vals) {
    const s = inboundClean(v);
    if (s) return s;
  }
  return null;
}

export function inboundCanonicalId(externalKey: string): string | undefined {
  return DEFAULT_INBOUND[externalKey];
}

export function mapInbound(body: Record<string, any>, mapping?: { map?: Record<string, string>; transforms?: Record<string, any> }) {
  const map = { ...DEFAULT_INBOUND, ...(mapping?.map ?? {}) };
  const transforms = mapping?.transforms ?? {};
  const out: Record<string, any> = {};
  for (const [their, val] of Object.entries(body)) {
    const our = map[their];
    if (!our) continue;
    out[our] = applyTransform(our, val, transforms);
  }
  // split a combined name into first/last if we only got the full name
  if (out.claimant_full_name && (!out.claimant_first_name || !out.claimant_last_name)) {
    const parts = String(out.claimant_full_name).trim().split(/\s+/);
    out.claimant_first_name = out.claimant_first_name || parts[0] || "";
    out.claimant_last_name = out.claimant_last_name || parts.slice(1).join(" ") || "";
  }
  return out;
}

// Translate canonical-id keys into the actual `leads` table columns the hook
// writes. Every writable standard field lands in its own column here (the
// standard-fields test round-trips each one), so a value we accept is a
// value we store.
export function canonicalToLeadColumns(c: Record<string, any>) {
  const incident = incidentColumns({ date: c.date_of_incident, city: c.incident_city, state: c.incident_state });
  const link = typeof c.source_lead_link === "string" && /^https?:\/\//i.test(c.source_lead_link.trim()) ? c.source_lead_link.trim() : null;
  return {
    first_name: c.claimant_first_name ?? null,
    last_name: c.claimant_last_name ?? null,
    claimant_name: c.claimant_full_name ?? null,
    phone: c.claimant_phone ?? null,
    email: c.claimant_email ?? null,
    case_type: c.case_type ?? null,
    campaign: c.campaign_name ?? null,
    external_id: c.external_id ?? c.vendor_lead_id ?? null,
    // leads has mail_addr1 / mail_addr2 (0061). `mail_address1` was a phantom:
    // every insert naming it was rejected whole by Postgres, which is why the
    // LawRuler hook failed on every fire. Canonical id stays mail_address1;
    // only the COLUMN name is corrected here.
    mail_addr1: c.mail_address1 ?? null,
    mail_addr2: c.mail_address2 ?? null,
    mail_city: c.mail_city ?? null,
    mail_state: c.mail_state ?? null,
    mail_zip: c.mail_zip ?? null,
    dob: c.claimant_dob ?? null,
    handling_attorney: c.handling_attorney ?? null,
    marketing_source: c.marketing_source ?? null,
    // Standard fields (0109). A sender that leaves them out writes nothing.
    home_phone: c.claimant_home_phone ?? null,
    work_phone: c.claimant_work_phone ?? null,
    phone_alt: c.claimant_phone_alt ?? null,
    dl_number: c.claimant_dl_number ?? null,
    gender: c.claimant_gender ?? null,
    preferred_language: c.claimant_language ?? null,
    client_time_zone: c.client_time_zone ?? null,
    // Where and when, read one way: a real date, a state code, the city alone.
    incident_start: incident.incident_start,
    incident_city: incident.incident_city,
    incident_state: incident.incident_state,
    ec_name: c.ec_name ?? null,
    ec_phone: c.ec_phone ?? null,
    ec_relationship: c.ec_relationship ?? null,
    case_summary: c.case_summary ?? null,
    lawruler_url: link,
  };
}
