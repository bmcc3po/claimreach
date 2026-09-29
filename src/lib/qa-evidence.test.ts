// QA approval needs the selected matter's own complete, stored agreement
// (Astra round 7b, #58), and legacy evidence is attached to a matter on
// purpose. Runs the REAL route source (src/app/api/qa/route.ts) with the
// real matter resolver and permissions against an in-memory database.
// No network, no real storage, no SQL.
// Run: npx tsx src/lib/qa-evidence.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as permissions from "./permissions";
import * as matter from "./matter";
import * as signedDocs from "./signed-docs";
import * as agreementNames from "./mva-call/agreement-names";

let pass = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); pass++; console.log("ok", name); };

const ROOT = path.resolve(__dirname, "..", "..");
function loadRoute(rel: string, mods: Record<string, any>): any {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exp: any = {};
  const req = (id: string) => { if (id in mods) return mods[id]; throw new Error(`unstubbed import ${id}`); };
  new Function("require", "exports", "module", js)(req, exp, { exports: exp });
  return exp;
}

// PostgREST `or` filter, enough for matterRowsFilter: col.eq.v, col.is.null,
// and(...), or(...).
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function term(s: string): (r: any) => boolean {
  if (s.startsWith("and(")) { const fs2 = splitTop(s.slice(4, -1)).map(term); return (r) => fs2.every((f) => f(r)); }
  if (s.startsWith("or(")) { const fs2 = splitTop(s.slice(3, -1)).map(term); return (r) => fs2.some((f) => f(r)); }
  const [col, op, ...rest] = s.split(".");
  const v = rest.join(".");
  if (op === "is" && v === "null") return (r) => r[col] == null;
  if (op === "eq") return (r) => r[col] != null && String(r[col]) === v;
  throw new Error(`fake or(): unsupported term ${s}`);
}
const orFilter = (expr: string) => { const fs2 = splitTop(expr).map(term); return (r: any) => fs2.some((f) => f(r)); };

// ---- ids (hex, because matterRowsFilter keeps only uuid characters) ------
const LEAD = "lead-1", OTHER_LEAD = "lead-2", FIRM = "firm-1";
const MVA = "c1000000-0000-4000-8000-000000000001";
const MOTEL = "c2000000-0000-4000-8000-000000000002";
const C_MVA = "ca000000-0000-4000-8000-00000000000a";
const C_MOT = "cb000000-0000-4000-8000-00000000000b";
const C_PLAIN = "cc000000-0000-4000-8000-00000000000c";

const claimRow = (id: string, camp: string, created: string) => ({
  id, lead_id: LEAD, firm_id: FIRM, campaign_id: camp, campaign: camp, claim_type: "mva", status: "signed_qa",
  answers: {}, created_at: created, created_by: "agent-1", dup_override: false,
});
const sub = (id: string, o: Record<string, any>) => ({
  id, lead_id: LEAD, firm_id: FIRM, provider: "docuseal", pax_index: null, claim_id: null, campaign_id: C_MVA,
  status: "completed", submission_id: `ds-${id}`, completed_pdf_path: `${FIRM}/signed-ds-ds-${id}.pdf`,
  cert_pdf_path: `${FIRM}/cert-ds-ds-${id}.pdf`, doc_count: 1, voided_at: null, template_key: "TX",
  signer_name: "Pat Example", signed_at: "2026-09-20T10:00:00Z", completed_at: "2026-09-20T10:05:00Z", created_at: `2026-09-20T10:00:0${id.length % 10}Z`,
  ...o,
});

function world(seed: { claims?: any[]; subs?: any[]; retainers?: any[]; signables?: any[]; objects?: string[]; campaigns?: any[] } = {}, o: { short?: string[]; fault?: string } = {}) {
  const tables: Record<string, any[]> = {
    app_users: [
      { id: "qa-1", role: "qa", firm_id: null, full_name: "Quinn QA", active: true, perm_overrides: null },
      { id: "agent-1", role: "agent", firm_id: null, full_name: "Ava Agent", active: true, perm_overrides: null },
      { id: "mgr-1", role: "manager", firm_id: null, full_name: "Max Manager", active: true, perm_overrides: null },
      { id: "qa-denied", role: "qa", firm_id: null, full_name: "No QA", active: true, perm_overrides: { "intake.qa": false } },
    ],
    leads: [{ id: LEAD, firm_id: FIRM }, { id: OTHER_LEAD, firm_id: FIRM }],
    campaigns: seed.campaigns ?? [{ id: C_MVA, esign_required: true }, { id: C_MOT, esign_required: true }, { id: C_PLAIN, esign_required: false }],
    claims: seed.claims ?? [claimRow(MVA, C_MVA, "2026-09-01")],
    esign_submissions: seed.subs ?? [],
    retainers: seed.retainers ?? [],
    signable_documents: seed.signables ?? [],
    qa_reviews: [], report_cards: [], qa_thread: [],
  };
  const objects = new Set<string>(seed.objects ?? []);
  const short = new Set<string>(o.short ?? []);
  const audits: any[] = [], statusCalls: any[] = [];
  let me = "qa-1";

  function from(table: string) {
    const f: ((r: any) => boolean)[] = [];
    let op: "read" | "update" | "insert" = "read";
    let patch: any; let single = false; let head = false; let returning = false;
    let sort: [string, boolean] | null = null; let lim: number | null = null;
    const q: any = {
      select(_c?: string, opt?: any) { if (op !== "read") returning = true; if (opt?.head) head = true; return q; },
      eq(k: string, v: any) { f.push((r) => r[k] === v); return q; },
      neq(k: string, v: any) { f.push((r) => r[k] !== v); return q; },
      in(k: string, vs: any[]) { f.push((r) => vs.includes(r[k])); return q; },
      is(k: string, v: any) { f.push((r) => (v === null ? r[k] == null : r[k] === v)); return q; },
      not(k: string, opn: string, v: any) { if (opn === "is" && v === null) f.push((r) => r[k] != null); return q; },
      or(expr: string) { f.push(orFilter(expr)); return q; },
      order(k: string, opt?: any) { sort = [k, opt?.ascending !== false]; return q; },
      limit(n: number) { lim = n; return q; },
      maybeSingle() { single = true; return q; },
      single() { single = true; return q; },
      update(p: any) { op = "update"; patch = p; return q; },
      insert(p: any) { op = "insert"; patch = p; return q; },
      then(res: any, rej: any) {
        if (o.fault === `${table}:${op}`) return Promise.resolve({ data: null, error: { message: `synthetic ${op} failure` } }).then(res, rej);
        const rows = tables[table] ?? (tables[table] = []);
        if (op === "insert") {
          const list = (Array.isArray(patch) ? patch : [patch]).map((p: any) => ({ id: `new-${rows.length + 1}`, ...p }));
          rows.push(...list);
          return Promise.resolve({ data: returning ? list : null, error: null }).then(res, rej);
        }
        let hit = rows.filter((r) => f.every((x) => x(r)));
        if (op === "update") {
          hit.forEach((r) => Object.assign(r, patch));
          return Promise.resolve({ data: returning ? hit.map((r) => ({ ...r })) : null, error: null }).then(res, rej);
        }
        if (head) return Promise.resolve({ data: null, error: null, count: hit.length }).then(res, rej);
        if (sort) { const [k, asc] = sort; hit = hit.slice().sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1)); }
        if (lim != null) hit = hit.slice(0, lim);
        const data = hit.map((r) => ({ ...r }));
        return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(res, rej);
      },
    };
    return q;
  }
  const db: any = {
    auth: { getUser: async () => ({ data: { user: { id: me } } }) },
    from,
    storage: { from: (bucket: string) => ({
      async list(folder: string, opt: any) {
        assert.equal(bucket, signedDocs.SIGNED_BUCKET);
        const names = [...objects].filter((p) => p.startsWith(`${folder}/`)).map((p) => p.slice(folder.length + 1))
          .filter((n) => !n.includes("/") && (!opt?.search || n.includes(opt.search)));
        return { data: names.map((name) => ({ name })), error: null };
      },
    }) },
  };
  const route = loadRoute("src/app/api/qa/route.ts", {
    "next/server": { NextResponse: { json: (body: any, init?: any) => ({ status: init?.status ?? 200, body }) } },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => db },
    "@/lib/claim-status": { setClaimStatusForLeads: async (x: any) => { statusCalls.push(x); return { ok: true }; } },
    "@/lib/audit": { recordAudit: async (a: any) => { audits.push(a); } },
    "@/lib/permissions": permissions,
    "@/lib/matter": matter,
    "@/lib/mva-call/esign": { packetShort: async (_admin: any, row: any) => short.has(row.id) },
    "@/lib/signed-docs": signedDocs,
    "@/lib/mva-call/agreement-names": agreementNames,
  });
  const post = (body: any) => route.POST({ url: "https://synthetic.invalid/api/qa", json: async () => body });
  const approve = (extra: any = {}) => post({
    op: "submit", lead_id: LEAD, claim_id: MVA, decision: "approve",
    g_qa_pass: "green", g_esign: "yellow", g_criteria: "green", c_leading: "green", c_complete: "green", ...extra,
  });
  return { tables, audits, statusCalls, post, approve, as: (id: string) => { me = id; } };
}

const refusedCleanly = (w: ReturnType<typeof world>) => {
  assert.equal(w.tables.qa_reviews.length, 0, "no review of record is written");
  assert.equal(w.statusCalls.length, 0, "the file does not move");
};

(async () => {
  await t("a complete, whole agreement stamped with this matter approves (yellow gate allowed)", async () => {
    const w = world({ subs: [sub("s1", { claim_id: MVA })] });
    const r = await w.approve();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, status: "signed_approved" });
    assert.deepEqual(w.statusCalls[0].claimIds, [MVA]);
    assert.equal(w.tables.qa_reviews.length, 1);
  });

  await t("client-signed only (Signed, not completed) is refused", async () => {
    const w = world({ subs: [sub("s1", { claim_id: MVA, status: "signed", completed_at: null })] });
    const r = await w.approve();
    assert.equal(r.status, 400);
    assert.match(r.body.error, /the PNC signed, but the agreement is not complete yet/);
    refusedCleanly(w);
  });

  await t("completed but the stored packet is short (packetShort) is refused", async () => {
    const w = world({ subs: [sub("s1", { claim_id: MVA })] }, { short: ["s1"] });
    const r = await w.approve();
    assert.equal(r.status, 400);
    assert.match(r.body.error, /stored copy is not whole/);
    refusedCleanly(w);
  });

  await t("voided is refused, by status or by a void stamp on a completed row", async () => {
    for (const row of [sub("s1", { claim_id: MVA, status: "voided", voided_at: "2026-09-21T00:00:00Z" }),
                       sub("s1", { claim_id: MVA, voided_at: "2026-09-21T00:00:00Z" })]) {
      const w = world({ subs: [row] });
      const r = await w.approve();
      assert.equal(r.status, 400);
      assert.match(r.body.error, /was voided/);
      refusedCleanly(w);
    }
  });

  await t("a sibling matter's stamped agreement does not sign this one", async () => {
    const w = world({
      claims: [claimRow(MVA, C_MVA, "2026-09-01"), claimRow(MOTEL, C_MOT, "2026-09-02")],
      subs: [sub("s1", { claim_id: MOTEL, campaign_id: C_MOT })],
    });
    const r = await w.approve();
    assert.equal(r.status, 400);
    assert.match(r.body.error, /no completed signing is on file for this matter/);
    assert.equal(r.body.needs_association, undefined, "a stamped sibling row is never offered");
    refusedCleanly(w);
  });

  await t("unattached legacy evidence on a multi-matter file asks for association (campaign null is no wildcard)", async () => {
    const w = world({
      claims: [claimRow(MVA, C_MVA, "2026-09-01"), claimRow(MOTEL, C_MOT, "2026-09-02")],
      subs: [sub("legacy1", { claim_id: null, campaign_id: null })],
    });
    const r = await w.approve();
    assert.equal(r.status, 409);
    assert.equal(r.body.needs_association, true);
    assert.equal(r.body.claim_id, MVA);
    assert.deepEqual(r.body.candidates.map((c: any) => [c.kind, c.id]), [["esign", "legacy1"]]);
    assert.match(r.body.candidates[0].label, /^Texas agreement signed by Pat Example on 2026-09-20$/);
    assert.match(r.body.error, /more than one matter/);
    refusedCleanly(w);
  });

  await t("unattached legacy evidence on the file's one matter (compatible campaign) approves", async () => {
    const w = world({ subs: [sub("legacy1", { claim_id: null, campaign_id: C_MVA })] });
    const r = await w.approve();
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "signed_approved");
  });

  await t("the same legacy row with a whole packet missing on the sole matter is still refused", async () => {
    const w = world({ subs: [sub("legacy1", { claim_id: null })] }, { short: ["legacy1"] });
    const r = await w.approve();
    assert.equal(r.status, 400);
    assert.match(r.body.error, /not whole/);
    refusedCleanly(w);
  });

  await t("association: an agent is refused and nothing changes", async () => {
    const w = world({
      claims: [claimRow(MVA, C_MVA, "2026-09-01"), claimRow(MOTEL, C_MOT, "2026-09-02")],
      subs: [sub("legacy1", { claim_id: null })],
    });
    w.as("agent-1");
    const r = await w.post({ op: "associate_evidence", lead_id: LEAD, claim_id: MVA, submission_id: "legacy1" });
    assert.equal(r.status, 403);
    assert.equal(w.tables.esign_submissions[0].claim_id, null);
    assert.equal(w.audits.length, 0);
    w.as("qa-denied");
    assert.equal((await w.post({ op: "associate_evidence", lead_id: LEAD, claim_id: MVA, submission_id: "legacy1" })).status, 403, "an explicit intake.qa=false wins");
    assert.equal(w.tables.esign_submissions[0].claim_id, null);
  });

  await t("association: QA attaches, it is audited, and approval then passes", async () => {
    const w = world({
      claims: [claimRow(MVA, C_MVA, "2026-09-01"), claimRow(MOTEL, C_MOT, "2026-09-02")],
      subs: [sub("legacy1", { claim_id: null })],
    });
    const r = await w.post({ op: "associate_evidence", lead_id: LEAD, claim_id: MVA, submission_id: "legacy1" });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(w.tables.esign_submissions[0].claim_id, MVA);
    assert.equal(w.audits.length, 1);
    assert.equal(w.audits[0].claim_id, MVA);
    assert.equal(w.audits[0].meta.row_id, "legacy1");
    const again = await w.approve();
    assert.equal(again.status, 200);
    assert.equal(again.body.status, "signed_approved");
  });

  await t("association: a manager may attach a retainer", async () => {
    const w = world({ retainers: [{ id: "r1", lead_id: LEAD, claim_id: null, status: "signed", completed_pdf_url: "https://app.signwell.test/doc.pdf", signer_name: "Pat", signed_at: "2026-09-19T00:00:00Z", created_at: "2026-09-19" }] });
    w.as("mgr-1");
    const r = await w.post({ op: "associate_evidence", lead_id: LEAD, claim_id: MVA, retainer_id: "r1" });
    assert.equal(r.status, 200);
    assert.equal(w.tables.retainers[0].claim_id, MVA);
  });

  await t("association refuses a row from another file, one already on another matter, and a claim of another file", async () => {
    const w = world({
      claims: [claimRow(MVA, C_MVA, "2026-09-01"), claimRow(MOTEL, C_MOT, "2026-09-02")],
      subs: [sub("elsewhere", { lead_id: OTHER_LEAD }), sub("taken", { claim_id: MOTEL })],
    });
    const a = await w.post({ op: "associate_evidence", lead_id: LEAD, claim_id: MVA, submission_id: "elsewhere" });
    assert.equal(a.status, 400);
    const b = await w.post({ op: "associate_evidence", lead_id: LEAD, claim_id: MVA, submission_id: "taken" });
    assert.equal(b.status, 409);
    assert.equal(w.tables.esign_submissions[1].claim_id, MOTEL, "never re-pointed");
    const c = await w.post({ op: "associate_evidence", lead_id: OTHER_LEAD, claim_id: MVA, submission_id: "elsewhere" });
    assert.equal(c.status, 400, "the claim must belong to the named file");
    const d = await w.post({ op: "associate_evidence", lead_id: LEAD, claim_id: MVA, submission_id: "taken", retainer_id: "r1" });
    assert.equal(d.status, 400, "exactly one agreement");
    assert.equal(w.audits.length, 0);
  });

  await t("a retainer attached to this claim with its signed PDF stored approves", async () => {
    const w = world({
      retainers: [{ id: "r1", lead_id: LEAD, claim_id: MVA, status: "signed", completed_pdf_url: null, signer_name: "Pat", signed_at: "2026-09-19T00:00:00Z", created_at: "2026-09-19" }],
      signables: [{ id: "sd1", retainer_id: "r1", status: "signed", completed_pdf_path: `${FIRM}/signed-env1.pdf` }],
      objects: [`${FIRM}/signed-env1.pdf`],
    });
    const r = await w.approve();
    assert.equal(r.status, 200);
  });

  await t("a retainer whose PDF pointer has no stored object is refused", async () => {
    const w = world({
      retainers: [{ id: "r1", lead_id: LEAD, claim_id: MVA, status: "signed", completed_pdf_url: "/api/signed-doc/sd1/signed", signer_name: "Pat", signed_at: null, created_at: "2026-09-19" }],
      signables: [{ id: "sd1", retainer_id: "r1", status: "signed", completed_pdf_path: `${FIRM}/signed-env1.pdf` }],
    });
    const r = await w.approve();
    assert.equal(r.status, 400);
    assert.match(r.body.error, /no signed PDF is stored/);
    refusedCleanly(w);
  });

  await t("a lead-level legacy retainer never counts on its own, even on the only matter: attach it first", async () => {
    const w = world({ retainers: [{ id: "r1", lead_id: LEAD, claim_id: null, status: "signed", completed_pdf_url: "https://app.signwell.test/doc.pdf", signer_name: "Pat", signed_at: "2026-09-19T00:00:00Z", created_at: "2026-09-19" }] });
    const r = await w.approve();
    assert.equal(r.status, 409);
    assert.equal(r.body.needs_association, true);
    assert.deepEqual(r.body.candidates.map((c: any) => [c.kind, c.id]), [["retainer", "r1"]]);
    refusedCleanly(w);
  });

  await t("a read failure fails closed: 500, nothing written", async () => {
    const w = world({ subs: [sub("s1", { claim_id: MVA })] }, { fault: "esign_submissions:read" });
    const r = await w.approve();
    assert.equal(r.status, 500);
    refusedCleanly(w);
  });

  await t("the non-signed track is unchanged: no agreement needed", async () => {
    const w = world({ claims: [{ ...claimRow(MVA, C_PLAIN, "2026-09-01"), status: "qa" }] });
    const r = await w.approve();
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "approved");
  });

  await t("existing gates still hold: a red gate and an agent cannot approve", async () => {
    const w = world({ subs: [sub("s1", { claim_id: MVA })] });
    assert.equal((await w.approve({ g_criteria: "red" })).status, 400);
    w.as("agent-1");
    assert.equal((await w.approve()).status, 403);
    refusedCleanly(w);
  });

  console.log(`${pass} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
