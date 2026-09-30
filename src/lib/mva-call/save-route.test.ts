// Actual handler and merge helper; synthetic query builder, no network/provider.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../test-fake-db";
import * as matter from "../matter";
import * as merge from "./answer-merge";
import * as server from "./server";

globalThis.fetch = async () => { throw Error("Network forbidden"); };
const L = "10000000-0000-4000-8000-000000000001", C = "20000000-0000-4000-8000-000000000001";
function world(extra: any = {}) { return new FakeDb({
  leads: [{ id: L, firm_id: "firm", campaign_id: "campaign", phone: "", email: "" }],
  claims: [{ id: C, lead_id: L, firm_id: "firm", campaign_id: "campaign", claim_type: "mva", updated_at: "2026-09-28T00:00:00Z", answers: { mva_call: { story: { text: "Before" } }, another_form: "Keep", ...extra } }],
  intake_calls: [{ id: "call", lead_id: L, claim_id: C, status: "live", answers: { story: { text: "Stale session" } } }],
}); }
function route(db: FakeDb, trustedDb: FakeDb = db) {
  const mods: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, o: any = {}) => ({ body, status: o.status ?? 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => trustedDb },
    "@/lib/matter": matter, "@/lib/mva-call/answer-merge": merge,
    "@/lib/mva-call/server": { ...server, requireStaff: async () => ({ id: "agent", name: "Synthetic Agent" }) },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../../app/api/calls/save/route.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {};
  new Function("require", "exports", code)((id: string) => { if (!(id in mods)) throw Error(`Unstubbed ${id}`); return mods[id]; }, exp);
  return (extra: any = {}) => exp.POST({ text: async () => JSON.stringify({ lead_id: L, claim_id: C, call_id: "call", base_answers: { story: { text: "Before" } }, answers: { story: { text: "Agent edit" } }, ...extra }) });
}
function classicRoute(db: FakeDb) {
  (db as any).auth = { getUser: async () => ({ data: { user: { id: "agent" } } }) };
  db.tables.app_users = [{ id: "agent", role: "agent", full_name: "Synthetic Agent" }];
  const mods: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, o: any = {}) => ({ body, status: o.status ?? 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => db },
    "@/lib/audit": { recordAudit: async () => {} },
    "@/lib/questionnaire": { fieldLabelMap: () => ({}) },
    "@/lib/claim-properties": {},
  };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../../app/api/claim-intake/route.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {};
  new Function("require", "exports", code)((id: string) => { if (!(id in mods)) throw Error(`Unstubbed ${id}`); return mods[id]; }, exp);
  return () => exp.POST({ json: async () => ({ claim_id: C, firm_id: "firm", answers: { mva_call: { story: { text: "Stale classic copy" } } } }) });
}
let count = 0;
async function check(name: string, fn: () => Promise<void>) { await fn(); count++; console.log("ok", name); }
async function main() {
  await check("autosave merges agent change with existing import and unrelated claim keys", async () => {
    const db = world({ lawruler_presign: { version: 1 } });
    db.tables.claims[0].answers.mva_call.story.city = "Austin, TX";
    const r = await route(db)();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.answers.story, { text: "Agent edit", city: "Austin, TX" });
    assert.equal(db.tables.claims[0].answers.another_form, "Keep");
    assert.deepEqual(db.tables.intake_calls[0].answers, r.body.answers);
  });
  await check("a hidden sibling prevents adopting an old unbound call", async () => {
    const db = world();
    db.tables.intake_calls[0].claim_id = null;
    const trusted = new FakeDb({ claims: [
      { ...db.tables.claims[0] },
      { ...db.tables.claims[0], id: "20000000-0000-4000-8000-000000000002", campaign_id: "other-campaign" },
    ] });
    const r = await route(db, trusted)();
    assert.equal(r.status, 409);
    assert.match(r.body.error, /multi-matter/);
    assert.ok(db.ops.every(o => o.kind === "select"));
  });
  await check("import racing the claim CAS is reread and merged without losing its metadata", async () => {
    const db = world(); let raced = false;
    db.failOn = op => {
      if (op.table === "claims" && op.kind === "update" && !raced) {
        raced = true;
        db.tables.claims[0].updated_at = "2026-09-28T00:00:01Z";
        db.tables.claims[0].answers = { ...db.tables.claims[0].answers, lawruler_presign: { version: 1 }, mva_call: { story: { text: "Before", city: "Austin, TX" } } };
      }
      return null;
    };
    const r = await route(db)(); assert.equal(r.status, 200);
    assert.equal(r.body.answers.story.city, "Austin, TX");
    assert.equal(db.tables.claims[0].answers.lawruler_presign.version, 1);
    assert.equal(db.ops.filter(o => o.table === "claims" && o.kind === "update").length, 2);
  });
  await check("same-leaf conflict is visible and writes neither claim nor call", async () => {
    const db = world(); db.tables.claims[0].answers.mva_call.story.text = "Other agent";
    const r = await route(db)(); assert.equal(r.status, 409); assert.equal(r.body.conflict, true);
    assert.deepEqual(r.body.conflicts, ["story.text"]);
    assert.ok(db.ops.every(o => o.kind === "select"));
  });
  await check("intentional clear is preserved across save and subsequent import", async () => {
    const db = world(), r = await route(db)({ answers: { story: { text: "" } } });
    assert.equal(r.status, 200);
    assert.equal(merge.fillMissingAnswerLeaves(r.body.answers, { story: { text: "Imported narrative" } }).value.story.text, "");
  });
  await check("legacy no-base saves refuse imported claims but remain compatible without imports", async () => {
    const imported = world({ lawruler_presign: { version: 1 } });
    assert.equal((await route(imported)({ base_answers: undefined })).status, 409);
    assert.ok(imported.ops.every(o => o.kind === "select"));
    assert.equal((await route(world())({ base_answers: undefined })).status, 200);
  });
  await check("failed claim write never updates the session mirror", async () => {
    const db = world(); db.failOn = op => op.table === "claims" && op.kind === "update" ? "Synthetic claim failure" : null;
    const r = await route(db)(); assert.equal(r.status, 500);
    assert.equal(db.tables.intake_calls[0].answers.story.text, "Stale session");
  });
  await check("failed session mirror is honest and identical retry completes safely", async () => {
    const db = world(); db.failOn = op => op.table === "intake_calls" && op.kind === "update" ? "Synthetic mirror failure" : null;
    const post = route(db), failed = await post(); assert.equal(failed.status, 500); assert.equal(failed.body.retryable, true);
    assert.equal(db.tables.claims[0].answers.mva_call.story.text, "Agent edit");
    assert.equal(db.tables.intake_calls[0].answers.story.text, "Stale session");
    db.failOn = () => null;
    assert.equal((await post()).status, 200);
    assert.equal(db.tables.intake_calls[0].answers.story.text, "Agent edit");
  });
  await check("closed or foreign call refuses before canonical mutation", async () => {
    for (const change of [{ status: "ended" }, { lead_id: "other" }, { claim_id: "other" }]) {
      const db = world(); Object.assign(db.tables.intake_calls[0], change);
      assert.equal((await route(db)()).status, 409);
      assert.ok(db.ops.every(o => o.kind === "select"));
    }
  });
  await check("SSN is excluded from both saved answers and returned canonical document", async () => {
    const db = world(); const r = await route(db)({ answers: { story: { text: "Agent edit" }, file: { ssn: "000000000", dob: "01/01/1990" } } });
    assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.body.answers).includes("000000000"));
  });
  await check("legacy scoped session can seed an absent canonical document without default pollution", async () => {
    const db = world(); delete db.tables.claims[0].answers.mva_call;
    const r = await route(db)(); assert.equal(r.status, 200);
    assert.deepEqual(r.body.answers, { story: { text: "Agent edit" } });
  });
  await check("classic full-object MVA write cannot erase recovered answers", async () => {
    const db = world({ lawruler_presign: { version: 1 } });
    assert.equal((await classicRoute(db)()).status, 409);
    assert.ok(db.ops.every(o => o.kind === "select"));
  });
  await check("classic CAS retry notices import metadata arriving after its first read", async () => {
    const db = world(); let raced = false;
    db.failOn = op => {
      if (op.table === "claims" && op.kind === "update" && !raced) {
        raced = true; db.tables.claims[0].updated_at = "2026-09-28T00:00:01Z";
        db.tables.claims[0].answers = { ...db.tables.claims[0].answers, lawruler_presign: { version: 1 } };
      }
      return null;
    };
    assert.equal((await classicRoute(db)()).status, 409);
    assert.equal(db.tables.claims[0].answers.mva_call.story.text, "Before");
  });
  console.log(`${count} passed`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
