// npx tsx src/lib/firm-delivery.test.ts
// Claim-specific firm delivery (Astra round 7b #57), against a fake Supabase
// client: tables, PostgREST filters (including the `or` strings that
// matterRowsFilter emits) and the signed-docs bucket. Nothing touches a
// network, provider or database.
import assert from "node:assert/strict";
import { deliverLeadToFirm, matterSendState, type FirmEmail, type DeliverDeps } from "./firm-delivery";
import { loadIntakeBundle, buildIntakeCsvSingle } from "./intake-render";

let pass = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); pass++; console.log("ok", name); };

type Row = Record<string, any>;

// ---- fake PostgREST `or` filter (the subset matterRowsFilter emits) ----
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0; let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function term(x: string): (r: Row) => boolean {
  const m = x.match(/^(and|or)\((.*)\)$/);
  if (m) {
    const parts = splitTop(m[2]).map(term);
    return m[1] === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const [col, op, ...rest] = x.split(".");
  const val = rest.join(".");
  if (op === "eq") return (r) => r[col] != null && String(r[col]) === val;
  if (op === "is" && val === "null") return (r) => r[col] == null;
  throw new Error(`fake db: unsupported filter ${x}`);
}
const orFilter = (expr: string) => { const parts = splitTop(expr).map(term); return (r: Row) => parts.some((p) => p(r)); };
const cmp = (a: any, b: any) => (a == null && b == null ? 0 : a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);

function fakeDb(tables: Record<string, Row[]>, opts: { failRead?: string[]; failWrite?: string[]; storage?: Record<string, Uint8Array> } = {}) {
  const storage = opts.storage ?? {};
  const writes: { table: string; op: string; row?: any; patch?: any; n?: number }[] = [];
  const db: any = {
    writes, tables,
    from(table: string) {
      const st: any = { op: "select", filters: [] as ((r: Row) => boolean)[], orders: [] as [string, boolean][], limit: null, head: false, returning: false };
      const run = async (): Promise<any> => {
        if (st.op === "select") {
          if (opts.failRead?.includes(table)) return { data: null, error: { message: `${table} read failed` } };
          let rows = (tables[table] ?? []).filter((r) => st.filters.every((f: any) => f(r)));
          rows = rows.slice();
          for (const [k, asc] of [...st.orders].reverse()) rows.sort((a, b) => cmp(a[k], b[k]) * (asc ? 1 : -1));
          if (st.limit != null) rows = rows.slice(0, st.limit);
          if (st.head) return { data: null, error: null, count: rows.length };
          return { data: rows, error: null };
        }
        if (opts.failWrite?.includes(table)) return { data: null, error: { message: `${table} write failed` } };
        if (st.op === "insert") {
          const rows = (Array.isArray(st.row) ? st.row : [st.row]).map((r: Row) => ({ ...r }));
          tables[table] = (tables[table] ?? []).concat(rows);
          writes.push({ table, op: "insert", row: st.row });
          return { data: st.returning ? rows : null, error: null };
        }
        const hit = (tables[table] ?? []).filter((r) => st.filters.every((f: any) => f(r)));
        for (const r of hit) Object.assign(r, st.patch);
        writes.push({ table, op: "update", patch: st.patch, n: hit.length });
        return { data: st.returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
      };
      const q: any = {
        select(_c?: string, o?: any) { if (st.op === "select") { if (o?.head) st.head = true; } else st.returning = true; return q; },
        eq(k: string, v: any) { st.filters.push((r: Row) => r[k] === v); return q; },
        neq(k: string, v: any) { st.filters.push((r: Row) => r[k] !== v); return q; },
        is(k: string, v: any) { st.filters.push((r: Row) => (r[k] ?? null) === v); return q; },
        in(k: string, vs: any[]) { st.filters.push((r: Row) => vs.includes(r[k])); return q; },
        not(k: string, op: string, v: any) { assert.equal(op, "is"); st.filters.push((r: Row) => (r[k] ?? null) !== v); return q; },
        or(expr: string) { st.filters.push(orFilter(expr)); return q; },
        order(k: string, o?: any) { st.orders.push([k, o?.ascending !== false]); return q; },
        limit(n: number) { st.limit = n; return q; },
        insert(row: any) { st.op = "insert"; st.row = row; return q; },
        update(patch: any) { st.op = "update"; st.patch = patch; return q; },
        maybeSingle: async () => {
          const out = await run();
          if (out.error) return out;
          if ((out.data ?? []).length > 1) return { data: null, error: { message: "multiple rows for maybeSingle" } };
          return { data: out.data?.[0] ?? null, error: null };
        },
        then(res: any, rej: any) { return run().then(res, rej); },
      };
      return q;
    },
    storage: {
      from(_bucket: string) {
        return {
          list: async (folder: string, o?: any) => ({
            data: Object.keys(storage)
              .filter((p) => p.startsWith(folder + "/") && p.slice(folder.length + 1).includes(o?.search ?? ""))
              .map((p) => ({ name: p.slice(folder.length + 1) })),
            error: null,
          }),
          download: async (path: string) => storage[path]
            ? { data: { arrayBuffer: async () => storage[path].slice().buffer }, error: null }
            : { data: null, error: { message: "object not found" } },
        };
      },
    },
  };
  return db;
}

// ---- fixtures (ids are hex so matterRowsFilter keeps them intact) ----
const FIRM = "f001";
const L = "1ead0001";
const bytes = (s: string) => new TextEncoder().encode(s);
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const camp = (id: string, o: Row = {}): Row => ({
  id, firm_id: FIRM, name: `Campaign ${id}`, firm_email: `intake-${id}@firm.test`, firm_cc: null, firm_reply_to: null,
  firm_subject_tpl: null, firm_body_tpl: null, firm_delivery_on: true,
  attach_intake_pdf: false, attach_intake_csv: false, attach_retainer: true, attach_certificate: true, ...o,
});
const claimRow = (id: string, campaignId: string | null, o: Row = {}): Row => ({
  id, lead_id: L, firm_id: FIRM, campaign_id: campaignId, campaign: campaignId ? `Campaign ${campaignId}` : null,
  claim_type: "mva", status: "signed_grievous", answers: {}, created_at: `2026-09-0${id.length}T00:00:00Z`,
  firm_sent_at: null, firm_send_result: null, ...o,
});
const leadRow = (o: Row = {}): Row => ({
  id: L, firm_id: FIRM, campaign_id: "ca01", campaign: "Campaign ca01", claimant_name: "Pat Doe", lead_no: "TMP-1",
  case_type: "mva", external_id: null, firm_sent_at: null, firm_send_result: null, ...o,
});
// A completed DocuSeal agreement plus its stored primary and certificate.
function agreement(id: string, sub: string, o: Row = {}): { row: Row; files: Record<string, Uint8Array> } {
  const row: Row = {
    id, lead_id: L, firm_id: FIRM, claim_id: null, campaign_id: "ca01", pax_index: null, status: "completed", voided_at: null,
    submission_id: sub, template_key: "tmp_mva", doc_count: 1,
    completed_pdf_path: `${FIRM}/signed-ds-${sub}.pdf`, cert_pdf_path: `${FIRM}/cert-ds-${sub}.pdf`,
    created_at: "2026-09-01T00:00:00Z", ...o,
  };
  return { row, files: { [`${FIRM}/signed-ds-${sub}.pdf`]: bytes(`primary ${sub}`), [`${FIRM}/cert-ds-${sub}.pdf`]: bytes(`cert ${sub}`) } };
}
function world(p: { lead?: Row; claims: Row[]; campaigns: Row[]; agreements?: { row: Row; files: Record<string, Uint8Array> }[]; extra?: Record<string, Row[]>; failRead?: string[]; failWrite?: string[] }) {
  const storage: Record<string, Uint8Array> = {};
  for (const a of p.agreements ?? []) Object.assign(storage, a.files);
  return fakeDb({
    leads: [p.lead ?? leadRow()], claims: p.claims, campaigns: p.campaigns,
    esign_submissions: (p.agreements ?? []).map((a) => a.row), signable_documents: [], retainers: [], firm_deliveries: [],
    ...(p.extra ?? {}),
  }, { storage, failRead: p.failRead, failWrite: p.failWrite });
}
function deps(db: any, o: Partial<DeliverDeps> = {}): DeliverDeps & { sent: FirmEmail[] } {
  const sent: FirmEmail[] = [];
  return {
    db, sent,
    sendEmail: async (m) => { sent.push(m); return { ok: true }; },
    audit: async () => {},
    loadBundle: async () => { throw new Error("intake not expected in this test"); },
    now: () => "2026-09-28T12:00:00.000Z",
    ...o,
  };
}
const retainerOf = (m: FirmEmail) => m.attachments.find((a) => /_retainer_signed\.pdf$/.test(a.filename))?.content;

(async () => {
  await t("two matters on one file deliver independently; the first's sent guard never blocks the second", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1", campaign_id: "ca01" });
    const b = agreement("e2", "5002", { claim_id: "bbb2", campaign_id: "cb02" });
    const db = world({ claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "cb02")], campaigns: [camp("ca01"), camp("cb02")], agreements: [a, b] });
    const d = deps(db);
    const r1 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r1.ok && !r1.skipped, JSON.stringify(r1));
    assert.equal(r1.claimId, "aaa1");
    assert.equal(d.sent[0].to[0], "intake-ca01@firm.test");
    assert.equal(retainerOf(d.sent[0]), b64(bytes("primary 5001")));
    const cA = db.tables.claims.find((c: Row) => c.id === "aaa1");
    const cB = db.tables.claims.find((c: Row) => c.id === "bbb2");
    assert.equal(cA.firm_sent_at, "2026-09-28T12:00:00.000Z");
    assert.equal(cA.firm_send_result, "sent");
    assert.equal(cB.firm_sent_at, null);
    assert.equal(db.tables.leads[0].firm_sent_at, "2026-09-28T12:00:00.000Z", "the file-level echo is still written");

    const r2 = await deliverLeadToFirm({ leadId: L, claimId: "bbb2", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r2.ok && !r2.skipped, JSON.stringify(r2));
    assert.equal(d.sent[1].to[0], "intake-cb02@firm.test");
    assert.equal(retainerOf(d.sent[1]), b64(bytes("primary 5002")), "B's own agreement, not A's");
    assert.equal(cB.firm_sent_at, "2026-09-28T12:00:00.000Z");
    assert.deepEqual(db.tables.firm_deliveries.map((x: Row) => [x.claim_id, x.campaign_id, x.ok]), [["aaa1", "ca01", true], ["bbb2", "cb02", true]]);

    const r3 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r3.ok && r3.skipped, "A itself is guarded");
    assert.equal(d.sent.length, 2);
  });

  await t("a file with several matters and none named refuses; nothing is written or sent", async () => {
    const db = world({ lead: leadRow({ campaign_id: "cc03" }), claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "cb02")], campaigns: [camp("ca01"), camp("cb02")] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, triggeredBy: "automation", actorName: "Automation" }, d);
    assert.equal(r.ok, false);
    assert.equal(r.ambiguous, true);
    assert.match(r.error!, /more than one matter/);
    assert.match(r.error!, /Nothing was emailed/);
    assert.equal(d.sent.length, 0);
    assert.equal(db.writes.length, 0);
    // Two matters on the SAME campaign as the file is just as ambiguous.
    const db2 = world({ claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "ca01")], campaigns: [camp("ca01")] });
    const r2 = await deliverLeadToFirm({ leadId: L, triggeredBy: "manual", actorName: "QA" }, deps(db2));
    assert.ok(!r2.ok && r2.ambiguous);
  });

  await t("a named claim of another file refuses", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01"), { ...claimRow("ccc3", "ca01"), lead_id: "1ead0002" }], campaigns: [camp("ca01")] });
    const r = await deliverLeadToFirm({ leadId: L, claimId: "ccc3", triggeredBy: "manual", actorName: "QA" }, deps(db));
    assert.ok(!r.ok);
    assert.match(r.error!, /does not belong to this file/);
  });

  await t("a voided newest agreement is skipped for the older completed one", async () => {
    const old = agreement("e1", "5001", { claim_id: "aaa1", created_at: "2026-09-01T00:00:00Z" });
    const voided = agreement("e2", "5002", { claim_id: "aaa1", status: "voided", voided_at: "2026-09-06T00:00:00Z", created_at: "2026-09-05T00:00:00Z" });
    // A row still reading completed but carrying a void stamp is voided too.
    const stamped = agreement("e3", "5003", { claim_id: "aaa1", voided_at: "2026-09-08T00:00:00Z", created_at: "2026-09-07T00:00:00Z" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [old, voided, stamped] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(retainerOf(d.sent[0]), b64(bytes("primary 5001")));
    const certs = d.sent[0].attachments.filter((x) => /certificate/.test(x.filename));
    assert.deepEqual(certs.map((x) => x.content), [b64(bytes("cert 5001"))]);
  });

  await t("only the NEWEST completed main agreement goes; passenger rows on the caller's file do not ride along", async () => {
    const older = agreement("e1", "5001", { claim_id: "aaa1", created_at: "2026-09-01T00:00:00Z" });
    const newer = agreement("e2", "5002", { claim_id: "aaa1", created_at: "2026-09-03T00:00:00Z" });
    const pax = agreement("e3", "5003", { claim_id: "aaa1", pax_index: 0, created_at: "2026-09-04T00:00:00Z" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [older, newer, pax] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(r.ok, JSON.stringify(r));
    const retainers = d.sent[0].attachments.filter((x) => /retainer_signed/.test(x.filename));
    assert.deepEqual(retainers.map((x) => x.content), [b64(bytes("primary 5002"))]);
  });

  await t("on a passenger's own file, the passenger's agreement is the one", async () => {
    const pax = agreement("e1", "5001", { claim_id: "aaa1", pax_index: 0 });
    const db = world({ lead: leadRow({ external_id: "0a0b0c0d-0000-4000-8000-000000000001:pax:k1" }), claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [pax] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(retainerOf(d.sent[0]), b64(bytes("primary 5001")));
  });

  await t("a sibling's agreement never fills this matter's packet", async () => {
    const sib = agreement("e1", "5001", { claim_id: "bbb2", campaign_id: "ca01" });
    const db = world({ claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "ca01")], campaigns: [camp("ca01")], agreements: [sib] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(!r.ok);
    assert.match(r.error!, /No signed agreement is stored for this matter/);
    assert.equal(d.sent.length, 0);
    const cA = db.tables.claims.find((c: Row) => c.id === "aaa1");
    assert.match(cA.firm_send_result, /^error: No signed agreement/);
    assert.equal(db.tables.firm_deliveries[0].claim_id, "aaa1");
    assert.equal(db.tables.firm_deliveries[0].ok, false);
  });

  await t("configured intake PDF with no intake bundle refuses (no partial packet)", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01", { attach_intake_pdf: true })], agreements: [a] });
    const d = deps(db, { loadBundle: async () => null });
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA", force: true }, d);
    assert.equal(r.ok, false);
    assert.match(r.error!, /intake/);
    assert.match(r.error!, /Nothing was emailed/);
    assert.equal(d.sent.length, 0);
    const c = db.tables.claims[0];
    assert.equal(c.firm_sent_at, null);
    assert.match(c.firm_send_result, /^error: /);
    assert.match(db.tables.leads[0].firm_send_result, /^error: /);
    assert.equal(db.tables.firm_deliveries[0].claim_id, "aaa1");
  });

  await t("configured intake CSV that fails to load or build refuses too", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01", { attach_intake_csv: true })], agreements: [a] });
    const d = deps(db, { loadBundle: async () => { throw new Error("claims read failed"); } });
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(!r.ok);
    assert.match(r.error!, /claims read failed/);
    assert.equal(d.sent.length, 0);
    const d2 = deps(world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01", { attach_intake_csv: true })], agreements: [a] }), {
      loadBundle: async () => ({ lead: {}, claim: {}, answers: {}, caseType: "mva", fields: [] }),
    });
    const r2 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d2);
    assert.ok(!r2.ok);
    assert.match(r2.error!, /no intake questions/);
  });

  await t("the campaign master switch is read from the CLAIM's campaign, not the file's", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1", campaign_id: "cb02" });
    // File on ca01 (switch ON), matter on cb02 (switch OFF): auto skips.
    const db = world({ lead: leadRow({ campaign_id: "ca01" }), claims: [claimRow("aaa1", "cb02")], campaigns: [camp("ca01"), camp("cb02", { firm_delivery_on: false })], agreements: [a] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r.ok && r.skipped, JSON.stringify(r));
    assert.match(r.skipped!, /Automatic delivery is off/);
    assert.equal(d.sent.length, 0);
    // Inverse: file on cb02 (OFF), matter on ca01 (ON): auto sends, to ca01's firm email.
    const a2 = agreement("e1", "5001", { claim_id: "aaa1", campaign_id: "ca01" });
    const db2 = world({ lead: leadRow({ campaign_id: "cb02" }), claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01"), camp("cb02", { firm_delivery_on: false, firm_email: "wrong@firm.test" })], agreements: [a2] });
    const d2 = deps(db2);
    const r2 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d2);
    assert.ok(r2.ok && !r2.skipped, JSON.stringify(r2));
    assert.equal(d2.sent[0].to[0], "intake-ca01@firm.test");
    assert.equal(db2.tables.firm_deliveries[0].campaign_id, "ca01");
  });

  await t("a campaign-less claim uses the file's campaign only as the sole matter", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1" });
    const sole = world({ claims: [claimRow("aaa1", null)], campaigns: [camp("ca01")], agreements: [a] });
    const d = deps(sole);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r.ok && !r.skipped, JSON.stringify(r));
    assert.equal(d.sent[0].to[0], "intake-ca01@firm.test");
    const multi = world({ claims: [claimRow("aaa1", null), claimRow("bbb2", "cb02")], campaigns: [camp("ca01"), camp("cb02")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    const d2 = deps(multi);
    const r2 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d2);
    assert.ok(r2.ok && r2.skipped, "auto stands down without a switch to read");
    assert.equal(multi.writes.length, 0);
    const r3 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d2);
    assert.ok(!r3.ok);
    assert.match(r3.error!, /has no campaign/);
    assert.equal(d2.sent.length, 0);
  });

  await t("a sole matter's legacy null-claim agreement is accepted; the same row on a multi-matter file is not", async () => {
    const legacy = agreement("e1", "5001", { claim_id: null, campaign_id: "ca01" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [legacy] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(retainerOf(d.sent[0]), b64(bytes("primary 5001")));

    const legacy2 = agreement("e1", "5001", { claim_id: null, campaign_id: "ca01" });
    const db2 = world({ claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "cb02")], campaigns: [camp("ca01"), camp("cb02")], agreements: [legacy2] });
    const d2 = deps(db2);
    const r2 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d2);
    assert.ok(!r2.ok);
    assert.match(r2.error!, /No signed agreement is stored for this matter/);
    assert.equal(d2.sent.length, 0);
    // A sole matter's legacy row from ANOTHER campaign is not its agreement either.
    const other = agreement("e1", "5001", { claim_id: null, campaign_id: "cb02" });
    const db3 = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [other] });
    const r3 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, deps(db3));
    assert.ok(!r3.ok);
  });

  await t("legacy SignWell retainers follow the same matter rule (explicit retainers.claim_id on a multi-matter file)", async () => {
    const sd = (id: string, retainer: string | null) => ({ id, lead_id: L, status: "signed", packet_seq: 1, title: "Retainer", retainer_id: retainer, completed_pdf_path: `${FIRM}/signed-${id}.pdf` });
    const storage = { [`${FIRM}/signed-ab01.pdf`]: bytes("legacy mine"), [`${FIRM}/signed-ab02.pdf`]: bytes("legacy sibling") };
    const db = fakeDb({
      leads: [leadRow()], claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "cb02")], campaigns: [camp("ca01", { attach_certificate: false })],
      esign_submissions: [], firm_deliveries: [],
      signable_documents: [sd("ab01", "cafe01"), sd("ab02", "cafe02"), sd("ab03", null)],
      retainers: [{ id: "cafe01", claim_id: "aaa1" }, { id: "cafe02", claim_id: "bbb2" }],
    }, { storage });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(r.ok, JSON.stringify(r));
    const ret = d.sent[0].attachments.filter((x) => /_signed\.pdf$/.test(x.filename));
    assert.deepEqual(ret.map((x) => x.content), [b64(bytes("legacy mine"))]);
  });

  await t("exact manifest stays strict: a two-PDF packet with one stored refuses, even forced", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1", doc_count: 2 });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [a] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA", force: true }, d);
    assert.ok(!r.ok);
    assert.match(r.error!, /signed packet is not complete/);
    assert.equal(d.sent.length, 0);
    // A missing certificate object refuses as well.
    const b = agreement("e1", "5001", { claim_id: "aaa1" });
    delete b.files[`${FIRM}/cert-ds-5001.pdf`];
    const d2 = deps(world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [b] }));
    const r2 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d2);
    assert.ok(!r2.ok);
    assert.match(r2.error!, /certificate/);
  });

  await t("a campaign of another firm never receives this file", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01", { firm_id: "f999" })], agreements: [a] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(!r.ok);
    assert.match(r.error!, /different firm/);
    assert.equal(d.sent.length, 0);
    assert.equal(db.tables.firm_deliveries[0].to_email, null, "the other firm's address is never recorded as a recipient");
  });

  await t("reads that fail refuse instead of reading as 'nothing there'", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [a], failRead: ["esign_submissions"] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(!r.ok);
    assert.match(r.error!, /Could not read this matter's signed agreement/);
    assert.equal(d.sent.length, 0);
  });

  await t("a sent email whose guard write fails says so (never a quiet success)", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [a], failWrite: ["claims"] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(r.ok);
    assert.match(r.warning!, /this matter's delivery record did not save/);
    // A failed email is a failed result, recorded on the matter.
    const db2 = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    const d2 = deps(db2, { sendEmail: async () => ({ ok: false, error: "provider said no" }) });
    const r2 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d2);
    assert.ok(!r2.ok);
    assert.match(r2.error!, /provider said no/);
    assert.equal(db2.tables.claims[0].firm_sent_at, null);
    assert.equal(db2.tables.claims[0].firm_send_result, "error: provider said no");
  });

  await t("sent state: file-level stamp from before per-matter tracking counts for the sole matter only", async () => {
    const soleDb = world({ lead: leadRow({ firm_sent_at: "2026-08-01T00:00:00Z", firm_send_result: "sent" }), claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")] });
    const d = deps(soleDb);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r.ok && r.skipped, "an old single-matter delivery is not repeated");
    // Several matters: the old log names ca01, so ca01's matter is guarded and cb02's is not.
    const lead = leadRow({ firm_sent_at: "2026-08-01T00:00:00Z", firm_send_result: "sent" });
    const multi = world({
      lead, claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "cb02")], campaigns: [camp("ca01"), camp("cb02")],
      extra: { firm_deliveries: [{ id: "d1", lead_id: L, claim_id: null, campaign_id: "ca01", ok: true, created_at: "2026-08-01T00:00:00Z" }] },
    });
    const claimsOf = (id: string) => multi.tables.claims.find((c: Row) => c.id === id);
    const sA = await matterSendState(multi, lead as any, { claim: claimsOf("aaa1"), sole: false });
    const sB = await matterSendState(multi, lead as any, { claim: claimsOf("bbb2"), sole: false });
    assert.ok(sA.ok && sA.state.sentAt && sA.state.legacy);
    assert.ok(sB.ok && sB.state.sentAt === null);
  });

  await t("loadIntakeBundle renders THAT claim's answers and campaign form, not the first claim's", async () => {
    const db = fakeDb({
      leads: [leadRow()],
      claims: [
        claimRow("aaa1", "ca01", { answers: { wreck_city: "Reno" }, created_at: "2026-09-01T00:00:00Z" }),
        claimRow("bbb2", "cb02", { answers: { wreck_city: "Boise" }, created_at: "2026-09-02T00:00:00Z" }),
      ],
      intake_forms: [
        { campaign_id: "cb02", status: "published", version: 1, fields: [{ id: "wreck_city", kind: "text", label: "Crash city" }] },
      ],
    });
    const b = await loadIntakeBundle(db, L, "bbb2");
    assert.ok(b);
    assert.equal(b!.claim.id, "bbb2");
    assert.equal(b!.answers.wreck_city, "Boise");
    const csv = buildIntakeCsvSingle(b!);
    assert.match(csv, /"Crash city"/);
    assert.match(csv, /"Boise"/);
    assert.doesNotMatch(csv, /Reno/);
    assert.match(csv, /"Campaign cb02"/, "the CSV names the claim's campaign");
    assert.equal(await loadIntakeBundle(db, L, "ffff9"), null, "an unknown claim is no bundle");
    const bad = fakeDb({ leads: [leadRow()], claims: [] }, { failRead: ["claims"] });
    await assert.rejects(() => loadIntakeBundle(bad, L, "aaa1"), /Could not read the matter/);
  });

  await t("end to end: the matter's intake PDF and CSV ride with its agreement", async () => {
    const a = agreement("e1", "5001", { claim_id: "bbb2", campaign_id: "cb02" });
    const storage = { ...a.files };
    const db = fakeDb({
      leads: [leadRow()],
      claims: [claimRow("aaa1", "ca01", { answers: { wreck_city: "Reno" } }), claimRow("bbb2", "cb02", { answers: { wreck_city: "Boise" } })],
      campaigns: [camp("ca01"), camp("cb02", { attach_intake_pdf: true, attach_intake_csv: true })],
      esign_submissions: [a.row], signable_documents: [], retainers: [], firm_deliveries: [],
      intake_forms: [{ campaign_id: "cb02", status: "published", version: 1, fields: [{ id: "wreck_city", kind: "text", label: "Crash city" }] }],
    }, { storage });
    const d = deps(db, { loadBundle: loadIntakeBundle });
    const r = await deliverLeadToFirm({ leadId: L, claimId: "bbb2", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(r.ok, JSON.stringify(r));
    const kinds = d.sent[0].attachments.map((x) => x.filename.replace(/^Pat_Doe_/, ""));
    assert.deepEqual(kinds, ["intake.pdf", "intake.csv", "retainer_signed.pdf", "signing_certificate.pdf"]);
    const csv = Buffer.from(d.sent[0].attachments[1].content, "base64").toString("utf8");
    assert.match(csv, /Boise/);
    assert.doesNotMatch(csv, /Reno/);
  });

  console.log(`${pass} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
