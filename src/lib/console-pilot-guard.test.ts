// Exercise the real legacy console route with a staff session and inaccessible
// matter IDs. No provider, admin database, or network is contacted.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(path.resolve(__dirname, "../app/api/console/route.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
let adminReads = 0;
let adminWrites = 0;
const admin: any = {
  from(table: string) {
    adminReads++;
    if (table === "firms") return {
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: { id: "tmp-firm", name: "TMP", slug: "tmp" }, error: null }),
    };
    adminWrites++;
    throw new Error(`unexpected admin read/write ${table}`);
  },
};
const invisible = () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) });
const sb: any = { from: () => invisible() };
const g = { id: "agent-1", role: "agent", firmId: "tmp-firm", name: "Agent", can: () => false };
const modules: Record<string, any> = {
  "next/server": { NextResponse: { json: (body: any, init?: any) => ({ status: init?.status ?? 200, body }) } },
  "@/lib/supabase-server": { supabaseServer: async () => sb, supabaseAdmin: () => admin },
  "@/lib/gate": { gateUser: async () => g },
  "@/lib/statuses": { manualIntakeStatusAllowed: () => true },
  "@/lib/mva-call/signing-matter": {},
};
const exportsOfRoute: any = {};
new Function("require", "exports", "module", js)((id: string) => {
  if (id in modules) return modules[id];
  throw new Error(`unstubbed ${id}`);
}, exportsOfRoute, { exports: exportsOfRoute });

(async () => {
  for (const body of [
    { op: "save", claim_id: "hidden-claim", answers: { secret: "x" } },
    { op: "identity", lead_id: "hidden-lead", client: { first_name: "Changed" } },
    { op: "disposition", lead_id: "hidden-lead", status_key: "contacting" },
    { op: "open_existing", lead_id: "hidden-lead" },
  ]) {
    const result = await exportsOfRoute.POST({ json: async () => body });
    assert.equal(result.status, 403, JSON.stringify(body));
  }
  const get = await exportsOfRoute.GET({ url: "https://claimreach.test/api/console?lead_id=hidden-lead" });
  assert.equal(get.status, 403);
  assert.equal(adminReads, 0, "inaccessible IDs stop before any privileged read");
  assert.equal(adminWrites, 0, "inaccessible IDs stop before any privileged write");

  const wrongCase = await exportsOfRoute.POST({ json: async () => ({ op: "open", case_type: "motel", registry_key: "motel", first_name: "Synthetic" }) });
  assert.equal(wrongCase.status, 403);
  assert.equal(adminWrites, 0, "non-INNO creation stops before minting or writing a file");

  let createdClaim: any = null;
  let failClaimInsert = false;
  const rows: Record<string, any[]> = {
    firms: [{ id: "tmp-firm", name: "TMP", slug: "tmp" }],
    campaigns: [
      { id: "other-mva", firm_id: "tmp-firm", case_type: "mva", active: true, name: "Other MVA" },
      { id: "pilot-mva", firm_id: "tmp-firm", case_type: "mva", active: true, name: "INNO MVA" },
    ],
    campaign_retainers: [],
  };
  admin.rpc = async (name: string) => ({ data: name === "cr_inno_mva_campaign_id" ? "pilot-mva" : "TMP-SYNTH", error: null });
  admin.from = (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    let inserted: any = null;
    const q: any = {
      select() { return q; }, eq(key: string, value: any) { filters.push((row) => row[key] === value); return q; },
      limit() { return q; }, order() { return q; },
      insert(row: any) { inserted = row; adminWrites++; return q; },
      async maybeSingle() { return { data: (rows[table] ?? []).find((row) => filters.every((f) => f(row))) ?? null, error: null }; },
      async single() {
        if (table === "claims") createdClaim = inserted;
        if (table === "claims" && failClaimInsert) return { data: null, error: { message: "synthetic write failure" } };
        return { data: { id: `${table}-synthetic`, lead_no: "TMP-SYNTH", ...inserted }, error: null };
      },
      then(resolve: any, reject: any) { return Promise.resolve({ data: (rows[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null }).then(resolve, reject); },
    };
    return q;
  };
  const opened = await exportsOfRoute.POST({ json: async () => ({ op: "open", case_type: "mva", registry_key: "mva", first_name: "Synthetic" }) });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.campaign_id, "pilot-mva", "another active MVA campaign cannot displace the pilot");
  assert.equal(createdClaim.campaign_id, "pilot-mva", "new matter remains visible under pilot RLS");
  failClaimInsert = true;
  const incomplete = await exportsOfRoute.POST({ json: async () => ({ op: "open", case_type: "mva", registry_key: "mva", first_name: "Synthetic" }) });
  assert.equal(incomplete.status, 500);
  assert.equal(incomplete.body.ok, undefined, "an orphaned lead is never reported as a completed call");
  assert.match(incomplete.body.error, /matter did not save/);
  console.log("ok legacy console respects the INNO pilot wall on reads, writes, and creation");
})().catch((e) => { console.error(e); process.exitCode = 1; });
