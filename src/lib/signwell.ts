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

// Map our placed field types to SignWell field types.
const SW_TYPE: Record<string, string> = {
  signature: "signature", initials: "initials", date: "date", text: "text", checkbox: "checkbox",
};

// Create + send a document from an uploaded PDF + placed fields.
// `placed` = our percentage-based fields; pageDims maps page -> {w,h} in points.
export async function createSignwellFromPdf(opts: {
  apiKey: string; testMode: boolean; name: string; subject?: string; message?: string;
  pdfBase64: string; fileName: string;
  placed: { id: string; type: string; page: number; xPct: number; yPct: number; wPct: number; hPct: number; role: "client" | "agent"; label?: string; required?: boolean }[];
  pageDims: Record<number, { w: number; h: number }>;
  client: { name: string; email: string };
  agent: { name: string; email: string };
  metadata?: Record<string, any>;
}) {
  // recipient 1 = client, recipient 2 = agent
  const recipients = [
    { id: "1", name: opts.client.name, email: opts.client.email },
    { id: "2", name: opts.agent.name, email: opts.agent.email },
  ];
  // SignWell wants a 2D array: one inner array per file. We have one file.
  const fileFields = opts.placed.map((f) => {
    const dim = opts.pageDims[f.page] || { w: 612, h: 792 }; // default US Letter pts
    return {
      api_id: f.id.replace(/-/g, "").slice(0, 20),
      type: SW_TYPE[f.type] || "text",
      page: f.page,
      x: Math.round((f.xPct / 100) * dim.w),
      y: Math.round((f.yPct / 100) * dim.h),
      width: Math.round((f.wPct / 100) * dim.w),
      height: Math.round((f.hPct / 100) * dim.h),
      required: f.required !== false,
      recipient_id: f.role === "client" ? "1" : "2",
      ...(f.type === "text" || f.type === "date" ? { label: f.label || "" } : {}),
      ...(f.type === "date" ? { lock_sign_date: false } : {}),
    };
  });

  const body: any = {
    test_mode: opts.testMode,
    files: [{ name: opts.fileName, file_base64: opts.pdfBase64 }],
    name: opts.name, subject: opts.subject, message: opts.message,
    recipients, draft: false, reminders: true,
    fields: [fileFields],
    metadata: opts.metadata ?? {},
  };
  const r = await fetch(`${BASE}/documents`, {
    method: "POST",
    headers: { "X-Api-Key": opts.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) return { error: d.errors ? JSON.stringify(d.errors) : (d.message || `SignWell ${r.status}`) };
  const rec = (d.recipients || []).find((x: any) => x.id === "1") || (d.recipients || [])[0] || {};
  return { id: d.id, signing_url: rec.embedded_signing_url || rec.signing_url || null, status: d.status, raw: d };
}
