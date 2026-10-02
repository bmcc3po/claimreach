import { test } from "node:test";
import assert from "node:assert/strict";
import { importedOriginals, verifiedImportedPdfs } from "./imported-packet";
import { sha256 } from "./lawruler-documents";

const firm = "11111111-1111-4111-8111-111111111111";
const lead = "22222222-2222-4222-8222-222222222222";
const claim = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444";

function fakeDb(document: any, meta: any, bytes: Uint8Array) {
  const db: any = {
    from(table: string) {
      const rows = table === "lead_activity" ? [{ firm_id: firm, lead_id: lead, meta }] : [document];
      const filters: [string, any][] = [];
      const q: any = { select() { return q; }, eq(key: string, value: any) { filters.push([key, value]); return q; }, limit() { return Promise.resolve({ data: rows.filter((row) => filters.every(([key, value]) => key.startsWith("meta->>") ? row.meta?.[key.slice(7)] === value : row[key] === value)), error: null }); } };
      return q;
    },
    storage: { from() { return { download: async () => ({ data: new Blob([bytes as unknown as BlobPart]), error: null }) }; } },
  };
  return db;
}

test("a matter-bound original is verified against its immutable hash", async () => {
  const content = new TextEncoder().encode("%PDF-1.7\nreviewed original\n%%EOF");
  const hash = await sha256(content.buffer as ArrayBuffer);
  const path = `${firm}/${lead}/${claim}/lawruler/${hash}.pdf`;
  const doc = { id, firm_id: firm, lead_id: lead, claim_id: claim, doc_type: "retainer", file_name: "signed-retainer.pdf", storage_path: path };
  const meta = { source: "lawruler", event: "original_document", claim_id: claim, document_id: id, sha256: hash };
  const db = fakeDb(doc, meta, content);
  const originals = await importedOriginals(db, firm, lead, claim);
  assert.equal(originals.length, 1);
  assert.equal((await verifiedImportedPdfs(db, originals))[0].original.id, id);
  const changed = fakeDb(doc, meta, new TextEncoder().encode("%PDF-1.7\nchanged content\n%%EOF"));
  await assert.rejects(() => verifiedImportedPdfs(changed, originals), /hash check/);
});

test("an original associated with another matter cannot enter the packet", async () => {
  const hash = "a".repeat(64);
  const doc = { id, firm_id: firm, lead_id: lead, claim_id: "other", doc_type: "retainer", file_name: "signed.pdf", storage_path: `${firm}/${lead}/other/lawruler/${hash}.pdf` };
  const db = fakeDb(doc, { source: "lawruler", event: "original_document", claim_id: claim, document_id: id, sha256: hash }, new Uint8Array());
  await assert.rejects(() => importedOriginals(db, firm, lead, claim), /missing from this matter/);
});

test("a conflicting PDF path is rejected instead of silently omitted", async () => {
  const hash = "a".repeat(64);
  const doc = { id, firm_id: firm, lead_id: lead, claim_id: claim, doc_type: "retainer", file_name: "signed.pdf", storage_path: `${firm}/${lead}/different/lawruler/${hash}.pdf` };
  const db = fakeDb(doc, { source: "lawruler", event: "original_document", claim_id: claim, document_id: id, sha256: hash }, new Uint8Array());
  await assert.rejects(() => importedOriginals(db, firm, lead, claim), /conflicting matter or hash/);
});
