// Offline actual-service tests; Postgres transaction behavior is separately
// exercised with the real 0111 SQL in work/v9-tooling/emergency-sql-test.cjs.
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { FakeDb } from "./test-fake-db";
import { createEmergencyPacket, emergencyView, finishEmergencyPacket, evidenceHash } from "./emergency-signing";

const L = "10000000-0000-4000-8000-000000000001", C = "20000000-0000-4000-8000-000000000001", F = "30000000-0000-4000-8000-000000000001", CAMP = "40000000-0000-4000-8000-000000000001";
function signaturePng() {
  const crc = (buf: Buffer) => { let n = 0xffffffff; for (const b of buf) { n ^= b; for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; } return (n ^ 0xffffffff) >>> 0; };
  const chunk = (name: string, data: Buffer) => { const type = Buffer.from(name), length = Buffer.alloc(4), sum = Buffer.alloc(4); length.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([type, data]))); return Buffer.concat([length, type, data, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(4, 0); header.writeUInt32BE(4, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(4 * (1 + 4 * 4), 255); for (let y = 0; y < 4; y++) { pixels[y * 17] = 0; pixels.fill(0, y * 17 + 1 + y * 4, y * 17 + 4 + y * 4); }
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]).toString("base64")}`;
}
class StoreDb extends FakeDb {
  objects = new Map<string, Uint8Array>(); uploads: string[] = []; failUpload = ""; rpcCalls: string[] = []; noticeCount = 0;
  storage = { from: (bucket: string) => ({
    upload: async (path: string, bytes: Uint8Array, opts: any) => {
      const key = `${bucket}/${path}`; this.uploads.push(path);
      if (path.includes(this.failUpload) && this.failUpload) return { error: { message: "storage offline" } };
      if (!opts.upsert && this.objects.has(key)) return { error: { message: "already exists" } };
      this.objects.set(key, Uint8Array.from(bytes)); return { error: null };
    },
    download: async (path: string) => { const bytes = this.objects.get(`${bucket}/${path}`); return { data: bytes ? { arrayBuffer: async () => Uint8Array.from(bytes).buffer } : null, error: bytes ? null : { message: "missing" } }; },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://offline.invalid/${bucket}/${path}` }, error: null }),
  }) };
  async rpc(name: string, b: any) {
    this.rpcCalls.push(name);
    const rows = this.tables.signable_documents.filter((d) => b.p_ids.includes(d.id));
    if (name === "begin_emergency_signing") {
      if (rows.some((d) => d.audit.emergency.evidence && d.audit.emergency.evidence.hash !== b.p_hash)) return { data: null, error: { message: "different signature evidence" } };
      for (const d of rows) if (["sent", "viewed"].includes(d.status)) Object.assign(d, { status: "signing", signed_at: "2026-09-28T12:00:00Z", consent_at: "2026-09-28T12:00:00Z", signature_data: b.p_evidence.signature_data,
        signed_name: b.p_evidence.signed_name, signature_type: b.p_evidence.signature_type, signed_ip: b.p_evidence.ip, doc_hash: d.audit.emergency.snapshot.source_sha256,
        audit: { ...d.audit, emergency: { ...d.audit.emergency, evidence: { ...b.p_evidence, hash: b.p_hash } } } });
      return { data: { ok: true }, error: null };
    }
    if (name === "finish_emergency_signing") {
      if (rows.some((d) => d.status === "signing")) this.noticeCount++;
      for (const d of rows) Object.assign(d, b.p_artifacts.find((a: any) => a.id === d.id), { status: "signed" });
      return { data: { ok: true }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}
function world() {
  const lead = { id: L, firm_id: F, campaign_id: CAMP, claimant_name: "CHAT TESTER", archived_at: null };
  const claim = { id: C, lead_id: L, firm_id: F, campaign_id: CAMP, campaign: "Test campaign", claim_type: "mva", status: "new", answers: {}, created_at: null };
  const db = new StoreDb({ leads: [lead], claims: [claim], signable_documents: [] });
  return { db, context: { ok: true as const, lead, campaignId: CAMP, matter: { ok: true as const, claim, sole: true, via: "named" as const } } };
}
const opts = { documents: [{ kind: "text", label: "Agreement", body: "I agree to the test agreement." }, { kind: "text", label: "Authorization", body: "I authorize this test." }], signerName: "CHAT TESTER", actorId: "offline", senderIp: "offline", reason: "Synthetic outage test" };
const input = { op: "sign", signed_name: "CHAT TESTER", signature_data: signaturePng(), signature_type: "drawn", consent_accepted: true, consent_version: "emergency-v1" };
const meta = { ip: "offline", ua: "offline" };
const tests: [string, () => any][] = [];
const t = (name: string, fn: () => any) => tests.push([name, fn]);
t("creation freezes source bytes and exact packet membership before publishing", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts);
  assert.equal(w.db.tables.signable_documents.length, 2);
  for (const d of p.docs) { assert.deepEqual(d.audit.emergency.packet_manifest.sort(), p.docs.map((r) => r.id).sort()); const bytes = w.db.objects.get(`signed-docs/${d.audit.emergency.snapshot.source_path}`)!; assert.equal(await evidenceHash(bytes), d.audit.emergency.snapshot.source_sha256); assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0); }
  assert.ok(w.db.uploads.every((p) => p.includes("source-")));
});
t("source-storage failure publishes no packet rows", async () => {
  const w = world(); w.db.failUpload = "source-"; await assert.rejects(createEmergencyPacket(w.db, w.context, opts)); assert.equal(w.db.tables.signable_documents.length, 0);
});
t("public review uses frozen source and never reads a live template", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts); w.db.ops = [];
  const view = await emergencyView(w.db, p.docs[0]); assert.ok(view.pdf.url.includes(p.docs[0].audit.emergency.snapshot.source_path)); assert.equal(w.db.ops.length, 0);
});
t("missing consent or invalid signature rejects before claiming evidence", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts);
  await assert.rejects(finishEmergencyPacket(w.db, p.docs, { ...input, consent_accepted: false }, meta));
  await assert.rejects(finishEmergencyPacket(w.db, p.docs, { ...input, signature_data: "data:image/png;base64,FAKE" }, meta));
  assert.equal(w.db.rpcCalls.length, 0);
});
t("cancelled or incomplete packet rejects before mutation", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts);
  await assert.rejects(finishEmergencyPacket(w.db, [p.docs[0]], input, meta));
  p.docs[0].status = "cancelled"; await assert.rejects(finishEmergencyPacket(w.db, p.docs, input, meta)); assert.equal(w.db.rpcCalls.length, 0);
});
t("artifact failure leaves immutable evidence pending; same signature retry completes", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts); w.db.failUpload = "cert-";
  await assert.rejects(finishEmergencyPacket(w.db, p.docs, input, meta));
  assert.ok(w.db.tables.signable_documents.every((d) => d.status === "signing")); assert.equal(w.db.noticeCount, 0);
  const firstHash = w.db.tables.signable_documents[0].audit.emergency.evidence.hash;
  const signedPath = `${F}/signed-${p.docs[0].envelope_id}.pdf`; const original = w.db.objects.get(`signed-docs/${signedPath}`);
  w.db.failUpload = ""; const result = await finishEmergencyPacket(w.db, p.docs, input, { ip: "retry", ua: "retry" });
  assert.equal(result.needs_resign, true); assert.ok(w.db.tables.signable_documents.every((d) => d.status === "signed"));
  assert.equal(w.db.tables.signable_documents[0].audit.emergency.evidence.hash, firstHash); assert.deepEqual(w.db.objects.get(`signed-docs/${signedPath}`), original);
  assert.equal(w.db.noticeCount, 1); assert.equal(w.db.tables.claims[0].status, "new");
});
t("all signed PDFs and certificates are real PDFs and a retry does not overwrite them", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts); await finishEmergencyPacket(w.db, p.docs, input, meta);
  const before = w.db.uploads.length; await finishEmergencyPacket(w.db, p.docs, input, meta); assert.equal(w.db.uploads.length, before); assert.equal(w.db.noticeCount, 1);
  for (const d of w.db.tables.signable_documents) for (const key of [d.completed_pdf_path, d.cert_pdf_path]) assert.ok((await PDFDocument.load(w.db.objects.get(`signed-docs/${key}`)!)).getPageCount() > 0);
});
t("page reload resumes saved evidence without drawing or consenting again", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts); w.db.failUpload = "cert-";
  await assert.rejects(finishEmergencyPacket(w.db, p.docs, input, meta));
  w.db.failUpload = "";
  const result = await finishEmergencyPacket(w.db, w.db.tables.signable_documents, { op: "resume" }, meta);
  assert.equal(result.ok, true); assert.equal(w.db.noticeCount, 1);
  assert.ok(w.db.tables.signable_documents.every((d) => d.signature_data === input.signature_data));
});
t("a changed frozen source fails before storing final artifacts", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts); w.db.objects.set(`signed-docs/${p.docs[0].audit.emergency.snapshot.source_path}`, new Uint8Array([1,2,3]));
  await assert.rejects(finishEmergencyPacket(w.db, p.docs, input, meta), /hash/); assert.equal(w.db.noticeCount, 0);
});
t("archived or moved matter rejects before claiming signature evidence", async () => {
  const w = world(); const p = await createEmergencyPacket(w.db, w.context, opts); w.db.tables.leads[0].archived_at = "2026-09-28";
  await assert.rejects(finishEmergencyPacket(w.db, p.docs, input, meta), /archived/); assert.equal(w.db.rpcCalls.length, 0);
});

(async () => { for (const [name, fn] of tests) { await fn(); console.log("ok", name); } console.log(`${tests.length} passed`); })().catch((e) => { console.error(e); process.exit(1); });
