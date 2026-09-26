// ============================================================================
// Signed documents (completed retainers + certificates of completion).
//
// These PDFs carry SSN, DOB and HIPAA authorizations, so they live in the
// PRIVATE "signed-docs" bucket and nothing ever hands out a permanent public
// link. Every link we store or show is an app route (/api/signed-doc/...) that
// checks who is asking, then redirects to a storage URL that expires in
// minutes. This file is the ONE definition of where signed files live and how
// they are linked. Writers, the download route and firm delivery all call it.
// ============================================================================

export const SIGNED_BUCKET = "signed-docs";

export type SignedKind = "signed" | "cert";

export function isSignedKind(k: string | null | undefined): k is SignedKind {
  return k === "signed" || k === "cert";
}

// Storage path for a signed file. Same layout the bucket has always used, so
// files written before the lockdown are still found.
export function signedDocPath(firmId: string | null | undefined, envelopeId: string, kind: SignedKind): string {
  return `${firmId || "master"}/${kind === "cert" ? "cert" : "signed"}-${envelopeId}.pdf`;
}

// The only link we ever store in completed_pdf_url / cert_pdf_url for files in
// our bucket. Same-origin and relative, so it works on every domain we serve.
export function signedDocLink(signableId: string, kind: SignedKind): string {
  return `/api/signed-doc/${signableId}/${kind}`;
}

// The client who just signed can download their own copy without logging in
// for this long after signing (the signing link is their key). After that it
// takes a staff or firm login.
export const SIGNER_WINDOW_HOURS = 24;

// How long the storage URL we redirect to stays valid.
export const SIGNED_URL_SECONDS = 300;

// Upload a signed file. Returns the path, or throws so the caller can log it.
export async function uploadSignedDoc(admin: any, path: string, bytes: Uint8Array): Promise<string> {
  const { error } = await admin.storage.from(SIGNED_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`signed-docs upload failed for ${path}: ${error.message}`);
  return path;
}

// Server-side read of a signed file (firm delivery attaches the bytes).
export async function downloadSignedDoc(admin: any, path: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(SIGNED_BUCKET).download(path);
  if (error || !data) {
    console.error(`signed-docs download failed for ${path}: ${error?.message ?? "no data"}`);
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

// Who may open a signed file. Pure so it can be unit tested.
//   internal staff: yes
//   firm user: only their own firm's files
//   no login: only the signer, and only inside SIGNER_WINDOW_HOURS of signing
export function mayOpenSignedDoc(opts: {
  user: { role: string; firmId: string | null } | null;
  internal: boolean;
  docFirmId: string | null;
  signedAt: string | null;
  now?: number;
}): boolean {
  const { user, internal, docFirmId, signedAt } = opts;
  if (user) {
    if (internal) return true;
    return user.role === "firm" && !!user.firmId && !!docFirmId && user.firmId === docFirmId;
  }
  if (!signedAt) return false;
  const t = Date.parse(signedAt);
  if (Number.isNaN(t)) return false;
  const now = opts.now ?? Date.now();
  return now - t >= 0 && now - t <= SIGNER_WINDOW_HOURS * 3600 * 1000;
}
