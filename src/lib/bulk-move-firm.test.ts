// Firm transfer (bulk "Move to firm"): copy, switch, then clean up.
// Runs the REAL route source (src/app/api/leads/bulk/route.ts) against an
// in-memory database and storage. No network, no real storage, no SQL.
// Run: npx tsx src/lib/bulk-move-firm.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as permissions from "./permissions";

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

// ---- a tiny in-memory world ------------------------------------------------
const FA = "firm-a", FB = "firm-b", CA = "camp-a", CB = "camp-b", L1 = "lead-1", L2 = "lead-2";
type Faults = {
  copy?: (from: string, to: string) => string | null;
  remove?: (p: string) => string | null | "throw";
  rpc?: "ok" | "refuse" | "lost" | "throw";
  leadsRead?: boolean;
};

function world(opts: { docs?: any[]; extraObjects?: string[]; faults?: Faults } = {}) {
  const faults = opts.faults ?? {};
  const tables: Record<string, any[]> = {
    app_users: [{ id: "u1", role: "owner", perm_overrides: null, active: true }],
    firms: [{ id: FA }, { id: FB }],
    campaigns: [{ id: CA, firm_id: FA, name: "A intake" }, { id: CB, firm_id: FB, name: "B intake" }],
    leads: [{ id: L1, firm_id: FA, campaign_id: CA }, { id: L2, firm_id: FA, campaign_id: CA }],
    case_documents: opts.docs ?? [
      { id: "d1", lead_id: L1, firm_id: FA, storage_path: `${FA}/${L1}/police.pdf` },
      { id: "d2", lead_id: L1, firm_id: FA, storage_path: `${FA}/${L1}/photo.jpg` },
    ],
  };
  const objects = new Set<string>([...tables.case_documents.map((d) => d.storage_path), ...(opts.extraObjects ?? [])]);
  const log: string[] = [];
  const audits: any[] = [];

  function query(table: string) {
    const f: ((r: any) => boolean)[] = [];
    let single = false;
    const q: any = {
      select() { return q; },
      eq(k: string, v: any) { f.push((r) => r[k] === v); return q; },
      in(k: string, vs: any[]) { f.push((r) => vs.includes(r[k])); return q; },
      not(k: string, op: string, v: any) { if (op === "is" && v === null) f.push((r) => r[k] != null); return q; },
      maybeSingle() { single = true; return q; },
      then(res: any, rej: any) {
        log.push(`read ${table}`);
        if (table === "leads" && faults.leadsRead) return Promise.resolve({ data: null, error: { message: "leads unreadable" } }).then(res, rej);
        const rows = (tables[table] ?? []).filter((r) => f.every((x) => x(r))).map((r) => ({ ...r }));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
      },
    };
    return q;
  }

  // What move_leads_to_firm does, faithfully enough to catch a bad mapping.
  function applyTransfer(p: any): { n: number } | { error: string } {
    const camp = tables.campaigns.find((c) => c.id === p.p_campaign_id && c.firm_id === p.p_firm_id);
    if (!camp) return { error: "move_leads_to_firm: the target campaign must belong to the target firm" };
    const map = new Map<string, string>((p.p_doc_moves ?? []).map((m: any) => [m.id, m.new_path]));
    const missing = tables.case_documents.filter((d) => p.p_lead_ids.includes(d.lead_id) && d.storage_path
      && !String(map.get(d.id) ?? "").startsWith(`${p.p_firm_id}/${d.lead_id}/`));
    if (missing.length) return { error: `move_leads_to_firm: ${missing.length} document(s) were not relocated to the new firm` };
    let n = 0;
    for (const l of tables.leads) if (p.p_lead_ids.includes(l.id)) { l.firm_id = p.p_firm_id; l.campaign_id = p.p_campaign_id; n++; }
    for (const d of tables.case_documents) if (map.has(d.id)) { d.storage_path = map.get(d.id); d.firm_id = p.p_firm_id; }
    return { n };
  }

  const bucket = {
    async exists(p: string) { log.push(`exists ${p}`); return { data: objects.has(p), error: null }; },
    async copy(from: string, to: string) {
      log.push(`copy ${from} -> ${to}`);
      const fail = faults.copy?.(from, to);
      if (fail) return { data: null, error: { message: fail } };
      if (!objects.has(from)) return { data: null, error: { message: "Object not found" } };
      if (objects.has(to)) return { data: null, error: { message: "The resource already exists" } };
      objects.add(to);
      return { data: { path: to }, error: null };
    },
    async remove(paths: string[]) {
      const p = paths[0];
      log.push(`remove ${p}`);
      const fail = faults.remove?.(p);
      if (fail === "throw") throw new Error("network dropped");
      if (fail) return { data: null, error: { message: fail } };
      objects.delete(p);
      return { data: [{ name: p }], error: null };
    },
    async move() { throw new Error("the transfer must never move an original"); },
  };

  const admin: any = {
    from: (table: string) => query(table),
    storage: { from: (b: string) => { assert.equal(b, "case-docs"); return bucket; } },
    async rpc(name: string, params: any) {
      assert.equal(name, "move_leads_to_firm");
      log.push("rpc");
      const mode = faults.rpc ?? "ok";
      if (mode === "throw") throw new Error("socket hang up");
      if (mode === "refuse") return { data: null, error: { message: "synthetic refusal" } };
      const r = applyTransfer(params);
      if ("error" in r) return { data: null, error: { message: r.error } };
      if (mode === "lost") return { data: null, error: { message: "fetch failed" } };
      return { data: r.n, error: null };
    },
  };
  const sb: any = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => query(table),
  };
  const route = loadRoute("src/app/api/leads/bulk/route.ts", {
    "next/server": { NextResponse: { json: (body: any, init?: any) => ({ status: init?.status ?? 200, body }) } },
    "@/lib/supabase-server": { supabaseServer: async () => sb, supabaseAdmin: () => admin },
    "@/lib/permissions": permissions,
    "@/lib/claim-status": { setClaimStatusForLeads: async () => { throw new Error("not in this test"); } },
    "@/lib/audit": { recordAudit: async (a: any) => { audits.push(a); } },
  });
  const move = (body: any) => route.POST({ json: async () => ({ op: "move_firm", ids: [L1], firmId: FB, campaignId: CB, ...body }) });
  return { tables, objects, log, audits, move };
}

const docPaths = (w: ReturnType<typeof world>) => w.tables.case_documents.map((d) => d.storage_path).sort();
const storageOps = (w: ReturnType<typeof world>) => w.log.filter((x) => /^(exists|copy|remove)/.test(x));

(async () => {
  await t("success: copies, one transaction, then the originals go; every row opens", async () => {
    const w = world();
    const r = await w.move({});
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, count: 1, documents_moved: 2 });
    assert.deepEqual(docPaths(w), [`${FB}/${L1}/photo.jpg`, `${FB}/${L1}/police.pdf`]);
    assert.deepEqual([...w.objects].sort(), [`${FB}/${L1}/photo.jpg`, `${FB}/${L1}/police.pdf`]);
    for (const p of docPaths(w)) assert.ok(w.objects.has(p), `row points at a real object: ${p}`);
    // Originals are removed only after the transaction.
    const rpcAt = w.log.indexOf("rpc");
    assert.ok(w.log.findIndex((x) => x.startsWith("remove")) > rpcAt);
    assert.ok(w.log.findLastIndex((x) => x.startsWith("copy")) < rpcAt);
    assert.equal(w.tables.leads[0].firm_id, FB);
    assert.equal(w.audits.length, 0);
  });

  await t("second copy fails: the first copy is removed, the database is never asked, Nothing moved", async () => {
    const w = world({ faults: { copy: (from) => (from.endsWith("photo.jpg") ? "storage unavailable" : null) } });
    const r = await w.move({});
    assert.equal(r.status, 500);
    assert.match(r.body.error, /^Nothing moved: a document could not be copied/);
    assert.match(r.body.error, /storage unavailable/);
    assert.ok(!w.log.includes("rpc"));
    assert.deepEqual([...w.objects].sort(), [`${FA}/${L1}/photo.jpg`, `${FA}/${L1}/police.pdf`]);
    assert.deepEqual(docPaths(w), [`${FA}/${L1}/photo.jpg`, `${FA}/${L1}/police.pdf`]);
    assert.ok(w.log.includes(`remove ${FB}/${L1}/police.pdf`));
    assert.ok(!w.log.some((x) => x.startsWith(`remove ${FA}/`)), "originals untouched");
    assert.equal(w.tables.leads[0].firm_id, FA);
  });

  await t("destination collision: nothing is overwritten, earlier copies removed, the foreign object kept", async () => {
    const stray = `${FB}/${L1}/photo.jpg`;
    const w = world({ extraObjects: [stray] });
    const r = await w.move({});
    assert.equal(r.status, 409);
    assert.match(r.body.error, /^Nothing moved: a file already exists at firm-b\/lead-1\/photo\.jpg/);
    assert.match(r.body.error, /not overwritten/);
    assert.ok(!w.log.includes("rpc"));
    assert.ok(!w.log.includes(`copy ${FA}/${L1}/photo.jpg -> ${stray}`), "never copied over it");
    assert.ok(w.objects.has(stray), "the object already there is not ours to delete");
    assert.ok(!w.objects.has(`${FB}/${L1}/police.pdf`), "our own earlier copy was removed");
    assert.ok(w.objects.has(`${FA}/${L1}/police.pdf`) && w.objects.has(`${FA}/${L1}/photo.jpg`));
  });

  await t("RPC refusal with successful cleanup: copies removed, originals intact, Nothing moved", async () => {
    const w = world({ faults: { rpc: "refuse" } });
    const r = await w.move({});
    assert.equal(r.status, 500);
    assert.match(r.body.error, /^Nothing moved: the database refused the move \(synthetic refusal\)/);
    assert.deepEqual([...w.objects].sort(), [`${FA}/${L1}/photo.jpg`, `${FA}/${L1}/police.pdf`]);
    assert.deepEqual(docPaths(w), [`${FA}/${L1}/photo.jpg`, `${FA}/${L1}/police.pdf`]);
    for (const p of docPaths(w)) assert.ok(w.objects.has(p));
    assert.equal(w.audits.length, 0);
  });

  await t("RPC refusal with a cleanup failure: never says Nothing moved; names the leftover; audited", async () => {
    const left = `${FB}/${L1}/police.pdf`;
    const w = world({ faults: { rpc: "refuse", remove: (p) => (p === left ? "permission denied" : null) } });
    const r = await w.move({});
    assert.equal(r.status, 500);
    assert.doesNotMatch(r.body.error, /Nothing moved/);
    assert.match(r.body.error, /^The move did not happen: the database refused the move/);
    assert.match(r.body.error, /1 copy made in the new firm's folder could not be removed/);
    assert.deepEqual(r.body.leftover_copies, [left]);
    // The authoritative rows and objects are the originals, still readable.
    for (const p of docPaths(w)) assert.ok(w.objects.has(p) && p.startsWith(`${FA}/`));
    assert.equal(w.audits.length, 1);
    assert.equal(w.audits[0].lead_id, L1);
    assert.equal(w.audits[0].firm_id, FA);
    assert.deepEqual(w.audits[0].meta.leftover_paths, [left]);
    assert.equal(w.audits[0].meta.outcome, "not_moved");
  });

  await t("RPC success with an original-removal failure: success that says N old copies need cleanup", async () => {
    const stuck = `${FA}/${L1}/photo.jpg`;
    const w = world({ faults: { remove: (p) => (p === stuck ? "throw" : null) } });
    const r = await w.move({});
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.cleanup_pending, [stuck]);
    assert.match(r.body.warning, /^The move is done: 1 file now belongs to the new firm/);
    assert.match(r.body.warning, /1 old copy in the previous firm's folder could not be removed and still need cleanup: firm-a\/lead-1\/photo\.jpg/);
    for (const p of docPaths(w)) assert.ok(w.objects.has(p) && p.startsWith(`${FB}/`));
    assert.equal(w.audits.length, 1);
    assert.equal(w.audits[0].firm_id, FB);
    assert.deepEqual(w.audits[0].meta.leftover_paths, [stuck]);
    assert.equal(w.audits[0].meta.outcome, "moved");
  });

  await t("campaign of another firm is refused before any storage call or SQL", async () => {
    const w = world();
    const r = await w.move({ campaignId: CA });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /^Nothing moved: that campaign belongs to a different firm/);
    assert.deepEqual(storageOps(w), []);
    assert.ok(!w.log.includes("rpc"));
    assert.ok(!w.log.includes("read case_documents"), "not even the documents are read");
  });

  await t("unknown firm or campaign is refused before any storage call", async () => {
    const w = world();
    assert.equal((await w.move({ firmId: "firm-x" })).status, 400);
    assert.equal((await w.move({ campaignId: "camp-x" })).status, 400);
    assert.deepEqual(storageOps(w), []);
  });

  await t("an error answer after a real commit (lost reply) finishes the move instead of deleting the copies", async () => {
    const w = world({ faults: { rpc: "lost" } });
    const r = await w.move({});
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    for (const p of docPaths(w)) assert.ok(w.objects.has(p) && p.startsWith(`${FB}/`), `row opens: ${p}`);
    assert.ok(!w.objects.has(`${FA}/${L1}/police.pdf`));
  });

  await t("an error answer whose result cannot be checked keeps both sets and says so", async () => {
    const w = world({ faults: { rpc: "throw", leadsRead: true } });
    const r = await w.move({});
    assert.equal(r.status, 500);
    assert.doesNotMatch(r.body.error, /Nothing moved/);
    assert.match(r.body.error, /could not be confirmed/);
    assert.equal(w.objects.size, 4, "originals and copies all kept");
    assert.deepEqual(r.body.kept_copies.sort(), [`${FB}/${L1}/photo.jpg`, `${FB}/${L1}/police.pdf`]);
    assert.ok(!storageOps(w).some((x) => x.startsWith("remove")));
    assert.equal(w.audits[0].meta.outcome, "unknown");
  });

  await t("a document already under the target firm keeps its path: not copied, not removed", async () => {
    const w = world({ docs: [
      { id: "d1", lead_id: L1, firm_id: FA, storage_path: `${FA}/${L1}/a.pdf` },
      { id: "d3", lead_id: L2, firm_id: FB, storage_path: `${FB}/${L2}/b.pdf` },
    ] });
    w.tables.leads[1].firm_id = FB;
    const r = await w.move({ ids: [L1, L2] });
    assert.equal(r.status, 200);
    assert.equal(r.body.documents_moved, 1);
    assert.ok(!w.log.some((x) => x.includes(`${L2}/b.pdf`) && /^(copy|remove)/.test(x)));
    assert.deepEqual(docPaths(w), [`${FB}/${L1}/a.pdf`, `${FB}/${L2}/b.pdf`]);
    for (const p of docPaths(w)) assert.ok(w.objects.has(p));
  });

  await t("two rows sharing one object copy it once", async () => {
    const w = world({ docs: [
      { id: "d1", lead_id: L1, firm_id: FA, storage_path: `${FA}/${L1}/same.pdf` },
      { id: "d2", lead_id: L1, firm_id: FA, storage_path: `${FA}/${L1}/same.pdf` },
    ] });
    const r = await w.move({});
    assert.equal(r.status, 200);
    assert.equal(w.log.filter((x) => x.startsWith("copy")).length, 1);
    assert.deepEqual(docPaths(w), [`${FB}/${L1}/same.pdf`, `${FB}/${L1}/same.pdf`]);
    assert.ok(w.objects.has(`${FB}/${L1}/same.pdf`));
  });

  await t("a document outside its file's folder stops the move before storage", async () => {
    const w = world({ docs: [{ id: "d9", lead_id: L1, firm_id: FA, storage_path: `${FA}/other-lead/x.pdf` }] });
    const r = await w.move({});
    assert.equal(r.status, 409);
    assert.deepEqual(storageOps(w), []);
  });

  console.log(`${pass} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
