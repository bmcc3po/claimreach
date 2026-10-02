import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(path.resolve(__dirname, "../../app/api/calls/file/doc/[id]/route.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const json = (body: any, init: any = {}) => ({ status: init.status || 200, body });
let role = "owner";
let document: any = { id: "doc", file_name: "signed-retainer.pdf", storage_path: "firm/lead/doc.pdf" };
let downloaded = 0;
const sb = { from: (table: string) => {
  assert.equal(table, "case_documents");
  return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: document, error: null }) }) }) };
} };
const route: any = {};
new Function("require", "exports", code)((name: string) => {
  if (name === "next/server") return { NextResponse: { json } };
  if (name === "@/lib/supabase-server") return { supabaseServer: async () => sb, supabaseAdmin: () => ({ storage: { from: (bucket: string) => {
    assert.equal(bucket, "case-docs");
    return { download: async (storagePath: string) => { downloaded++; assert.equal(storagePath, document.storage_path); return { data: new Blob(["%PDF-1.7"], { type: "application/pdf" }), error: null }; } };
  } } }) };
  if (name === "@/lib/mva-call/server") return { requireStaff: async () => role ? { role } : null };
  throw new Error(`Unexpected import ${name}`);
}, route);

const request = new Request("https://app.example.invalid/api/calls/file/doc/doc");
const context = { params: Promise.resolve({ id: "doc" }) };

(async () => {
  role = "";
  assert.equal((await route.GET(request, context)).status, 401);
  role = "agent";
  assert.equal((await route.GET(request, context)).status, 403);
  assert.equal(downloaded, 0);
  role = "owner";
  document = null;
  assert.equal((await route.GET(request, context)).status, 404);
  assert.equal(downloaded, 0);
  document = { id: "doc", file_name: "signed-retainer.pdf", storage_path: "firm/lead/doc.pdf" };
  const response = await route.GET(request, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Disposition") || "", /attachment/);
  assert.equal(downloaded, 1);
  console.log("ok manual original download requires owner/admin and an RLS-visible PDF");
})().catch((error) => { console.error(error); process.exitCode = 1; });
