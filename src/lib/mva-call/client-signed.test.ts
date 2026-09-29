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

  // Simulate old Workers rejecting both RequestInit.cache and framework-only
  // options. The first request must be portable, with private HTTP caching off.
  const oldRuntime = fakeStorage(); let portableRequests = 0;
  assert.deepEqual(await ensureClientSignedSnapshot(oldRuntime.admin, row, {
    ...deps(),
    fetchPdf: (async (_url: any, init: any) => {
      portableRequests++;
      if ('cache' in init || 'next' in init) throw new Error('Unsupported cache mode: no-store');
      assert.equal(init.headers['Cache-Control'], 'no-store, no-cache');
      assert.equal(init.headers.Pragma, 'no-cache');
      return new Response(PDF);
    }) as typeof fetch,
  }), { ok: true, path });
  assert.equal(portableRequests, 1);
  assert.equal(oldRuntime.uploads, 1);
  const privateUrl = "https://docuseal.com/file/private-token.pdf";
  for (const status of [403, 404, 500]) {
    const failed = fakeStorage(); let downloads = 0;
    const result = await ensureClientSignedSnapshot(failed.admin, row, {
      ...deps(privateUrl),
      fetchPdf: (async () => { downloads++; return new Response(privateUrl, { status }); }) as typeof fetch,
    });
    assert.deepEqual(result, { ok: false, error: `DocuSeal's preview download failed (HTTP ${status}).` });
    assert.equal(downloads, 1, "HTTP failures must not retry");
    assert.equal(failed.uploads, 0);
    assert.equal(JSON.stringify(result).includes(privateUrl), false);
  }
  for (const failure of [new TypeError(`Failed to fetch ${privateUrl}`), new Error("The cache field on RequestInitializerDict is not implemented in fetch"), new TypeError("Unsupported cache mode: no-cache")]) {
    const failed = fakeStorage(); let downloads = 0;
    const result = await ensureClientSignedSnapshot(failed.admin, row, {
      ...deps(privateUrl),
      fetchPdf: (async () => { downloads++; throw failure; }) as typeof fetch,
    });
    assert.deepEqual(result, { ok: false, error: "DocuSeal's preview download could not start (connection or runtime failure)." });
    assert.equal(downloads, 1, "unrecognized runtime/network failures must not retry");
    assert.equal(failed.uploads, 0);
    assert.equal(JSON.stringify(result).includes(privateUrl), false);
  }
  const unreadable = fakeStorage(); let bodyDownloads = 0;
  const bodyResult = await ensureClientSignedSnapshot(unreadable.admin, row, {
    ...deps(),
    fetchPdf: (async () => {
      bodyDownloads++;
      return { ok: true, headers: new Headers(), arrayBuffer: async () => { throw new Error(privateUrl); } };
    }) as any,
  });
  assert.deepEqual(bodyResult, { ok: false, error: "DocuSeal's preview download could not be read." });
  assert.equal(bodyDownloads, 1);
  assert.equal(unreadable.uploads, 0);

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
