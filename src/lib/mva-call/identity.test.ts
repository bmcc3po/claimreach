import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { getIdentityMetadata, normalizeIdentityValue, readIdentityForSigning, saveIdentity } from "./identity";

const scope = { leadId: "lead", claimId: "claim", firmId: "firm" };
const saved = { saved: true, mode: "full", version: 2, saved_at: "2026-09-29T19:00:00Z" };
const synthetic = "123456789";
let checks = 0;
async function test(name: string, fn: () => any) { await fn(); checks++; console.log("ok", name); }

function routeFixture() {
  let staff: any = { id: "agent" };
  let context: any = { ok: true, lead: { id: "lead", firm_id: "firm" }, matter: { claim: { id: "claim" } } };
  let result: any = { data: saved, error: null };
  const calls = { admin: 0, body: 0, resolved: 0, rpcs: [] as { name: string; args: any }[] };
  const admin = { rpc: async (name: string, args: any) => { calls.rpcs.push({ name, args }); return result; } };
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, opts: any) => ({ body, ...opts }) } },
    "@/lib/supabase-server": { supabaseServer: async () => ({}), supabaseAdmin: () => { calls.admin++; return admin; } },
    "@/lib/mva-call/server": { requireStaff: async () => staff },
    "@/lib/mva-call/signing-matter": { resolveSigningMatter: async () => { calls.resolved++; return context; } },
    "@/lib/mva-call/identity": { getIdentityMetadata, saveIdentity },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../../app/api/calls/identity/route.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const route: any = {};
  new Function("require", "exports", code)((name: string) => { assert.ok(name in modules, `Unknown route dependency ${name}`); return modules[name]; }, route);
  return { route, calls, setStaff: (v: any) => { staff = v; }, setContext: (v: any) => { context = v; }, setResult: (v: any) => { result = v; },
    request: (body: any = { lead_id: "lead", claim_id: "claim", ssn: synthetic, mode: "full", expected_version: 1 }) => ({ url: "https://test.invalid/api/calls/identity?lead_id=lead&claim_id=claim", json: async () => { calls.body++; return body; } }) };
}

async function main() {
  await test("identity input accepts exactly selected digits and harmless formatting", () => {
    assert.equal(normalizeIdentityValue("123-45-6789", "full"), synthetic);
    assert.equal(normalizeIdentityValue("6789", "last4"), "6789");
    for (const [v, mode] of [["12345678", "full"], ["123456789", "last4"], ["abcd6789", "last4"], [synthetic, "unexpected"], [123456789, "full"]]) assert.equal(normalizeIdentityValue(v, mode), null);
  });
  await test("metadata helper strips extra raw value/last4 and never calls decrypt RPC", async () => {
    const result = await getIdentityMetadata({ rpc: async (name: string) => { assert.equal(name, "cr_identity_metadata"); return { data: { ...saved, ssn: synthetic, last4: "6789" } }; } }, scope);
    assert.deepEqual(result, { ok: true, identity: saved });
  });
  await test("unsaved metadata is explicit version zero and signing helper returns null", async () => {
    assert.deepEqual(await getIdentityMetadata({ rpc: async () => ({ data: { saved: false, version: 0, ssn: synthetic } }) }, scope), { ok: true, identity: { saved: false, mode: null, version: 0, saved_at: null } });
    assert.deepEqual(await readIdentityForSigning({ rpc: async () => ({ data: null }) }, scope), { ok: true, identity: null });
  });
  await test("invalid value or missing expected version stops before privileged RPC", async () => {
    let calls = 0;
    for (const input of [{ ssn: "bad", mode: "full", expectedVersion: 0 }, { ssn: synthetic, mode: "full", expectedVersion: undefined }]) {
      const result = await saveIdentity({ rpc: async () => { calls++; } }, scope, { ...input, actorId: "agent" });
      assert.equal(result.ok, false);
    }
    assert.equal(calls, 0);
  });
  await test("provider/DB error text never exposes private input; stale version returns conflict", async () => {
    for (const code of ["40001", "42501", "XX000"]) {
      const result = await saveIdentity({ rpc: async () => ({ error: { code, message: synthetic } }) }, scope, { ssn: synthetic, mode: "full", expectedVersion: 1, actorId: "agent" });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, code === "40001" ? 409 : code === "42501" ? 403 : 503);
      assert.equal(JSON.stringify(result).includes(synthetic), false);
    }
  });
  await test("backend signing helper reads only exact server scope and validates returned value", async () => {
    const result = await readIdentityForSigning({ rpc: async (name: string, args: any) => {
      assert.equal(name, "cr_read_identity_for_signing");
      assert.deepEqual(args, { p_lead_id: "lead", p_claim_id: "claim", p_firm_id: "firm" });
      return { data: { ssn: synthetic, mode: "full", version: 2 } };
    } }, scope);
    assert.deepEqual(result, { ok: true, identity: { ssn: synthetic, mode: "full", version: 2 } });
  });
  await test("identity GET/POST deny unauthenticated before body parsing or admin access", async () => {
    for (const method of ["GET", "POST"]) {
      const f = routeFixture(); f.setStaff(null);
      const result = await f.route[method](f.request());
      assert.equal(result.status, 401); assert.equal(f.calls.admin, 0); assert.equal(f.calls.body, 0);
      assert.match(result.headers["Cache-Control"], /no-store/);
    }
  });
  await test("identity endpoints resolve RLS matter before service role and reject hidden/cross-firm scope", async () => {
    for (const method of ["GET", "POST"]) {
      const f = routeFixture(); f.setContext({ ok: false, status: 404, error: "Lead not found." });
      assert.equal((await f.route[method](f.request())).status, 404);
      assert.equal(f.calls.admin, 0);
    }
  });
  await test("early/late save succeeds without agreement lookup; returns metadata only", async () => {
    const f = routeFixture();
    const result = await f.route.POST(f.request());
    assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true, ...saved });
    assert.equal(f.calls.rpcs[0].name, "cr_save_identity");
    assert.equal(f.calls.rpcs[0].args.p_actor_id, "agent");
    assert.equal(JSON.stringify(result.body).includes(synthetic), false);
    assert.equal("last4" in result.body, false);
    assert.match(result.headers["Cache-Control"], /no-store/);
  });
  await test("GET has no value and POST stale save is not reported successful", async () => {
    const f = routeFixture();
    assert.deepEqual((await f.route.GET(f.request())).body, saved);
    f.setResult({ error: { code: "40001", message: synthetic } });
    const result = await f.route.POST(f.request());
    assert.equal(result.status, 409); assert.equal(result.body.ok, undefined);
    assert.equal(JSON.stringify(result.body).includes(synthetic), false);
  });
  console.log(`${checks} secure identity helper/route checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
