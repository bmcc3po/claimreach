// SignWell (certified eSign) integration. REST API, X-Api-Key auth.
// Docs: POST https://www.signwell.com/api/v1/documents creates + (draft:false) sends.
import { supabaseAdmin } from "@/lib/supabase-server";

const BASE = "https://www.signwell.com/api/v1";

export async function getEsignAccount(firmId: string | null) {
  const admin = supabaseAdmin();
  const { data } = await admin.from("esign_accounts").select("*")
    .or(`firm_id.eq.${firmId},firm_id.is.null`).eq("active", true).eq("provider", "signwell")
    .order("firm_id", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
  return data;
}

// base64 of an HTML string (edge-safe)
function b64(s: string): string {
  // btoa needs latin1; encode UTF-8 safely
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

// Create + send a document for signing. Returns { id, signing_url, recipients }.
export async function createSignwellDocument(opts: {
  apiKey: string; testMode: boolean;
  name: string; subject?: string; message?: string;
  html: string;                       // rendered retainer/doc as HTML
  signerName: string; signerEmail: string;
  embedded?: boolean;                 // embedded signing (in-app iframe)
  metadata?: Record<string, any>;
  withSignaturePage?: boolean;        // append a signature page (no field coords needed)
}) {
  const body: any = {
    test_mode: opts.testMode,
    files: [{ name: `${opts.name}.html`, file_base64: b64(opts.html) }],
    name: opts.name,
    subject: opts.subject,
    message: opts.message,
    recipients: [{ id: "1", name: opts.signerName, email: opts.signerEmail }],
    draft: false,                     // send immediately
    with_signature_page: opts.withSignaturePage ?? true,
    embedded_signing: !!opts.embedded,
    reminders: true,
    metadata: opts.metadata ?? {},
  };
  const r = await fetch(`${BASE}/documents`, {
    method: "POST",
    headers: { "X-Api-Key": opts.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) return { error: d.errors ? JSON.stringify(d.errors) : (d.message || `SignWell ${r.status}`) };
  // signing url for the first recipient (embedded) if present
  const rec = (d.recipients || [])[0] || {};
  return { id: d.id, signing_url: rec.embedded_signing_url || rec.signing_url || null, status: d.status, raw: d };
}

// Fetch a document (to get completed_pdf_url after signing).
export async function getSignwellDocument(apiKey: string, id: string) {
  const r = await fetch(`${BASE}/documents/${id}/`, { headers: { "X-Api-Key": apiKey, "Accept": "application/json" } });
  return r.ok ? r.json() : null;
}

// Verify SignWell webhook HMAC (SHA256 over the raw body using the API key).
export async function verifySignwellHook(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === header.toLowerCase();
}
