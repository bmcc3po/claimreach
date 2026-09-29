// Run: npx tsx src/lib/mva-call/client-signed.test.ts
import assert from "node:assert/strict";
import { allowedDocuSealFileUrl, clientSignedPath, ensureClientSignedSnapshot } from "./client-signed";

const PDF = new TextEncoder().encode("%PDF-1.7\nsynthetic client signature\n");
const row = { firm_id: "firm-1", submission_id: "117", status: "signed", signed_at: "2026-09-29T10:00:00Z" };
const path = "firm-1/client-ds-117.pdf";

function fakeStorage() {
  const objects = new Map<string, Uint8Array>();
  let uploads = 0;
  const bucket = {
    list: async (folder: string, opts: { search: string }) => ({
      data: [...objects.keys()].filter((p) => p.startsWith(folder + "/") && p.split("/")[1] === opts.search)
        .map((p) => ({ name: p.split("/")[1] })), error: null,
    }),
    upload: async (key: string, bytes: Uint8Array) => { uploads++; objects.set(key, bytes); return { error: null }; },
  };
  return { admin: { storage: { from: () => bucket } }, objects, get uploads() { return uploads; } };
}

function deps(url = "https://docuseal.com/file/synthetic.pdf", bytes = PDF) {
  let calls = 0;
  return {
    getDocuments: (async () => { calls++; return { ok: true, data: { id: 117, documents: [{ name: "packet", url }] } }; }) as any,
    fetchPdf: (async () => new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf" } })) as any,
    get calls() { return calls; },
  };
}

async function main() {
  assert.equal(clientSignedPath("firm-1", "117"), path);
  assert.equal(clientSignedPath("firm-1", "../../117"), null);
  assert.equal(allowedDocuSealFileUrl("https://docuseal.com/file/abc.pdf"), true);
  assert.equal(allowedDocuSealFileUrl("http://docuseal.com/file/abc.pdf"), false);
  assert.equal(allowedDocuSealFileUrl("https://docuseal.com.evil.test/file.pdf"), false);

  const storage = fakeStorage(); const provider = deps();
  assert.deepEqual(await ensureClientSignedSnapshot(storage.admin, row, provider), { ok: true, path });
  assert.deepEqual(storage.objects.get(path), PDF);
  assert.equal(storage.uploads, 1);
  assert.deepEqual(await ensureClientSignedSnapshot(storage.admin, row, provider), { ok: true, path });
  assert.equal(storage.uploads, 1, "subsequent polls must reuse the preserved preliminary PDF");
  assert.equal(provider.calls, 1);

  const unsigned = fakeStorage();
  assert.equal((await ensureClientSignedSnapshot(unsigned.admin, { ...row, status: "opened", signed_at: null }, deps())).ok, false);
  assert.equal(unsigned.objects.size, 0);
  const badUrl = fakeStorage();
  assert.equal((await ensureClientSignedSnapshot(badUrl.admin, row, deps("https://example.com/file.pdf"))).ok, false);
  assert.equal(badUrl.objects.size, 0);
  const badPdf = fakeStorage();
  assert.equal((await ensureClientSignedSnapshot(badPdf.admin, row, deps(undefined, new TextEncoder().encode("<html>error</html>")))).ok, false);
  assert.equal(badPdf.objects.size, 0);
  console.log("ok client-signed preliminary PDF preservation and isolation");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
