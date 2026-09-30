// Execute the real middleware with synthetic session/response boundaries.
// No network, provider calls, or claimant data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { pilotStaffApiAllowed, pilotStaffPageAllowed } from "./inno-pilot-access";
import { isInternalRole } from "./permissions";
import { isPartnerIdentity, partnerMayUsePath } from "./partner-access";

const source = fs.readFileSync(path.resolve(__dirname, "../middleware.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
class Reply {
  kind = "response";
  headers = new Headers();
  constructor(public body: any = null, public init: any = {}) {}
  static next() { const r = new Reply(); r.kind = "next"; return r; }
  static redirect(url: URL) { const r = new Reply(null, { location: url.pathname + url.search }); r.kind = "redirect"; return r; }
}
async function run(urlPath: string, role: string | null = "agent", method = "GET", extra: Record<string, any> = {}) {
  let authReads = 0;
  const user = role ? { id: "synthetic", email: "staff@example.invalid", app_metadata: extra.metadata || {}, user_metadata: extra.userMetadata || {} } : null;
  const me = role ? { id: "synthetic", role, active: extra.active !== false } : null;
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: me, error: null }) };
  const db = { auth: { getUser: async () => { authReads++; return { data: { user } }; } }, from: () => query };
  const modules: Record<string, any> = {
    "next/server": { NextResponse: Reply }, "@supabase/ssr": { createServerClient: () => db },
    "@/lib/firm-home": { resolveFirmHome: async () => null },
    "@/lib/m6": { bouncePath: () => null, isSafeFirmNext: () => false },
    "@/lib/mva-call/links": { safeAppNext: () => null },
    "@/lib/permissions": { isInternalRole }, "@/lib/partner-access": { isPartnerIdentity, partnerMayUsePath },
    "@/lib/inno-pilot-access": { pilotStaffApiAllowed, pilotStaffPageAllowed },
  };
  const exports: any = {};
  new Function("require", "exports", code)((name: string) => { assert.ok(name in modules, `Unstubbed module ${name}`); return modules[name]; }, exports);
  const nextUrl: any = new URL(urlPath, "https://claimreach.example.invalid");
  nextUrl.clone = () => new URL(nextUrl.href);
  const result = await exports.middleware({ nextUrl, method, cookies: { getAll: () => [], set: () => {} } });
  return { result, authReads };
}

async function main() {
  for (const role of ["agent", "manager", "qa", "admin"]) {
    for (const target of ["/signed", "/leads", "/leads/TMT-1034", "/users", "/team", "/firms", "/templates", "/integrations", "/settings", "/m6", "/portal", "/signing-admin", "/tools-admin", "/auth-admin"]) {
      const { result } = await run(target, role);
      assert.equal(result.kind, "redirect", `${role} ${target}`);
      assert.equal(result.init.location, "/app", `${role} ${target}`);
    }
    for (const target of ["/dashboard", "/queue", "/app", "/app/TMP-1219", "/app/TMP-1219/print", "/set-password"]) {
      assert.equal((await run(target, role)).result.kind, "next", `${role} ${target}`);
    }
    assert.equal((await run("/api/me/password", role, "POST")).result.kind, "next");
    for (const [target, method] of [["/api/me/password", "GET"], ["/api/me/profile", "POST"], ["/api/users", "POST"], ["/api/documents", "POST"], ["/api/calls/esign-setup", "POST"]]) {
      assert.equal((await run(target, role, method)).result.init.status, 403, `${role} ${method} ${target}`);
    }
    const flagged = { metadata: { must_change_password: true }, userMetadata: { must_change_password: false } };
    for (const target of ["/dashboard", "/app", "/app/TMP-1219", "/app/TMP-1219/print", "/queue", "/signed", "/login"]) {
      assert.equal((await run(target, role, "GET", flagged)).result.init.location, "/set-password", `${role} first-password ${target}`);
    }
    for (const target of ["/api/calls/file", "/api/calls/search", "/api/calls/esign/doc/synthetic/client", "/api/statuses"]) {
      assert.equal((await run(target, role, "GET", flagged)).result.init.status, 403, `${role} blocked ${target}`);
    }
    for (const target of ["/api/leads", "/api/calls/esign", "/api/notes", "/api/me/profile"]) {
      assert.equal((await run(target, role, "POST", flagged)).result.init.status, 403, `${role} blocked ${target}`);
    }
    for (const target of ["/set-password", "/auth/signout", "/auth/callback"]) {
      assert.equal((await run(target, role, "GET", flagged)).result.kind, "next", `${role} onboarding ${target}`);
    }
    assert.equal((await run("/api/me/password", role, "POST", flagged)).result.kind, "next");
    assert.equal((await run("/api/me/password", role, "GET", flagged)).result.init.status, 403);
    assert.equal((await run("/api/me/password/other", role, "POST", flagged)).result.init.status, 403);
    assert.equal((await run("/api/calls/file", role, "GET", { metadata: { must_change_password: false }, userMetadata: { must_change_password: true } })).result.kind, "next");
  }
  for (const target of ["/sign/synthetic-token", "/sign/packet/synthetic-group", "/tools/property?k=synthetic", "/favicon.ico"]) {
    const { result, authReads } = await run(target, null);
    assert.equal(result.kind, "next", target);
    assert.equal(authReads, 0, `${target} keeps its own public authentication`);
  }
  assert.equal((await run("/signed", null)).result.init.location, "/login");
  assert.equal((await run("/signed", "owner")).result.kind, "next");
  assert.equal((await run("/settings", "owner")).result.kind, "next");
  assert.equal((await run("/settings", "owner", "GET", { metadata: { must_change_password: true } })).result.kind, "next");
  assert.equal((await run("/portal", "firm", "GET", { metadata: { must_change_password: true } })).result.kind, "next");
  assert.equal((await run("/api/calls/file", "agent", "GET", { active: false })).result.init.status, 403);
  const partner = await run("/signed", "agent", "GET", { metadata: { account_type: "partner" } });
  assert.equal(partner.result.init.location, "/partner");
  console.log("actual middleware blocks legacy/prefix areas, preserves pilot and public signing, and permits only exact password change");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
