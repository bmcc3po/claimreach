// Webhook + API core: HMAC signing/verification (Web Crypto, edge-safe),
// key generation, and field mapping. Shared by inbound hooks, outbound delivery,
// and the REST API.
import { supabaseAdmin } from "@/lib/supabase-server";

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
const DEFAULT_INBOUND: Record<string, string> = {
  // LawRuler standard webhook
  leadid: "vendor_lead_id", leadcreated: "date_referred",
  first_name: "claimant_first_name", firstname: "claimant_first_name",
  lastname: "claimant_last_name", last_name: "claimant_last_name",
  dob: "claimant_dob", email: "claimant_email", phone: "claimant_phone",
  address1: "mail_address1", city: "mail_city", state: "mail_state", zip: "mail_zip",
  assignee: "handling_attorney", source: "marketing_source", case_type: "case_type",
  status: "lead_status", description: "injury_description",
  signeddate: "esign_signed_date", signedconfirm: "signed_contract_received", leadlink: "source_lead_link",
  // common generic variants
  firstName: "claimant_first_name", lastName: "claimant_last_name",
  name: "claimant_full_name", full_name: "claimant_full_name",
  phone_number: "claimant_phone", email_address: "claimant_email",
  claim_type: "case_type", campaign: "campaign_name", external_id: "external_id", id: "external_id",
};
function applyTransform(field: string, value: any, transforms: Record<string, any>): any {
  const t = transforms?.[field];
  if (!t) return value;
  if (t === "digits" && typeof value === "string") return value.replace(/\D/g, "");
  if (t === "lower" && typeof value === "string") return value.toLowerCase();
  if (typeof t === "object" && value != null) return t[String(value)] ?? value; // value map
  return value;
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

// Translate canonical-id keys into the actual `leads` table columns the hook writes.
export function canonicalToLeadColumns(c: Record<string, any>) {
  return {
    first_name: c.claimant_first_name ?? null,
    last_name: c.claimant_last_name ?? null,
    claimant_name: c.claimant_full_name ?? null,
    phone: c.claimant_phone ?? null,
    email: c.claimant_email ?? null,
    case_type: c.case_type ?? null,
    campaign: c.campaign_name ?? null,
    external_id: c.external_id ?? c.vendor_lead_id ?? null,
    mail_address1: c.mail_address1 ?? null,
    mail_city: c.mail_city ?? null,
    mail_state: c.mail_state ?? null,
    mail_zip: c.mail_zip ?? null,
    dob: c.claimant_dob ?? null,
    handling_attorney: c.handling_attorney ?? null,
    marketing_source: c.marketing_source ?? null,
  };
}
