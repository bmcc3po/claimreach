import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../../../../lib/test-fake-db";
import { isInternalRole } from "../../../../lib/permissions";
import { nullifyEmpty } from "../../../../lib/coerce";
import { intakeFirmScope } from "../../../../lib/intake-firm-scope";

function harness(options: { role?: string; editable?: boolean; firm?: string; campaign?: string; hidden?: boolean } = {}) {
  const db = new FakeDb({
    firms: [{ id: "firm", slug: "tmp" }],
    leads: options.hidden ? [] : [{ id: "lead", firm_id: "firm", campaign_id: options.campaign ?? "campaign", case_type: "mva", archived_at: null, marketing_source: null, esign_date: null }],
    campaigns: [{ id: "campaign", firm_id: "firm", name: "INNO MVA", case_type: "mva", active: true }, { id: "other", firm_id: "firm", name: "OTHER", case_type: "mva", active: true }],
  });
  const audit: any[] = [];
  const user = { id: "agent", role: options.role ?? "agent", firmId: options.firm ?? "firm", name: "Test Agent", can: () => options.editable !== false };
  const organizationDb = new FakeDb({ firms: [{ id: "intake-team", slug: "inno" }] });
  organizationDb.failOn = op => {
    assert.equal(op.kind, "select"); assert.equal(op.table, "firms");
    assert.deepEqual(op.filters, [["eq", "id", user.firmId]]);
    assert.ok(db.ops.some(read => read.table === "leads" && read.kind === "select"));
    return null;
  };
  const source = fs.readFileSync(path.resolve(__dirname, "route.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const modules: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, init: any = {}) => ({ body, status: init.status ?? 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => organizationDb },
    "@/lib/gate": { gateUser: async () => user },
    "@/lib/permissions": { isInternalRole },
    "@/lib/coerce": { nullifyEmpty },
    "@/lib/intake-firm-scope": { intakeFirmScope },
    "@/lib/audit": { recordAudit: async (entry: any) => { audit.push(entry); } },
  };
  const out: any = {};
  new Function("require", "exports", js)((id: string) => {
    if (!(id in modules)) throw new Error(`Unstubbed module ${id}`);
    return modules[id];
  }, out);
  return { db, organizationDb, audit, save: (body: any) => out.POST({ json: async () => ({ lead_id: "lead", ...body }) }) };
}

async function main() {
  const staff = harness({ firm: "intake-team" });
  assert.equal((await staff.save({ case_summary: "Synthetic summary" })).status, 200);
  assert.equal(staff.db.tables.leads[0].case_summary, "Synthetic summary");
  assert.equal(staff.audit[0].firm_id, "firm");
  for (const mutation of [(h: any) => h.db.tables.firms[0].slug = "tmt", (h: any) => h.organizationDb.tables.firms[0].slug = "other-org"]) {
    const h = harness({ firm: "intake-team" }); mutation(h);
    assert.equal((await h.save({ case_summary: "Blocked" })).status, 403);
    assert.equal(h.audit.length, 0);
  }
  for (const unavailable of ["missing", "error", "hidden-recipient"]) {
    const h = harness({ firm: "intake-team" });
    if (unavailable === "missing") h.organizationDb.tables.firms = [];
    if (unavailable === "error") h.organizationDb.failOn = () => "Configuration unavailable";
    if (unavailable === "hidden-recipient") h.db.tables.firms = [];
    assert.equal((await h.save({ case_summary: "Blocked" })).status, unavailable === "error" ? 503 : 403);
    assert.equal(h.audit.length, 0);
    assert.equal(h.db.ops.filter(op => op.kind !== "select").length, 0);
    if (unavailable === "hidden-recipient") assert.equal(h.organizationDb.ops.length, 0);
  }
  for (const options of [{ role: "firm" }, { editable: false }, { firm: "other-firm" }, { campaign: "other" }, { hidden: true }]) {
    const h = harness(options);
    const result = await h.save({ marketing_source: "Synthetic" });
    assert.ok([403, 404].includes(result.status));
    assert.equal(h.db.ops.filter((op) => op.table === "leads" && op.kind === "update").length, 0);
    assert.equal(h.audit.length, 0);
  }
  const h = harness();
  const result = await h.save({ marketing_source: "Synthetic", esign_date: "2026-09-30" });
  assert.equal(result.status, 200);
  assert.equal(h.db.tables.leads[0].marketing_source, "Synthetic");
  assert.equal(h.db.tables.leads[0].esign_date, null, "signing evidence is not edited here");
  assert.deepEqual(h.audit[0].meta.fields, ["marketing_source"]);
  console.log("case details permit scoped edits and reject hidden, cross-firm, and non-pilot files");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

