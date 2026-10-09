// npx tsx src/lib/firm-delivery.test.ts
// Claim-specific firm delivery (Astra round 7b #57), against a fake Supabase
// client: tables, PostgREST filters (including the `or` strings that
// matterRowsFilter emits) and the signed-docs bucket. Nothing touches a
// network, provider or database.
import assert from "node:assert/strict";
import { deliverLeadToFirm, matterSendState, type FirmEmail, type DeliverDeps } from "./firm-delivery";
import { loadIntakeBundle, buildIntakeCsvSingle } from "./intake-render";
import { netflyPacketReview } from './netfly-packet';
import { rehearsalKey } from './mva-call/rehearsal';
import { OWNER_SENT_UNKNOWN_DATE } from './owner-file-confirmation';

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
    // Model the SQL reservation contract; actual SQL is verified separately.
    rpc: async (name: string, p: any) => {
      const rows = tables.firm_delivery_dispatch ??= [];
      const c = (tables.claims ?? []).find((r) => r.id === p.p_claim_id);
      const d = rows.find((r) => r.claim_id === p.p_claim_id);
      if (name === "begin_firm_delivery") {
        if (!c || c.lead_id !== p.p_lead_id) return { error: { message: "matter mismatch" }, data: null };
        const lead = tables.leads.find((r) => r.id === p.p_lead_id);
        if (!lead || lead.archived_at || lead.firm_id !== p.p_firm_id || (c.firm_id ?? lead.firm_id) !== p.p_firm_id || (c.campaign_id ?? lead.campaign_id) !== p.p_campaign_id) return { error: { message: "The firm or campaign changed while preparing delivery" }, data: null };
        if (d && ["sending", "uncertain"].includes(d.state)) return { data: { state: "blocked", attempt_key: d.attempt_key }, error: null };
        if (!p.p_force && (c.firm_sent_at || d?.state === "sent")) return { data: { state: "sent" }, error: null };
        const next = { claim_id: c.id, lead_id: c.lead_id, state: "sending", attempt_key: `attempt-${writes.length}-${Math.random()}` };
        if (d) Object.assign(d, next); else rows.push(next);
        return { data: { state: "acquired", attempt_key: next.attempt_key }, error: null };
      }
      if (name === "finish_firm_delivery") {
        if (opts.failWrite?.includes("claims")) return { data: null, error: { message: "claims write failed" } };
        if (!d || d.attempt_key !== p.p_attempt_key || d.state !== "sending") return { data: false, error: null };
        d.state = p.p_state;
        return { data: true, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
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
        eq(k: string, v: any) { st.filters.push((r: Row) => k === "audit->emergency->>claim_id" ? r.audit?.emergency?.claim_id === v : r[k] === v); return q; },
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
  claim_type: "mva", status: "signed_approved", answers: {}, created_at: `2026-09-0${id.length}T00:00:00Z`,
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
    agent_reviewed_at: "2026-09-01T01:00:00Z", agent_reviewed_by: "agent-1",
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
    qa_reviews: p.claims.map((c) => ({ lead_id: c.lead_id, claim_id: c.id, decision: "approve", created_at: "2026-09-28T11:00:00Z" })),
    ...(p.extra ?? {}),
  }, { storage, failRead: p.failRead, failWrite: p.failWrite });
}
function deps(db: any, o: Partial<DeliverDeps> = {}): DeliverDeps & { sent: FirmEmail[] } {
  const sent: FirmEmail[] = [];
  return {
    db, sent,
    sendEmail: async (m) => { sent.push(m); return { ok: true }; },
    audit: async () => {},
    loadBundle: async (_db, leadId, claimId) => ({
      lead: db.tables.leads.find((r: Row) => r.id === leadId),
      claim: db.tables.claims.find((r: Row) => r.id === claimId),
      answers: { account: "Answered" }, caseType: "test",
      fields: [{ id: "account", kind: "text", label: "What happened?" }],
    }),
    now: () => "2026-09-28T12:00:00.000Z",
    ...o,
  };
}
const retainerOf = (m: FirmEmail) => m.attachments.find((a) => /_retainer_signed\.pdf$/.test(a.filename))?.content;

(async () => {
  await t('declined signed file refuses delivery without modifying prior delivery evidence', async () => {
    const db = world({ claims:[claimRow('aaa1','ca01',{status:'signed_dropped',firm_sent_at:'2026-10-01',firm_send_result:'sent'})], campaigns:[camp('ca01')] });
    const d = deps(db), r = await deliverLeadToFirm({ leadId:L,claimId:'aaa1',triggeredBy:'manual',force:true },d);
    assert.equal(r.ok,false);assert.match(r.error || '',/declined/);assert.equal(d.sent.length,0);assert.equal(db.writes.length,0);
  });
  await t('newer decline is never reopened by completion of an in-flight delivery', async () => {
    const c=claimRow('aaa1','ca01'), db=world({claims:[c],campaigns:[camp('ca01')],agreements:[agreement('a','5001',{claim_id:'aaa1'})]});
    const d=deps(db,{sendEmail:async()=>{ c.status='signed_dropped';return {ok:true}; }});
    const r=await deliverLeadToFirm({leadId:L,claimId:'aaa1',triggeredBy:'manual'},d);
    assert.equal(r.ok,true);assert.equal(c.status,'signed_dropped');assert.ok(c.firm_sent_at);assert.equal(db.tables.firm_deliveries.length,1);
  });
  await t('owner-confirmed historical delivery with no date does not resend or start a clock', async () => {
    const db = world({ claims: [claimRow('c001', 'ca01', { status: 'delivered', firm_send_result: OWNER_SENT_UNKNOWN_DATE })], campaigns: [camp('ca01')] });
    const d = deps(db);
    const result = await deliverLeadToFirm({ leadId: L, claimId: 'c001', triggeredBy: 'manual' }, d);
    assert.equal(result.skipped, 'This matter was already sent to the firm.');
    assert.equal(d.sent.length, 0); assert.equal(db.writes.length, 0);
    assert.equal(db.tables.claims[0].firm_sent_at, null);
  });
  await t('nonbinding rehearsal keeps normal packet checks and restricts every recipient', async () => {
    for (const mode of ['allowed', 'unapproved-cc', 'automatic', 'unreadable', 'missing-designation']) {
      const config = { version: 1, phone: '+12025550100', emails: ['intake-ca01@firm.test', 'copy@example.test'] };
      const db = world({ lead: leadRow({ source_key: 'test_lead', claimant_name: 'TEST Driver', vendor_fields: { signing_rehearsal: config } }),
        claims: [claimRow('aaa1', 'ca01')], campaigns: [camp('ca01', { firm_cc: mode === 'unapproved-cc' ? 'unapproved@example.test' : 'copy@example.test' })],
        agreements: [agreement('e1', '5001', { claim_id: 'aaa1' })],
        extra: { esign_templates: mode === 'missing-designation' ? [] : [{ key: rehearsalKey(L), firm_id: FIRM, campaign_id: 'ca01', provider: 'docuseal' }] },
        failRead: mode === 'unreadable' ? ['esign_templates'] : [],
      });
      const d = deps(db);
      const result = await deliverLeadToFirm({ leadId: L, claimId: 'aaa1', triggeredBy: mode === 'automatic' ? 'auto' : 'manual' }, d);
      assert.equal(result.ok, mode === 'allowed', `${mode}: ${result.error}`);
      assert.equal(d.sent.length, mode === 'allowed' ? 1 : 0, mode);
    }
  });
  const netflyWorld = () => {
    const campaign = camp('ca01', { name: 'NETFLY ONTAKE', path: 'secondary', esign_required: false });
    const lead = leadRow();
    const original = { id: 'nf-doc', firm_id: FIRM, lead_id: L, claim_id: 'aaa1', doc_type: 'netfly_signed_retainer', file_name: 'NETFLY signed original.pdf', storage_path: `${FIRM}/${L}/netfly-original.pdf`, created_at: '2026-10-02T10:00:00Z' };
    const claim = claimRow('aaa1', 'ca01', { campaign: 'NETFLY ONTAKE', status: 'new', answers: { netfly_secondary: {
      fields: { incident_story: 'Synthetic rear-end case', accident_date: '2026-09-04' }, handoffs: [{ note: 'Client/Driver: Pat Doe\nAccident Date: 09/04/2026' }],
      handoff_verification: { status: 'matches', source_revision: 1 },
      call_close: { closeout_version: 2, source_revision: 1, completion: 'complete', disposition: 'appears_qualified', callback_promised_24_48_hours: true },
      review: { status: 'retainer_reviewed', retainer_reviewed_document_id: original.id },
    } } });
    const db = fakeDb({ leads: [lead], claims: [claim], campaigns: [campaign], case_documents: [original], esign_submissions: [], signable_documents: [], retainers: [], qa_reviews: [], firm_deliveries: [], app_users: [{ role: 'owner', active: true, email: 'bmc@innovativeintake.com' }] },
      { storage: { [original.storage_path]: bytes('%PDF-1.7\n' + 'SYNTHETIC ORIGINAL '.repeat(15) + '\n%%EOF') } });
    return { db, lead, claim, campaign, original };
  };
  await t('NETFLY agent packet uses its reviewed original and intake, copies Brett, and sends only once', async () => {
    const w = netflyWorld(), d = deps(w.db);
    const preview = await netflyPacketReview(w.db, w.lead, w.claim, w.campaign);
    assert.deepEqual(preview.errors, []);
    const options = { leadId: L, claimId: 'aaa1', triggeredBy: 'manual' as const, includeOwner: true, netflySnapshot: preview.snapshot };
    const result = await deliverLeadToFirm(options, d);
    assert.equal(result.ok, true, result.error); assert.equal(d.sent.length, 1);
    assert.deepEqual(d.sent[0].cc, ['bmc@innovativeintake.com']);
    assert(d.sent[0].attachments.some(a => /intake.pdf$/.test(a.filename)));
    assert(d.sent[0].attachments.some(a => /NETFLY_signed/.test(a.filename)));
    assert.equal(w.claim.status, 'delivered'); assert(w.claim.firm_sent_at);
    assert((await deliverLeadToFirm(options, d)).skipped); assert.equal(d.sent.length, 1);
  });
  await t('NETFLY refuses stale review, incomplete calls, missing or foreign PDFs and generic bypass', async () => {
    for (const mutate of [
      (w: any) => { w.claim.answers.netfly_secondary.review.retainer_reviewed_document_id = ''; },
      (w: any) => { w.claim.answers.netfly_secondary.review.status = 'needs_supervisor'; },
      (w: any) => { w.db.tables.esign_submissions.push({ id: 'new-packet', firm_id: FIRM, lead_id: L, claim_id: 'aaa1', campaign_id: 'ca01', status: 'completed' }); },
      (w: any) => { w.claim.answers.netfly_secondary.call_close.completion = 'incomplete'; },
      (w: any) => { w.original.claim_id = 'another-claim'; },
      (w: any) => { w.claim.answers.netfly_secondary.fields.wants_cancel = 'Yes'; },
    ]) {
      const w = netflyWorld(); mutate(w); const d = deps(w.db), preview = await netflyPacketReview(w.db, w.lead, w.claim, w.campaign);
      const result = await deliverLeadToFirm({ leadId: L, claimId: 'aaa1', triggeredBy: 'manual', includeOwner: true, netflySnapshot: preview.snapshot }, d);
      assert.equal(result.ok, false); assert.equal(d.sent.length, 0);
    }
    const w = netflyWorld(), d = deps(w.db), preview = await netflyPacketReview(w.db, w.lead, w.claim, w.campaign);
    w.claim.answers.netfly_secondary.fields.incident_story = 'Changed after preview';
    assert.equal((await deliverLeadToFirm({ leadId: L, claimId: 'aaa1', triggeredBy: 'manual', includeOwner: true, netflySnapshot: preview.snapshot }, d)).ok, false);
    assert.equal((await deliverLeadToFirm({ leadId: L, claimId: 'aaa1', triggeredBy: 'manual' }, d)).ok, false);
    assert.equal(d.sent.length, 0);
  });
  await t('NETFLY rechecks an answer changed while assembling its PDF before provider send', async () => {
    const w = netflyWorld(), d = deps(w.db), loader = d.loadBundle!;
    const preview = await netflyPacketReview(w.db, w.lead, w.claim, w.campaign);
    d.loadBundle = async (...args) => { const bundle = await loader(...args); w.claim.answers.netfly_secondary.fields.police_report = 'CHANGED'; return bundle; };
    const result = await deliverLeadToFirm({ leadId: L, claimId: 'aaa1', triggeredBy: 'manual', includeOwner: true, netflySnapshot: preview.snapshot }, d);
    assert.equal(result.ok, false); assert.match(result.error || '', /changed while/); assert.equal(d.sent.length, 0);
  });
  await t("MVA handoff refuses a signed file before QA approval", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01", { status: "signed_qa" })], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /not passed signed-file QA/);
    assert.equal(d.sent.length, 0);
  });
  await t("MVA handoff refuses missing or superseded QA approval", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    const d = deps(db);
    db.tables.qa_reviews = [];
    const missing = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(missing.ok, false);
    assert.match(missing.error ?? "", /no current QA approval/);
    db.tables.qa_reviews = [
      { claim_id: "aaa1", decision: "approve", created_at: "2026-09-28T11:00:00Z" },
      { claim_id: "aaa1", decision: "wip", created_at: "2026-09-29T11:00:00Z" },
    ];
    const superseded = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(superseded.ok, false);
    assert.match(superseded.error ?? "", /no current QA approval/);
    assert.equal(d.sent.length, 0);
  });
  await t("a completed packet without agent review cannot reach the firm", async () => {
    const a = agreement("unreviewed", "4999", { claim_id: "aaa1", agent_reviewed_at: null });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [a] });
    const d = deps(db);
    const result = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d);
    assert.equal(result.ok, false);
    assert.match(result.error || "", /agent must review/i);
    assert.equal(d.sent.length, 0);
  });
  await t("two matters on one file deliver independently; the first's sent guard never blocks the second", async () => {
    const a = agreement("e1", "5001", { claim_id: "aaa1", campaign_id: "ca01" });
    const b = agreement("e2", "5002", { claim_id: "bbb2", campaign_id: "cb02" });
    const db = world({ claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "cb02")], campaigns: [camp("ca01"), camp("cb02")], agreements: [a, b] });
    const d = deps(db);
    const r1 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r1.ok && !r1.skipped, JSON.stringify(r1));
    assert.equal(r1.claimId, "aaa1");
    assert.equal(d.sent[0].to[0], "intake-ca01@firm.test");
    assert.match(d.sent[0].html, /Intake questions and answers/);
    assert.match(d.sent[0].html, /What happened\?/);
    assert.match(d.sent[0].html, /Answered/);
    assert.equal(retainerOf(d.sent[0]), b64(bytes("primary 5001")));
    const cA = db.tables.claims.find((c: Row) => c.id === "aaa1");
    const cB = db.tables.claims.find((c: Row) => c.id === "bbb2");
    assert.equal(cA.firm_sent_at, "2026-09-28T12:00:00.000Z");
    assert.equal(cA.firm_send_result, "sent");
    assert.equal(cA.status, "delivered", "successful MVA handoff advances the matter status");
    assert.equal(cB.firm_sent_at, null);
    assert.equal(db.tables.leads[0].firm_sent_at, "2026-09-28T12:00:00.000Z", "the file-level echo is still written");

    const r2 = await deliverLeadToFirm({ leadId: L, claimId: "bbb2", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r2.ok && !r2.skipped, JSON.stringify(r2));
    assert.equal(d.sent[1].to[0], "intake-cb02@firm.test");
    assert.equal(retainerOf(d.sent[1]), b64(bytes("primary 5002")), "B's own agreement, not A's");
    assert.equal(cB.firm_sent_at, "2026-09-28T12:00:00.000Z");
    assert.equal(cB.status, "delivered");
    assert.deepEqual(db.tables.firm_deliveries.map((x: Row) => [x.claim_id, x.campaign_id, x.ok]), [["aaa1", "ca01", true], ["bbb2", "cb02", true]]);

    const r3 = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto", actorName: "QA" }, d);
    assert.ok(r3.ok && r3.skipped, "A itself is guarded");
    assert.equal(d.sent.length, 2);
  });
  await t('attorney hold stops native and NETFLY sends; releases and sibling holds are matter scoped', async()=>{
    for(const mode of ['held','released','sibling','unreadable']){
      const w=netflyWorld(),d=deps(w.db);
      w.db.tables.cr_payroll_notes=[{id:'h',firm_id:FIRM,claim_id:mode==='sibling'?'other':'aaa1',campaign_id:'ca01',kind:mode==='released'?'attorney_release':'attorney_hold',data:{reason:'Ask attorney'},created_at:'2026-10-06T12:00:00Z'}];
      if(mode==='unreadable') { const from=w.db.from.bind(w.db);w.db.from=(table:string)=>table==='cr_payroll_notes'?{select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit(){return this;},maybeSingle:async()=>({error:{message:'failed'}})}:from(table); }
      const preview=await netflyPacketReview(w.db,w.lead,w.claim,w.campaign);
      const result=await deliverLeadToFirm({leadId:L,claimId:'aaa1',triggeredBy:'manual',includeOwner:true,netflySnapshot:preview.snapshot},d);
      assert.equal(result.ok,mode==='released'||mode==='sibling',mode);assert.equal(d.sent.length,result.ok?1:0);
      if(mode==='held')assert.match(result.error||'',/Waiting on attorney/);
      if(mode==='held') {
        const native=await deliverLeadToFirm({leadId:L,claimId:'aaa1',triggeredBy:'manual'},d);
        assert.match(native.error||'',/Waiting on attorney/);assert.equal(d.sent.length,0);
      }
    }
  });
  await t("INNO delivery links to the authenticated firm inbox without an access token", async () => {
    const a = agreement("inbox", "5020", { claim_id: "aaa1", campaign_id: "ca01" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01", { name: "INNO MVA" })], agreements: [a] });
    const d = deps(db);
    const result = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(d.sent[0].html, /href="https:\/\/claimreach.com\/firm-review-login"/);
    assert.match(d.sent[0].html, /assigned firm account/);
    assert.doesNotMatch(d.sent[0].html, /firm-review-login\?/);
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

  await t("a voided current agreement never resurrects an older completed one", async () => {
    const old = agreement("e1", "5001", { claim_id: "aaa1", created_at: "2026-09-01T00:00:00Z" });
    const voided = agreement("e2", "5002", { claim_id: "aaa1", status: "voided", voided_at: "2026-09-06T00:00:00Z", created_at: "2026-09-05T00:00:00Z" });
    // A row still reading completed but carrying a void stamp is voided too.
    const stamped = agreement("e3", "5003", { claim_id: "aaa1", voided_at: "2026-09-08T00:00:00Z", created_at: "2026-09-07T00:00:00Z" });
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [old, voided, stamped] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", actorName: "QA" }, d);
    assert.ok(!r.ok, JSON.stringify(r));
    assert.match(r.error!, /voided/);
    assert.equal(d.sent.length, 0);
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

  await t("non-MVA legacy SignWell retainers follow the same matter rule (explicit retainers.claim_id on a multi-matter file)", async () => {
    const sd = (id: string, retainer: string | null) => ({ id, lead_id: L, status: "signed", packet_seq: 1, title: "Retainer", retainer_id: retainer, completed_pdf_path: `${FIRM}/signed-${id}.pdf` });
    const storage = { [`${FIRM}/signed-ab01.pdf`]: bytes("legacy mine"), [`${FIRM}/signed-ab02.pdf`]: bytes("legacy sibling") };
    const db = fakeDb({
      leads: [leadRow()], claims: [claimRow("aaa1", "ca01", { claim_type: "prem" }), claimRow("bbb2", "cb02", { claim_type: "prem" })], campaigns: [camp("ca01", { attach_certificate: false })],
      esign_submissions: [], firm_deliveries: [],
      signable_documents: [sd("ab01", "cafe01"), sd("ab02", "cafe02"), sd("ab03", null)],
      retainers: [{ id: "cafe01", lead_id: L, claim_id: "aaa1" }, { id: "cafe02", lead_id: L, claim_id: "bbb2" }],
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
    assert.match(r.error!, /Could not read the agreement/);
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
      qa_reviews: [{ lead_id: L, claim_id: "bbb2", decision: "approve", created_at: "2026-09-28T11:00:00Z" }],
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

  await t("certificate-only delivery without an agreement refuses before reservation or send", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01", { attach_retainer: false })] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, false); assert.match(r.error!, /certificate/); assert.equal(d.sent.length, 0);
    assert.equal((db.tables.firm_delivery_dispatch ?? []).length, 0);
  });

  await t("a newer unsigned current agreement blocks delivery of an old completed packet", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [
      agreement("e1", "5001", { claim_id: "aaa1" }),
      agreement("e2", "5002", { claim_id: "aaa1", status: "sent", created_at: "2026-09-20" }),
    ] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, false); assert.match(r.error!, /not complete/); assert.equal(d.sent.length, 0);
  });

  await t("non-MVA legacy packet refuses a missing second PDF or unsigned member", async () => {
    for (const secondStatus of ["signed", "sent"]) {
      const doc = (id: string, status: string, seq: number) => ({ id, lead_id: L, firm_id: FIRM, packet_group: "packet", packet_seq: seq, status, completed_pdf_path: `${FIRM}/${id}.pdf`, title: id });
      const db = fakeDb({ leads: [leadRow()], claims: [claimRow("aaa1", "ca01", { claim_type: "prem" })], campaigns: [camp("ca01", { attach_certificate: false })],
        esign_submissions: [], retainers: [], signable_documents: [doc("first", "signed", 1), doc("second", secondStatus, 2)] },
        { storage: { [`${FIRM}/first.pdf`]: bytes("first") } });
      const d = deps(db);
      const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
      assert.equal(r.ok, false); assert.equal(d.sent.length, 0);
    }
  });

  await t("simultaneous manual/auto/forced sends enter the provider only once", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    let release!: () => void; let entered!: () => void;
    const started = new Promise<void>((r) => { entered = r; });
    const held = new Promise<void>((r) => { release = r; });
    let count = 0;
    const d = deps(db, { sendEmail: async (m) => { count++; assert.match(m.idempotencyKey!, /^firm-delivery-attempt-/); entered(); await held; return { ok: true }; } });
    const one = deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    await started;
    const [two, three] = await Promise.all([
      deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "auto" }, d),
      deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", force: true }, d),
    ]);
    assert.equal(two.recoveryRequired, true); assert.equal(three.recoveryRequired, true); assert.equal(count, 1);
    release(); assert.equal((await one).ok, true);
    const intentional = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", force: true }, d);
    assert.equal(intentional.ok, true); assert.equal(count, 2);
  });

  await t("a selected non-MVA legacy certificate failure blocks the otherwise readable packet", async () => {
    const db = fakeDb({ leads: [leadRow()], claims: [claimRow("aaa1", "ca01", { claim_type: "prem" })], campaigns: [camp("ca01")],
      esign_submissions: [], retainers: [], signable_documents: [{ id: "first", lead_id: L, status: "signed", title: "Agreement", completed_pdf_path: `${FIRM}/first.pdf` }] },
      { storage: { [`${FIRM}/first.pdf`]: bytes("first") } });
    const d = deps(db, { buildCertificate: async () => { throw new Error("synthetic certificate failure"); } });
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, false); assert.match(r.error!, /synthetic certificate failure/); assert.equal(d.sent.length, 0);
  });

  await t("unknown provider result stays blocked, including forced repeat", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    let count = 0;
    const d = deps(db, { sendEmail: async () => { count++; throw new Error("synthetic timeout"); } });
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.recoveryRequired, true); assert.match(r.error!, /may have gone out/);
    const retry = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", force: true }, d);
    assert.equal(retry.recoveryRequired, true); assert.equal(count, 1);
  });

  await t("a successful email with failed final DB stamp cannot be sent again", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })], failWrite: ["claims"] });
    const d = deps(db);
    const first = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(first.ok, true); assert.equal(first.recoveryRequired, true);
    const again = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", force: true }, d);
    assert.equal(again.recoveryRequired, true); assert.equal(d.sent.length, 1);
  });

  await t("a newer provisional emergency blocks an old primary; cancelled emergency or newer primary does not", async () => {
    for (const [status, created, blocked] of [["signed", "2026-09-30", true], ["sent", "2026-09-30", true], ["cancelled", "2026-09-30", false], ["signed", "2026-01-01", false]] as const) {
      const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })],
        extra: { signable_documents: [{ id: "emergency", lead_id: L, firm_id: FIRM, audit: { emergency: { claim_id: "aaa1" } }, status, created_at: created }] } });
      const d = deps(db); const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
      assert.equal(r.ok, !blocked, JSON.stringify(r)); assert.equal(d.sent.length, blocked ? 0 : 1);
    }
  });

  await t("recipient binding changed after assembly is rejected by reservation before provider", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    const original = db.rpc;
    db.rpc = async (name: string, params: any) => { if (name === "begin_firm_delivery") db.tables.claims[0].campaign_id = "other-campaign"; return original(name, params); };
    const d = deps(db); const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, false); assert.match(r.error!, /changed while preparing/); assert.equal(d.sent.length, 0);
  });

  await t("a changed recipient after confirmation blocks a manual send", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    const d = deps(db);
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", expectedTo: "other@firm.test", expectedCc: [] }, d);
    assert.equal(r.ok, false);
    assert.match(r.error || "", /recipient changed/);
    assert.equal(d.sent.length, 0);
    assert.equal(db.tables.claims[0].status, "signed_approved");
  });

  await t("corrected PNC name cannot deliver old named primary evidence", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1", injured_name: "Incorrect Name", signer_name: "Incorrect Name" })] });
    const d = deps(db), r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, false); assert.match(r.error!, /file now names Pat Doe/); assert.equal(d.sent.length, 0);
    assert.equal(db.tables.esign_submissions[0].injured_name, "Incorrect Name");
  });

  await t("guardian signer is valid when packet injured person matches canonical PNC", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01")], agreements: [agreement("e1", "5001", { claim_id: "aaa1", injured_name: "PAT  DOE", signer_name: "Guardian Doe" })] });
    const d = deps(db), r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(d.sent.length, 1);
  });

  await t("MVA attachment switches cannot bypass current primary readiness or private packet reads", async () => {
    const cases: { label: string; patch?: Row; missing?: string; absent?: boolean; match: RegExp }[] = [
      { label: "no primary", absent: true, match: /current completed DocuSeal/ },
      { label: "unsigned", patch: { status: "sent" }, match: /not complete/ },
      { label: "voided", patch: { status: "voided" }, match: /voided/ },
      { label: "wrong person", patch: { injured_name: "Another Person" }, match: /file now names/ },
      { label: "missing primary pointer", patch: { completed_pdf_path: null }, match: /No signed agreement is stored|not complete in storage/ },
      { label: "missing primary bytes", missing: `${FIRM}/signed-ds-5001.pdf`, match: /No signed agreement is stored|not complete in storage/ },
      { label: "partial packet", patch: { doc_count: 2 }, match: /not complete in storage/ },
      { label: "missing certificate pointer", patch: { cert_pdf_path: null }, match: /certificate/ },
      { label: "missing certificate bytes", missing: `${FIRM}/cert-ds-5001.pdf`, match: /certificate/ },
      { label: "foreign storage pointer", patch: { cert_pdf_path: "f999/cert-ds-5001.pdf" }, match: /storage association/ },
    ];
    for (const c of cases) {
      const a = agreement("e1", "5001", { claim_id: "aaa1", ...c.patch });
      if (c.missing) delete a.files[c.missing];
      const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01", { attach_retainer: false, attach_certificate: false })], agreements: c.absent ? [] : [a] });
      const d = deps(db), r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual", force: true }, d);
      assert.equal(r.ok, false, c.label); assert.match(r.error!, c.match, c.label); assert.equal(d.sent.length, 0, c.label);
      assert.equal((db.tables.firm_delivery_dispatch ?? []).length, 0, c.label);
    }
  });

  await t("MVA always includes its intake and signed retainer despite disabled attachment switches", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01")], campaigns: [camp("ca01", { attach_retainer: false, attach_certificate: false, attach_intake_csv: true })], agreements: [agreement("e1", "5001", { claim_id: "aaa1" })] });
    const d = deps(db, { loadBundle: async () => ({ lead: leadRow(), claim: claimRow("aaa1", "ca01"), caseType: "mva", answers: { city: "Houston" }, fields: [{ id: "city", kind: "text", label: "City" }] }) });
    const r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(d.sent[0].attachments.some((a) => a.filename === "Pat_Doe_intake.csv"));
    assert.ok(d.sent[0].attachments.some((a) => a.filename.endsWith("_intake.pdf")));
    assert.ok(d.sent[0].attachments.some((a) => a.filename.endsWith("_signed.pdf")));
  });

  await t("MVA never substitutes a sibling or legacy-only agreement when attachments are disabled", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01"), claimRow("bbb2", "ca01")], campaigns: [camp("ca01", { attach_retainer: false, attach_certificate: false })], agreements: [agreement("e1", "5001", { claim_id: "bbb2" })], extra: { signable_documents: [{ id: "old", lead_id: L, firm_id: FIRM, status: "signed", completed_pdf_path: `${FIRM}/old.pdf` }] } });
    const d = deps(db), r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, false); assert.match(r.error!, /current completed DocuSeal/); assert.equal(d.sent.length, 0);
  });

  await t("emergency-only or superseding evidence blocks every case type with both attachment switches off", async () => {
    for (const type of ["mva", "prem"]) for (const primary of [false, true]) {
      const db = world({ claims: [claimRow("aaa1", "ca01", { claim_type: type })], campaigns: [camp("ca01", { attach_retainer: false, attach_certificate: false })], agreements: primary ? [agreement("e1", "5001", { claim_id: "aaa1" })] : [], extra: { signable_documents: [{ id: "emergency", lead_id: L, firm_id: FIRM, audit: { emergency: { claim_id: "aaa1" } }, status: "signed", created_at: "2026-09-30" }] } });
      const d = deps(db), r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
      assert.equal(r.ok, false, type); assert.match(r.error!, /provisional emergency/); assert.equal(d.sent.length, 0);
      assert.equal((db.tables.firm_delivery_dispatch ?? []).length, 0);
    }
  });

  await t("non-MVA intentional unsigned delivery remains available without an active emergency", async () => {
    const db = world({ claims: [claimRow("aaa1", "ca01", { claim_type: "prem" })], campaigns: [camp("ca01", { attach_retainer: false, attach_certificate: false })] });
    const d = deps(db), r = await deliverLeadToFirm({ leadId: L, claimId: "aaa1", triggeredBy: "manual" }, d);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(d.sent.length, 1);
  });

  await t('attorney hold added during packet assembly prevents provider send', async () => {
    const db = world({ claims: [claimRow('aaa1', 'ca01')], campaigns: [camp('ca01')], agreements: [agreement('e1', '5001', { claim_id: 'aaa1' })] });
    const d = deps(db, { loadBundle: async () => {
      db.tables.cr_payroll_notes = [{id:'late-hold',firm_id:FIRM,claim_id:'aaa1',campaign_id:'ca01',kind:'attorney_hold',created_at:'2026-10-07T12:00:00Z',data:{reason:'Attorney checking'}}];
      return {lead:leadRow(),claim:claimRow('aaa1','ca01'),caseType:'mva',answers:{city:'Houston'},fields:[{id:'city',kind:'text',label:'City'}]};
    }});
    const result = await deliverLeadToFirm({leadId:L,claimId:'aaa1',triggeredBy:'manual'},d);
    assert.equal(result.ok,false); assert.match(result.error!,/Waiting on attorney/);
    assert.equal(d.sent.length,0); assert.equal((db.tables.firm_delivery_dispatch ?? []).length,0);
  });
  console.log(`${pass} passed`);
})().catch((e) => { console.error(e); process.exit(1); });

