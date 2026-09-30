import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { passwordProblem } from "./password-rules";

// Exercise the actual self-service route. No Auth provider or real credentials.
const source = fs.readFileSync("src/app/api/me/password/route.ts", "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(opts: Record<string, any> = {}) {
  const original = { id: "synthetic-staff", email: "staff@example.invalid", app_metadata: { must_change_password: true, preserved: "unchanged" } };
  let current: any = original;
  const writes: any[] = [];
  let reads = 0;
  const admin = { auth: { admin: {
    updateUserById: async (id: string, value: any) => {
      writes.push({ id, value });
      if (opts.writeThrows) throw new Error("offline");
      if (opts.writeError) return { error: { message: "synthetic rejection" } };
      current = { ...original, app_metadata: value.app_metadata };
      return { data: { user: opts.updateResult ?? current }, error: null };
    },
    getUserById: async (id: string) => {
      assert.equal(id, original.id); reads++;
      if (opts.readThrows) throw new Error("offline");
      if (opts.readError) return { data: null, error: { message: "offline" } };
      return { data: { user: opts.readback ?? current }, error: null };
    },
  } } };
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/password-rules": { passwordProblem },
    "@/lib/supabase-server": {
      supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: opts.signedOut ? null : original } }) } }),
      supabaseAdmin: () => admin,
    },
  };
  const exports: any = {};
  new Function("require", "exports", code)((id: string) => { assert.ok(id in modules); return modules[id]; }, exports);
  return { run: (password = "Synthetic summer 2026!") => exports.POST({ json: async () => ({ password, id: "another-user", app_metadata: { role: "owner" } }) }), writes, reads: () => reads };
}
async function main() {
  const ok = fixture(); const result = await ok.run();
  assert.equal(result.status, 200); assert.equal(result.body.ok, true);
  assert.equal(ok.writes[0].id, "synthetic-staff");
  assert.deepEqual(ok.writes[0].value.app_metadata, { must_change_password: false, preserved: "unchanged" });
  assert.equal(ok.reads(), 1);
  assert.ok(!JSON.stringify(result).includes("Synthetic summer"));
  const out = fixture({ signedOut: true }); assert.equal((await out.run()).status, 401); assert.equal(out.writes.length, 0);
  for (const pw of ["short", "Thomas123", "Ty-Seria123"]) {
    const bad = fixture(); assert.equal((await bad.run(pw)).status, 400); assert.equal(bad.writes.length, 0);
  }
  const failed = fixture({ writeError: true }); assert.equal((await failed.run()).status, 500); assert.equal(failed.reads(), 0);
  for (const options of [{ writeThrows: true }, { readThrows: true }, { readError: true },
    { updateResult: { id: "another-user", app_metadata: { must_change_password: false } } },
    { updateResult: { id: "synthetic-staff", app_metadata: { must_change_password: true } } },
    { readback: { id: "another-user", app_metadata: { must_change_password: false } } },
    { readback: { id: "synthetic-staff", app_metadata: { must_change_password: true } } }]) {
    const uncertain = await fixture(options).run(); assert.equal(uncertain.status, 502); assert.equal(uncertain.body.ok, undefined);
  }
  console.log("13 self-password success, validation, ownership and failure scenarios passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
