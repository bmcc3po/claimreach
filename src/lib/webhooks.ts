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
const DEFAULT_INBOUND: Record<string, string> = {
  first_name: "first_name", last_name: "last_name", firstName: "first_name", lastName: "last_name",
  name: "claimant_name", full_name: "claimant_name", phone: "phone", phone_number: "phone",
  email: "email", email_address: "email", claim_type: "case_type", case_type: "case_type",
  campaign: "campaign", external_id: "external_id", id: "external_id",
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
  // split a combined name into first/last if we only got claimant_name
  if (out.claimant_name && (!out.first_name || !out.last_name)) {
    const parts = String(out.claimant_name).trim().split(/\s+/);
    out.first_name = out.first_name || parts[0] || "";
    out.last_name = out.last_name || parts.slice(1).join(" ") || "";
  }
  return out;
}
