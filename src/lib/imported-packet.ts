import { sha256 } from "./lawruler-documents";

export type ImportedOriginal = { id: string; name: string; kind: string; hash: string; path: string };

/** Only immutable, matter-bound LawRuler originals may enter an imported handoff. */
export async function importedOriginals(db: any, firmId: string, leadId: string, claimId: string): Promise<ImportedOriginal[]> {
  const [source, documents] = await Promise.all([
    db.from("lead_activity").select("meta").eq("firm_id", firmId).eq("lead_id", leadId)
      .eq("meta->>source", "lawruler").eq("meta->>event", "original_document").eq("meta->>claim_id", claimId).limit(100),
    db.from("case_documents").select("id,firm_id,lead_id,claim_id,file_name,doc_type,storage_path")
      .eq("firm_id", firmId).eq("lead_id", leadId).eq("claim_id", claimId).limit(100),
  ]);
  if (source.error || documents.error) throw new Error("Could not verify this matter's LawRuler originals.");
  if ((source.data || []).length >= 100 || (documents.data || []).length >= 100) throw new Error("Document history is too large to verify automatically. Ask the owner to review it.");
  const indexed = new Map((documents.data || []).map((d: any) => [String(d.id), d]));
  const originals: ImportedOriginal[] = [];
  for (const row of source.data || []) {
    const meta = row.meta || {};
    const doc = indexed.get(String(meta.document_id)) as any;
    if (!doc) throw new Error("A LawRuler original is missing from this matter. Nothing can be sent.");
    const hash = String(meta.sha256 || "").toLowerCase();
    if (!/\.pdf$/i.test(doc.file_name || "")) {
      if (doc.doc_type === "retainer") throw new Error("The imported retainer is not a PDF.");
      continue;
    }
    const expected = `${firmId}/${leadId}/${claimId}/lawruler/${hash}.pdf`;
    if (!/^[0-9a-f]{64}$/.test(hash) || doc.storage_path !== expected) throw new Error("An imported PDF has conflicting matter or hash metadata.");
    if (!originals.some((item) => item.id === doc.id)) originals.push({ id: doc.id, name: doc.file_name, kind: doc.doc_type, hash, path: expected });
  }
  if (!originals.some((item) => item.kind === "retainer")) throw new Error("No matter-bound original signed retainer PDF is stored. Nothing can be sent.");
  return originals;
}

/** Recheck storage content against import-time SHA-256 immediately before sending. */
export async function verifiedImportedPdfs(db: any, originals: ImportedOriginal[]): Promise<{ original: ImportedOriginal; bytes: Uint8Array }[]> {
  if (!originals.length || originals.length > 16) throw new Error("The number of original PDFs needs owner review.");
  const files: { original: ImportedOriginal; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const original of originals) {
    const { data, error } = await db.storage.from("case-docs").download(original.path);
    if (error || !data || data.size < 20 || data.size > 8 * 1024 * 1024) throw new Error(`The original PDF ${original.name} is unavailable or incomplete.`);
    total += data.size;
    if (total > 20 * 1024 * 1024) throw new Error("The original packet exceeds 20 MB; use owner manual download for review.");
    const buffer = await data.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!new TextDecoder().decode(bytes.slice(0, 8)).startsWith("%PDF-")
      || !new TextDecoder().decode(bytes.slice(-2048)).includes("%%EOF")
      || await sha256(buffer) !== original.hash) throw new Error(`The original PDF ${original.name} failed its import hash check.`);
    files.push({ original, bytes });
  }
  return files;
}
