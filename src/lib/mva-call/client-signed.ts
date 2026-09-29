// The PNC's signature is evidence before Intake completes the second signer.
// Keep that preliminary PDF separate from the final signed packet/certificate;
// firm delivery must never mistake it for a completed agreement.
import { getSubmissionDocuments } from "@/lib/docuseal";
import { SIGNED_BUCKET, uploadSignedDoc } from "@/lib/signed-docs";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function clientSignedPath(firmId: string | null, submissionId: string | number): string | null {
  const id = String(submissionId || "");
  if (!/^\d+$/.test(id)) return null;
  return `${firmId || "master"}/client-ds-${id}.pdf`;
}

export function allowedDocuSealFileUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const configured = new URL((globalThis as any)?.process?.env?.DOCUSEAL_API_URL || "https://api.docuseal.com").hostname.toLowerCase();
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === configured || host === "docuseal.com" || host.endsWith(".docuseal.com"));
  } catch { return false; }
}

type SnapshotRow = { firm_id: string | null; submission_id: string | number; signed_at: string | null; status: string };
type SnapshotResult = { ok: true; path: string } | { ok: false; error: string };

/** Save a merged, partially signed PDF once. Reopening the file recovers older
 * client signatures that predate this code. The provider URL is used only for
 * this download; the durable copy stays in the private signed-docs bucket. */
export async function ensureClientSignedSnapshot(admin: any, row: SnapshotRow, deps: {
  getDocuments?: typeof getSubmissionDocuments;
  fetchPdf?: typeof fetch;
} = {}): Promise<SnapshotResult> {
  if (!row.signed_at || !["signed", "voided"].includes(row.status)) return { ok: false, error: "The client has not signed this agreement." };
  const path = clientSignedPath(row.firm_id, row.submission_id);
  if (!path) return { ok: false, error: "The agreement has no valid DocuSeal submission ID." };
  const [folder, name] = path.split("/");
  const bucket = admin.storage.from(SIGNED_BUCKET);
  const existing = await bucket.list(folder, { limit: 100, search: name });
  if (existing.error) return { ok: false, error: "Private document storage is unavailable." };
  if ((existing.data ?? []).some((file: { name: string }) => file.name === name)) return { ok: true, path };

  const result = await (deps.getDocuments ?? getSubmissionDocuments)(row.submission_id);
  if (!result.ok) return { ok: false, error: "DocuSeal could not provide the client-signed preview." };
  const url = result.data.documents?.[0]?.url;
  if (!url || !allowedDocuSealFileUrl(url)) return { ok: false, error: "DocuSeal returned no safe preview document." };
  let bytes: Uint8Array;
  try {
    const response = await (deps.fetchPdf ?? fetch)(url, { cache: "no-store" });
    if (!response.ok) return { ok: false, error: "DocuSeal's preview download failed." };
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_PDF_BYTES) return { ok: false, error: "DocuSeal's preview is too large." };
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch { return { ok: false, error: "DocuSeal's preview download failed." }; }
  if (bytes.length < 5 || bytes.length > MAX_PDF_BYTES || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    return { ok: false, error: "DocuSeal returned an invalid preview PDF." };
  }
  try { await uploadSignedDoc(admin, path, bytes); }
  catch { return { ok: false, error: "Could not preserve the client-signed preview in private storage." }; }
  return { ok: true, path };
}
