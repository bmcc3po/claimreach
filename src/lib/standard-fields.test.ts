// npx tsx src/lib/standard-fields.test.ts
import assert from "node:assert/strict";
import {
  STANDARD_FIELDS, STANDARD_KEYS, WRITABLE_FIELDS, MATTER_KEYS, standardFromRows, STD_LEAD_COLS,
  buildStandardRecord, eventFields, selectExportMatters, exportRows, loadStandardExport, readAll,
  exportFilterFrom, standardCsv, incidentColumns, currentAgreement,
} from "./standard-fields";
import { mapInbound, canonicalToLeadColumns, inboundCanonicalId } from "./webhooks";
import { leadPatchFromAnswers } from "./mva-call/server";

let pass = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); pass++; console.log("ok", name); };

// ---------------------------------------------------------------------------
// A small fake of the supabase query builder: filters, `or` strings (nested
// and/or as matterRowsFilter writes them), order, range, count and head, and
// a failure switch per table.
// ---------------------------------------------------------------------------
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
function orTerm(term: string): (r: any) => boolean {
  const m = term.match(/^(and|or)\((.*)\)$/);
  if (m) { const fs = splitTop(m[2]).map(orTerm); return m[1] === "and" ? (r) => fs.every((f) => f(r)) : (r) => fs.some((f) => f(r)); }
  const [col, op, ...rest] = term.split(".");
  const val = rest.join(".");
  if (op === "is" && val === "null") return (r) => (r[col] ?? null) === null;
  if (op === "eq") return (r) => r[col] != null && String(r[col]) === val;
  throw new Error(`fake db cannot read or-term ${term}`);
}
function fakeDb(tables: Record<string, any[]>, fail: Record<string, string> = {}) {
  const reads: string[] = [];
  return {
    reads,
    from(table: string) {
      const st = { filters: [] as ((r: any) => boolean)[], sorts: [] as [string, boolean][], range: null as null | [number, number], limit: Infinity, one: false, head: false, count: false };
      const run = () => {
        reads.push(table);
        if (fail[table]) return { data: null, error: { message: fail[table] }, count: null };
        let rows = (tables[table] ?? []).filter((r) => st.filters.every((f) => f(r)));
        const total = rows.length;
        rows = rows.slice().sort((a, b) => {
          for (const [k, up] of st.sorts) {
            const x = a[k] ?? null, y = b[k] ?? null;
            if (x === y) continue;
            if (x === null) return 1;
            if (y === null) return -1;
            return (String(x) < String(y) ? -1 : 1) * (up ? 1 : -1);
          }
          return 0;
        });
        if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
        rows = rows.slice(0, st.limit).map((r) => ({ ...r }));
        if (st.head) return { data: null, error: null, count: total };
        if (st.one) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null, count: st.count ? total : null };
      };
      const q: any = {
        select(_c: string, o?: any) { if (o?.head) st.head = true; if (o?.count) st.count = true; return q; },
        eq(k: string, v: any) { st.filters.push((r) => r[k] === v); return q; },
        neq(k: string, v: any) { st.filters.push((r) => r[k] !== v); return q; },
        is(k: string, v: any) { st.filters.push((r) => (r[k] ?? null) === v); return q; },
        in(k: string, vs: any[]) { st.filters.push((r) => vs.includes(r[k])); return q; },
        gte(k: string, v: any) { st.filters.push((r) => r[k] != null && String(r[k]) >= v); return q; },
        lt(k: string, v: any) { st.filters.push((r) => r[k] != null && String(r[k]) < v); return q; },
        or(s: string) { const f = orTerm(`or(${s})`); st.filters.push(f); return q; },
        order(k: string, o?: any) { st.sorts.push([k, o?.ascending !== false]); return q; },
        range(a: number, b: number) { st.range = [a, b]; return q; },
        limit(n: number) { st.limit = n; return q; },
        maybeSingle() { st.one = true; return q; },
        single() { st.one = true; return q; },
        then(res: any, rej: any) { return Promise.resolve().then(run).then(res, rej); },
      };
      return q;
    },
  };
}

// Synthetic rows (no real people). Ids are hex so the matter filter keeps them.
const LEAD = { id: "L", firm_id: "F", campaign_id: "ca", campaign: "MVA", case_type: "mva", claimant_name: "Test Person", phone: "2025550100",
  created_at: "2026-09-01T12:00:00Z", incident_start: "2026-01-01", incident_city: "Austin", incident_state: "TX", signed_at: "2026-08-01T12:00:00Z", firm_sent_at: "2026-08-02T12:00:00Z" };
const A = { id: "a1", lead_id: "L", campaign_id: "ca", campaign: "MVA", claim_type: "mva", status: "new", created_at: "2026-01-01" };
const B = { id: "b2", lead_id: "L", campaign_id: "cb", campaign: "Motel", claim_type: "motel_trafficking", status: "signed_qa", created_at: "2026-02-01" };
const sub = (id: string, claim: string | null, template: string, date: string, status = "completed", campaign: string | null = null) =>
  ({ id, lead_id: "L", claim_id: claim, campaign_id: campaign, pax_index: null, template_key: template, created_at: date, status, signed_at: date, completed_at: date, sent_at: date, sent_by: null, call_id: null });
const base = (): Record<string, any[]> => ({
  leads: [{ ...LEAD }], claims: [{ ...A }, { ...B }], firms: [{ id: "F", name: "Test firm" }],
  statuses: [{ key: "new", label: "New" }, { key: "signed_qa", label: "Signed: QA" }], esign_submissions: [], intake_calls: [], app_users: [],
});
const rec = (r: any) => { assert.ok(r.ok, r.ok ? "" : r.error); return r.record as Record<string, string | null>; };

(async () => {
  await t("keys are unique and every key is built", () => {
    assert.equal(new Set(STANDARD_KEYS).size, STANDARD_KEYS.length);
    const r = standardFromRows({ lead: {} });
    for (const k of STANDARD_KEYS) assert.ok(k in r, `missing ${k}`);
    for (const k of Object.keys(r)) assert.ok(STANDARD_KEYS.includes(k), `unlisted ${k}`);
  });

  await t("one source per field: the cell is leads.phone, never a legacy copy", () => {
    const r = standardFromRows({
      lead: { id: "L1", lead_no: "TMP-1", phone: "7089161007", ip_phone: "9999999999", caller_phone: "8888888888", email: "a@b.co", caller_email: "x@y.z",
        mail_addr1: "18475 Zurich Ln", mail_city: "Tinley Park", mail_state: "IL", mail_zip: "60477", address: "old line",
        home_phone: "7085550001", work_phone: "7085550002", dl_number: "D123", incident_start: "2026-09-20", incident_city: "Las Vegas", incident_state: "NV",
        created_at: "2026-09-28T16:43:00Z", first_dialed_at: "2026-09-28T16:45:00Z", last_called_at: "2026-09-28T19:01:00Z", ssn_last4: "1234", first_name: "Ariana", last_name: "Garafalo" },
      claim: { id: "C1", status: "signed_qa", campaign: "INNO MVA", claim_type: "mva", answers: { mva_call: { file: { report: "LV-77", carrier: "GEICO" } } } },
      sole: true,
      statusLabel: "Signed: QA", firmName: "Turnbull Moak & Pendergrass",
      submission: { template_key: "NV_FLAT", status: "completed", sent_at: "2026-09-28T19:05:00Z", completed_at: "2026-09-28T19:20:00Z" },
      signingAgent: "Lisa Grant",
      lastCall: { disposition: "signed", reason: null },
    });
    assert.equal(r.cell_phone, "7089161007");
    assert.equal(r.email, "a@b.co");
    assert.equal(r.full_address, "18475 Zurich Ln, Tinley Park, IL 60477");
    assert.equal(r.full_name, "Ariana Garafalo");
    assert.equal(r.incident_state, "NV");
    assert.equal(r.agreement, "Nevada non-tiered");
    assert.equal(r.sign_date, "2026-09-28T19:20:00Z");
    assert.equal(r.signing_agent, "Lisa Grant");
    assert.equal(r.status_label, "Signed: QA");
    assert.equal(r.outcome, "Signed");
    assert.equal(r.police_report_number, "LV-77");
    assert.equal(r.other_driver_insurance, "GEICO");
    assert.equal(r.first_contact_at, "2026-09-28T16:45:00Z");
    assert.ok(!("ssn" in r));
  });

  await t("an unsigned agreement names no signing agent", () => {
    const r = standardFromRows({ lead: {}, claim: { id: "C1" }, sole: true, submission: { template_key: "TX", status: "opened", sent_at: "x" }, signingAgent: "Lisa" });
    assert.equal(r.signing_agent, null);
    assert.equal(r.esign_sent_date, "x");
  });

  await t("the lead select names only real columns the record reads", () => {
    for (const c of ["phone", "home_phone", "work_phone", "dl_number", "incident_city", "incident_state", "mail_addr1"]) assert.ok(STD_LEAD_COLS.split(", ").includes(c));
    assert.ok(!STD_LEAD_COLS.includes("mail_address1"));
  });

  await t("the call writes license and where the wreck happened onto the record", () => {
    const p = leadPatchFromAnswers({ story: { city: "Las Vegas, NV" }, file: { dl: "D-555" } });
    assert.equal(p.incident_state, "NV");
    assert.equal(p.incident_city, "Las Vegas");
    assert.equal(p.dl_number, "D-555");
    // The record reads a Story city the same way the call writes it.
    const i = incidentColumns({ city: "Las Vegas, NV" });
    assert.equal(i.incident_city, p.incident_city);
    assert.equal(i.incident_state, p.incident_state);
    assert.deepEqual(incidentColumns({ city: "Alabama" }), { incident_start: null, incident_city: null, incident_state: "AL" }, "the Story prefill names only a state");
    assert.deepEqual(incidentColumns({ city: "Washington", state: "DC", date: "9/14/2026" }), { incident_start: "2026-09-14", incident_city: "Washington", incident_state: "DC" });
    assert.equal(incidentColumns({ state: "somewhere" }).incident_state, null, "only a real state is stored");
  });

  await t("every field has a label, a group and an access; writable ones name their column", () => {
    for (const f of STANDARD_FIELDS) {
      assert.ok(f.label); assert.ok(f.group); assert.ok(f.source);
      assert.ok(["writable", "derived", "protected"].includes(f.access), f.key);
      if (f.access === "writable") { assert.ok(f.column, f.key); assert.ok(f.inbound, f.key); } else { assert.ok(!f.column && !f.inbound, f.key); }
    }
    for (const k of ["lead_id", "lead_no", "claim_id", "lawruler_id", "law_firm", "campaign_id", "ssn_last4", "status", "dq_reason"]) {
      assert.equal(STANDARD_FIELDS.find((f) => f.key === k)?.access, "protected", k);
    }
  });

  // ---- 1. The matter is resolveMatter's, and a named claim must be real ----
  await t("a named claim that is missing or on another file fails, never a lead-wide read", async () => {
    const tb = base(); tb.esign_submissions = [sub("sb", "b2", "TX", "2026-09-24")];
    tb.claims.push({ ...A, id: "e5", lead_id: "L2" });
    const missing = await buildStandardRecord(fakeDb(tb), "L", { claimId: "dead" });
    assert.equal(missing.ok, false);
    const other = await buildStandardRecord(fakeDb(tb), "L", { claimId: "e5" });
    assert.equal(other.ok, false);
    const wrongFirm = await buildStandardRecord(fakeDb(tb), "L", { claimId: "a1", firmId: "G" });
    assert.equal(wrongFirm.ok, false, "a file is never enriched for another firm's endpoint");
    assert.equal((await buildStandardRecord(fakeDb(tb), "L", { claimId: "a1", firmId: "F" })).ok, true);
  });

  await t("the explicit matter binds its own status, report and agreement", async () => {
    const tb = base(); tb.claims[0].answers = { mva_call: { file: { report: "REPORT-A" } } };
    tb.esign_submissions = [sub("sb", "b2", "TX", "2026-09-24"), sub("sa", "a1", "NV", "2026-09-23")];
    const r = await buildStandardRecord(fakeDb(tb), "L", { claimId: "a1" });
    assert.ok(r.ok && r.matter === "named");
    const x = rec(r);
    assert.equal(x.claim_id, "a1"); assert.equal(x.police_report_number, "REPORT-A"); assert.equal(x.agreement, "Nevada tiered");
    assert.equal(x.status_label, "New");
  });

  await t("4+ claims with two on the lead's campaign is ambiguous and borrows nothing", async () => {
    const tb = base();
    tb.claims = [{ ...A, campaign_id: "c0" }, { ...B, campaign_id: "ca" }, { ...A, id: "c3", campaign_id: "c1", created_at: "2026-03-01" }, { ...A, id: "d4", created_at: "2026-04-01" }];
    tb.esign_submissions = [sub("sb", "b2", "NV", "2026-09-24"), sub("s0", null, "TX", "2026-09-25")];
    tb.intake_calls = [{ id: "k1", lead_id: "L", claim_id: "b2", status: "ended", disposition: "signed", ended_at: "2026-09-24T12:00:00Z", created_at: "2026-09-24T11:00:00Z" }];
    const r = await buildStandardRecord(fakeDb(tb), "L");
    assert.ok(r.ok && r.matter === "none");
    const x = rec(r);
    for (const k of MATTER_KEYS) assert.equal(x[k], null, `${k} borrowed from some matter`);
    assert.equal(x.lead_id, "L"); assert.equal(x.cell_phone, "2025550100");
    assert.equal(x.campaign, "MVA", "a lead-level record keeps the lead's own campaign");
  });

  await t("any failed claim, agreement or call read fails the record", async () => {
    for (const table of ["claims", "esign_submissions", "intake_calls", "leads"]) {
      const r = await buildStandardRecord(fakeDb(base(), { [table]: "synthetic failure" }), "L", { claimId: "a1" });
      assert.equal(r.ok, false, table);
      if (!r.ok) assert.match(r.error, /synthetic failure/);
    }
    const unnamed = await buildStandardRecord(fakeDb(base(), { claims: "synthetic failure" }), "L");
    assert.equal(unnamed.ok, false, "a failed claims read is not 'no matter'");
  });

  // ---- 2 and 3. Matter facts, legacy rows, voided agreements ----
  await t("a legacy agreement with no claim counts only for an only matter", async () => {
    const one = base(); one.claims = [{ ...A }]; one.esign_submissions = [sub("s0", null, "TX", "2026-09-24", "completed", "ca")];
    const r1 = rec(await buildStandardRecord(fakeDb(one), "L"));
    assert.equal(r1.agreement, "Texas", "the only matter's own legacy signature");
    const wrongCamp = base(); wrongCamp.claims = [{ ...A }]; wrongCamp.esign_submissions = [sub("s0", null, "TX", "2026-09-24", "completed", "cb")];
    assert.equal(rec(await buildStandardRecord(fakeDb(wrongCamp), "L")).agreement, null, "another campaign's unbound agreement is not this matter's");
    const two = base(); two.esign_submissions = [sub("s0", null, "TX", "2026-09-24"), sub("sa", "a1", "NV", "2026-09-23")];
    const implicit = await buildStandardRecord(fakeDb(two), "L");
    assert.ok(implicit.ok && implicit.matter === "campaign");
    assert.equal(rec(implicit).agreement, "Nevada tiered", "a sibling-era unbound agreement is not borrowed");
    assert.equal(rec(await buildStandardRecord(fakeDb(two), "L", { claimId: "a1" })).agreement, "Nevada tiered");
  });

  await t("a voided newest agreement is ignored; the current one speaks", async () => {
    const tb = base(); tb.esign_submissions = [sub("old", "a1", "TX", "2026-09-23"), sub("void", "a1", "NV", "2026-09-24", "voided")];
    const x = rec(await buildStandardRecord(fakeDb(tb), "L", { claimId: "a1" }));
    assert.equal(x.agreement, "Texas"); assert.equal(x.sign_date, "2026-09-23");
    assert.equal(currentAgreement(tb.esign_submissions)?.id, "old");
    // Only a voided one on an only matter: no current signature, and the
    // lead's signed_at does not stand in for it.
    const solo = base(); solo.claims = [{ ...A }]; solo.esign_submissions = [sub("void", "a1", "NV", "2026-09-24", "voided")];
    const y = rec(await buildStandardRecord(fakeDb(solo), "L"));
    assert.equal(y.agreement, null); assert.equal(y.sign_date, null);
  });

  await t("a selected sibling reads its own incident, never the lead's or another matter's", async () => {
    const tb = base();
    tb.claims[1].answers = { mva_call: { story: { when: "Pick a date", date: "2026-09-03", city: "Reno, NV" } } };
    const b = rec(await buildStandardRecord(fakeDb(tb), "L", { claimId: "b2" }));
    assert.equal(b.incident_date, "2026-09-03"); assert.equal(b.incident_city, "Reno"); assert.equal(b.incident_state, "NV");
    assert.equal(b.sign_date, null, "the person's signed_at is not this matter's"); assert.equal(b.sent_to_firm_at, null);
    const a = rec(await buildStandardRecord(fakeDb(tb), "L", { claimId: "a1" }));
    assert.equal(a.incident_date, null); assert.equal(a.incident_state, null, "not the lead's Texas copy: two matters");
    const solo = base(); solo.claims = [{ ...A }];
    const s = rec(await buildStandardRecord(fakeDb(solo), "L"));
    assert.equal(s.incident_date, "2026-01-01"); assert.equal(s.incident_state, "TX"); assert.equal(s.incident_city, "Austin");
    assert.equal(s.sign_date, "2026-08-01T12:00:00Z", "an only matter with no agreement on record keeps the lead's signed date");
    assert.equal(s.sent_to_firm_at, "2026-08-02T12:00:00Z");
  });

  await t("a relative crash day is dated from the call that gave it, not today", async () => {
    const tb = base(); tb.claims = [{ ...A, answers: { mva_call: { story: { when: "Yesterday", city: "Houston, TX" } } } }, { ...B }];
    tb.intake_calls = [
      { id: "k2", lead_id: "L", claim_id: "a1", status: "ended", created_at: "2026-09-25T12:00:00Z", ended_at: "2026-09-25T12:20:00Z", story: { when: "Yesterday" } },
      { id: "k1", lead_id: "L", claim_id: "a1", status: "ended", created_at: "2026-09-20T12:00:00Z", ended_at: "2026-09-20T12:20:00Z", story: { when: "Yesterday" } },
      { id: "k0", lead_id: "L", claim_id: "a1", status: "ended", created_at: "2026-09-10T12:00:00Z", ended_at: "2026-09-10T12:20:00Z", story: {} },
    ];
    const x = rec(await buildStandardRecord(fakeDb(tb), "L", { claimId: "a1" }));
    assert.equal(x.incident_date, "2026-09-19");
    assert.equal(x.incident_state, "TX");
  });

  // ---- 4. Standard keys win in outbound events ----
  await t("event precedence: the matter's case_type wins over the lead copy the producer spread in", async () => {
    const tb = base();
    const std = await buildStandardRecord(fakeDb(tb), "L", { claimId: "b2" });
    const data = { lead_id: "L", claim_id: "b2", case_type: "mva", claim_type: "motel_trafficking", campaign_id: "cb", status: "signed_qa", previous_status: "new", phone: "2025550100" };
    const bag = eventFields(data, std, { injured: "Yes", case_type: "answer-copy" });
    assert.equal(bag.case_type, "motel_trafficking");
    assert.equal(bag.campaign, "Motel");
    assert.equal(bag.claim_id, "b2");
    assert.equal(bag.claim_type, "motel_trafficking", "non-standard event keys are kept");
    assert.equal(bag.previous_status, "new");
    assert.equal(bag.injured, "Yes");
    for (const k of STANDARD_KEYS) assert.ok(k in bag, `standard ${k} missing`);
    assert.ok(!("standard_error" in bag));
  });

  await t("when the record cannot be built the event goes out without standard values and says why", async () => {
    const std = await buildStandardRecord(fakeDb(base()), "L", { claimId: "dead" });
    const bag = eventFields({ lead_id: "L", claim_id: "dead", case_type: "mva", status: "signed_qa", previous_status: "new", dispo: "signed" }, std, null);
    assert.equal(bag.lead_id, "L"); assert.equal(bag.claim_id, "dead");
    assert.ok(!("case_type" in bag) && !("status" in bag), "no unverified values under standard names");
    assert.equal(bag.previous_status, "new"); assert.equal(bag.dispo, "signed");
    assert.match(String(bag.standard_error), /claim/i);
    const plain = eventFields({ x: 1 }, null, { y: 2 });
    assert.deepEqual(plain, { y: 2, x: 1 }, "an event about no file is untouched");
  });

  // ---- 5. The export ----
  const exportTables = () => {
    const tb = base();
    tb.leads[0].campaign_id = "aa"; tb.claims[0].campaign_id = "aa"; tb.claims[1].campaign_id = "bb";
    tb.leads.push({ ...LEAD, id: "L2", campaign_id: "bb", created_at: "2026-09-02T12:00:00Z" });
    tb.claims.push({ ...A, id: "c3", lead_id: "L2", campaign_id: "bb", campaign: "Motel", claim_type: "motel_trafficking", created_at: "2026-02-01" });
    tb.claims.push({ ...A, id: "d4", lead_id: "L2", campaign_id: "aa", created_at: "2026-03-01" });
    tb.leads.push({ ...LEAD, id: "L3", campaign_id: "aa", created_at: "2026-09-03T12:00:00Z" });   // no claim yet
    tb.leads.push({ ...LEAD, id: "L4", campaign_id: "bb", created_at: "2026-09-04T12:00:00Z" });   // no claim, other campaign
    tb.esign_submissions = [sub("sa", "a1", "NV", "2026-09-23"), sub("sv", "a1", "TX", "2026-09-24", "voided")];
    return tb;
  };

  await t("export: a campaign filter keeps that campaign's matters, never their siblings", async () => {
    const tb = exportTables();
    const matters = selectExportMatters(tb.leads, tb.claims, { campaignId: "aa" });
    assert.deepEqual(matters.map((m) => [m.lead.id, m.claim?.id ?? null]), [["L", "a1"], ["L2", "d4"], ["L3", null]]);
    const all = selectExportMatters(tb.leads, tb.claims, {});
    assert.equal(all.length, 6, "one row per matter, plus one per file with no claim");
    const byType = selectExportMatters(tb.leads, tb.claims, { caseType: "motel_trafficking" });
    assert.deepEqual(byType.map((m) => m.claim?.id), ["b2", "c3"]);
    const byStatus = selectExportMatters(tb.leads, tb.claims, { status: "new" });
    assert.ok(byStatus.every((m) => (m.claim?.status ?? "new") === "new"));
    assert.ok(byStatus.some((m) => m.claim === null), "a file with no claim shows as New, as on the Leads page");
  });

  await t("export and webhook agree on the same matter", async () => {
    const tb = exportTables();
    const out = await loadStandardExport(fakeDb(tb), { campaignId: "aa" });
    assert.ok(out.ok);
    const csvA = out.ok ? out.records.find((r) => r.claim_id === "a1")! : null;
    const hook = rec(await buildStandardRecord(fakeDb(tb), "L", { claimId: "a1" }));
    assert.deepEqual(csvA, hook);
    assert.equal(csvA?.agreement, "Nevada tiered", "the voided newer Texas agreement is ignored by both");
    const csv = standardCsv(out.ok ? out.records : []);
    assert.equal(csv.split("\n")[0], STANDARD_KEYS.join(","));
    assert.equal(csv.split("\n").length, 4);
  });

  await t("export: any failed read fails the whole export (the route answers 500)", async () => {
    for (const table of ["leads", "claims", "esign_submissions", "intake_calls", "statuses", "firms"]) {
      const out = await loadStandardExport(fakeDb(exportTables(), { [table]: "synthetic failure" }), {});
      assert.equal(out.ok, false, table);
      if (!out.ok) assert.match(out.error, /synthetic failure/);
    }
  });

  await t("export: every row is read, page by page, and a shrinking read fails", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, created_at: `2026-09-0${i + 1}` }));
    const db = fakeDb({ leads: rows });
    const r = await readAll(() => db.from("leads").select("*", { count: "exact" }).order("created_at", { ascending: true }).order("id", { ascending: true }), "the files", 3);
    assert.ok(r.ok && r.rows.length === 7);
    assert.deepEqual(r.ok ? r.rows.map((x) => x.id) : [], rows.map((x) => x.id));
    let calls = 0;
    const shrinking = () => ({ range: async (a: number) => { calls++; return a === 0 ? { data: [{ id: 1 }, { id: 2 }], error: null, count: 5 } : { data: [], error: null, count: 3 }; } });
    const s = await readAll(shrinking, "the files", 2);
    assert.equal(s.ok, false); assert.equal(calls, 2);
    const many = exportTables();
    for (let i = 0; i < 12; i++) many.leads.push({ ...LEAD, id: `M${i}`, campaign_id: "aa", created_at: `2026-09-1${i % 10}T12:00:00Z` });
    const chunked = await loadStandardExport(fakeDb(many), {}, 2);
    assert.ok(chunked.ok && chunked.records.length === 6 + 12, "chunked dependent reads still see every file");
  });

  await t("export filters: the Leads page's params, and a malformed one is an error", () => {
    const ok = exportFilterFrom(new URLSearchParams("campaign=INNO%20MVA&case_type=mva&status=signed_qa&since=2026-09-01&until=2026-09-28&state=NV"));
    assert.ok(ok.ok && ok.filter.campaign === "INNO MVA" && ok.filter.caseType === "mva" && ok.filter.status === "signed_qa" && ok.filter.since === "2026-09-01");
    assert.equal(exportFilterFrom(new URLSearchParams("campaign_id=not-a-uuid")).ok, false, "never widened to everything");
    assert.equal(exportFilterFrom(new URLSearchParams("since=Sept 1")).ok, false);
  });

  // ---- 6. Writable, derived, protected: inbound round trip ----
  await t("inbound: every writable standard field reaches its column and reads back the same", () => {
    const sample = (f: (typeof WRITABLE_FIELDS)[number]) =>
      f.key === "source_link" ? "https://example.test/lead/1"
      : f.key === "incident_state" || f.key === "state" ? "NV"
      : f.key === "incident_date" ? "2026-09-01"
      : f.key === "dob" ? "1990-04-12"
      : f.kind === "phone" ? "7025550123"
      : f.kind === "email" ? "pat@example.test"
      : `sample ${f.key}`;
    const body = Object.fromEntries(WRITABLE_FIELDS.map((f) => [f.key, sample(f)]));
    const cols: Record<string, any> = canonicalToLeadColumns(mapInbound(body));
    for (const f of WRITABLE_FIELDS) assert.equal(cols[f.column], sample(f), `${f.key} -> leads.${f.column}`);
    // Stored, then read back through the standard record (the export and every webhook).
    const lead = { id: "L9", ...cols };
    const back = standardFromRows({ lead, claim: { id: "c9", campaign: cols.campaign, claim_type: cols.case_type }, sole: true });
    for (const f of WRITABLE_FIELDS) assert.equal(back[f.key], sample(f), `${f.key} reads back`);
    // Every column the hook writes is a real leads column the record reads.
    for (const k of Object.keys(canonicalToLeadColumns({}))) assert.ok(STD_LEAD_COLS.split(", ").includes(k), `${k} is not a known leads column`);
  });

  await t("inbound: ids, status, ownership and SSN are never accepted under standard names", () => {
    for (const f of STANDARD_FIELDS.filter((x) => x.access !== "writable")) assert.equal(inboundCanonicalId(f.key), undefined, f.key);
    const cols = canonicalToLeadColumns(mapInbound({ status: "retained", lead_no: "TMP-9", claim_id: "x", ssn_last4: "1234", lawruler_id: "77", campaign_id: "c", law_firm: "Other", sign_date: "2026-01-01", first_name: "Ann" }));
    assert.equal(cols.first_name, "Ann");
    assert.equal(cols.external_id, null, "a LawRuler id is not taken from a generic sender");
    assert.ok(!Object.values(cols).includes("retained") && !Object.values(cols).includes("1234"));
  });

  await t("inbound: the older names still map", () => {
    const cols = canonicalToLeadColumns(mapInbound({ firstname: "A", lastname: "B", phone: "7025550100", leadid: "99", postal: "89101", assignee: "R. Counsel", date_of_incident: "09/14/2026", state_of_incident: "Nevada", phone_alt: "7025550111", leadlink: "https://lr.example/lead/99" }));
    assert.equal(cols.first_name, "A"); assert.equal(cols.last_name, "B"); assert.equal(cols.phone, "7025550100");
    assert.equal(cols.external_id, "99"); assert.equal(cols.mail_zip, "89101"); assert.equal(cols.handling_attorney, "R. Counsel");
    assert.equal(cols.incident_start, "2026-09-14"); assert.equal(cols.incident_state, "NV"); assert.equal(cols.phone_alt, "7025550111");
    assert.equal(cols.lawruler_url, "https://lr.example/lead/99");
    assert.equal(canonicalToLeadColumns(mapInbound({ source_link: "javascript:alert(1)" })).lawruler_url, null, "only a web link is stored");
    assert.equal(canonicalToLeadColumns(mapInbound({ incident_date: "not a date" })).incident_start, null, "a bad date never sinks the insert");
  });

  console.log(`${pass} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
