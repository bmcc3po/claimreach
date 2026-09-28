// npx tsx src/lib/lead-ingest.test.ts
import assert from "node:assert/strict";
import { normalizeLead, chooseCampaign, isSensitiveKey, redactForLog, ingestLead, type CampaignRow } from "./lead-ingest";
import { standardFromRows } from "./standard-fields";
import { readLeadStory, storyTags, prefillFromStory, isoDate } from "./mva-call/lead-story";
import { safeAppNext } from "./mva-call/links";
import { resolveLeadKey, leadKeyOf } from "./lead-key";
import { mapLawRulerStatus, shouldApplyLr } from "./lawruler-status";
import { isLorReadyStatus } from "./m6";

let pass = 0;
function t(name: string, fn: () => void) { fn(); pass++; console.log("ok", name); }

const CAMPS: CampaignRow[] = [
  { id: "tmp-mva", name: "TMP Motor vehicle accident", firm_id: "tmp", case_type: "mva", active: true, firm_slug: "tmp" },
  { id: "tmt-mva", name: "TMT Motor vehicle accident", firm_id: "tmt", case_type: "mva", active: true, firm_slug: "tmt" },
  { id: "tmt-old", name: "TMT Motor vehicle accident", firm_id: "tmt", case_type: "mva", active: false, firm_slug: "tmt" },
  { id: "m6", name: "Motel 6", firm_id: "tmp", case_type: "motel_trafficking", active: true, firm_slug: "tmp" },
];

// Brett's LawRuler mapping, as LawRuler posts it.
const LR = {
  LeadID: "248199", FirstName: "John", LastName: "Mastowski", Phone: "(205) 555-0142",
  Source: "Facebook", Assignee: "", CaseType: "INNO MVA", Status: "New Lead",
  ContactMethod: "PR Digital", DOI: "09/14/2026",
  Description: "The accident occurred Within the past 12 months in Alabama, I was not at fault. I do not have a lawyer. I am experiencing Minor pain or discomfort .",
};

t("LawRuler keys match however they are spelled", () => {
  const n = normalizeLead(LR);
  assert.equal(n.leadId, "248199");
  assert.equal(n.first, "John");
  assert.equal(n.last, "Mastowski");
  assert.equal(n.phone, "(205) 555-0142");
  assert.equal(n.caseType, "INNO MVA");
  assert.equal(n.channel, "Facebook");
  assert.equal(n.marketer, "PR Digital");
  assert.equal(n.doi, "09/14/2026");
  assert.equal(n.assignee, null, "blank stays blank");
  const snake = normalizeLead({ lead_id: "9", first_name: "A", "Last Name": "B", marketing_source: "Instagram", vendor: "Acme Leads" });
  assert.equal(snake.leadId, "9"); assert.equal(snake.first, "A"); assert.equal(snake.last, "B");
  assert.equal(snake.channel, "Instagram"); assert.equal(snake.marketer, "Acme Leads");
});

t("Source is the channel when it names one, the marketer when it does not", () => {
  assert.equal(normalizeLead({ Source: "gram" }).channel, "gram");
  assert.equal(normalizeLead({ Source: "PR Digital" }).marketer, "PR Digital");
  assert.equal(normalizeLead({ Source: "PR Digital" }).channel, null);
});

t("LawRuler Test tokens and SSNs never land", () => {
  const n = normalizeLead({ LeadID: "{{default95}}-Lead ID", SSN: "123-45-6789", social_security_number: "123456789", Phone: "2055550142" });
  assert.equal(n.leadId, null);
  assert.equal(Object.keys(n.raw).some((k) => isSensitiveKey(k)), false);
  assert.equal(JSON.stringify(n).includes("6789"), false);
  assert.equal(redactForLog({ ssn: "123456789", Name: "x" }).ssn, "[removed]");
  assert.equal(isSensitiveKey("social_facebook"), false, "Motel 6 social handles are not SSNs");
});

t("case type picks the campaign: INNO and TMP MVA go to TMP, TMT to TMT", () => {
  assert.equal(chooseCampaign("INNO MVA", CAMPS)?.id, "tmp-mva");
  assert.equal(chooseCampaign("TMP MVA", CAMPS)?.id, "tmp-mva");
  assert.equal(chooseCampaign("TMT Motor Vehicle", CAMPS)?.id, "tmt-mva");
  assert.equal(chooseCampaign("TMP Motor vehicle accident", CAMPS)?.id, "tmp-mva");
  assert.equal(chooseCampaign("Motel 6", CAMPS)?.id, "m6", "exact name wins");
  assert.equal(chooseCampaign("motel_trafficking", CAMPS), null, "Motel 6 hook keeps its own path");
  assert.equal(chooseCampaign(null, CAMPS), null);
  assert.equal(chooseCampaign(null, CAMPS, { defaultToMva: true })?.id, "tmp-mva", "marketer door defaults to MVA");
});

t("the PR Digital description pre-answers the call", () => {
  const s = readLeadStory(LR.Description, { doi: LR.DOI });
  assert.equal(s.stateCode, "AL");
  assert.equal(s.fault, "Other driver");
  assert.equal(s.lawyer, "No");
  assert.equal(s.pain, "Minor pain or discomfort");
  assert.equal(s.when, "within the past 12 months");
  assert.equal(s.doi, "2026-09-14");
  assert.deepEqual(storyTags(s), ["Not at fault", "Alabama", "Crash 9/14/2026", "No lawyer", "Minor pain or discomfort"]);
  const pre = prefillFromStory(s, new Date(2026, 8, 26));
  assert.deepEqual(pre, { story: { fault: "Other driver", city: "Alabama", when: "Pick a date", date: "2026-09-14" }, body: { rep: "No" } });
});

t("other wording reads the same", () => {
  const a = readLeadStory("Got rear-ended in Houston, Texas yesterday. It wasn't my fault. No attorney yet. Having neck pain.");
  assert.equal(a.stateCode, "TX"); assert.equal(a.fault, "Other driver"); assert.equal(a.lawyer, "No"); assert.equal(a.when, "yesterday");
  assert.equal(a.pain, "Neck pain");
  const b = readLeadStory("I was at fault. I already have a lawyer. West Virginia.");
  assert.equal(b.fault, "Caller"); assert.equal(b.lawyer, "Yes"); assert.equal(b.stateCode, "WV");
  assert.equal(readLeadStory("").fault, null);
  assert.equal(prefillFromStory(readLeadStory("")), null);
});

t("dates: real ones only", () => {
  assert.equal(isoDate("9/14/2026"), "2026-09-14");
  assert.equal(isoDate("2026-02-30"), null);
  assert.equal(isoDate("{{default41}}-Date of Incident"), null);
  const today = new Date(2026, 8, 26);
  assert.equal(prefillFromStory(readLeadStory("", { doi: "09/26/2026" }), today)?.story.when, "Today");
  assert.equal(prefillFromStory(readLeadStory("", { doi: "09/25/2026" }), today)?.story.when, "Yesterday");
});

t("sign-in only returns people to App links", () => {
  assert.equal(safeAppNext("/app/lr/248199"), "/app/lr/248199");
  assert.equal(safeAppNext("/app"), "/app");
  assert.equal(safeAppNext("/app?new=1"), "/app?new=1");
  assert.equal(safeAppNext("//evil.com/app"), null);
  assert.equal(safeAppNext("https://evil.com/app"), null);
  assert.equal(safeAppNext("/apple"), null);
  assert.equal(safeAppNext("/dashboard"), null);
});

t("Motel 6 secondaries: LawRuler status sets the ClaimReach status", () => {
  assert.equal(mapLawRulerStatus("Secondary OK Sent To Firm")?.status, "delivered");
  assert.equal(mapLawRulerStatus("Secondary Intake OK COMPLETE")?.status, "approved");
  const dq = mapLawRulerStatus("Secondary DQ Sent to Firm");
  assert.equal(dq?.status, "dq_billable"); assert.ok(dq?.dqReasonKey, "a DQ always carries a reason");
  assert.equal(mapLawRulerStatus("Contact Attempted"), null);
  assert.equal(mapLawRulerStatus("{{default96}}-Status"), null);
  assert.equal(shouldApplyLr("new", mapLawRulerStatus("Secondary OK Sent To Firm")!), true);
  assert.equal(shouldApplyLr("delivered", mapLawRulerStatus("Secondary OK Sent To Firm")!), false, "no repeat write");
  assert.equal(shouldApplyLr("delivered", mapLawRulerStatus("Secondary Intake OK COMPLETE")!), false, "never pulled back from delivered");
  assert.equal(isLorReadyStatus("Secondary OK Sent To Firm"), true, "the LOR flips on LawRuler's real wording");
  assert.equal(isLorReadyStatus("Secondary intake OK sent to firm"), true);
});

// A tiny stand-in for the database: leads by lead number.
function fakeSb(rows: any[]) {
  return { from: () => { let want = ""; const q: any = {
    select: () => q, eq: (_c: string, v: string) => { want = v; return q; }, order: () => q,
    limit: async () => ({ data: rows.filter((r) => r.lead_no === want).sort((a, b) => b.created_at.localeCompare(a.created_at)) }),
  }; return q; } };
}

async function lk() {
  const sb = fakeSb([
    { id: "tmt-old", lead_no: "TMP-1037", archived_at: "2026-09-26", created_at: "2026-09-02" },
    { id: "tmp-live", lead_no: "TMP-1037", archived_at: null, created_at: "2026-08-30" },
    { id: "roth", lead_no: "ROTH-1048", archived_at: null, created_at: "2026-08-01" },
  ]);
  assert.equal(await resolveLeadKey(sb, "3f2a9c1e-1111-4a2b-8c3d-1234567890ab"), "3f2a9c1e-1111-4a2b-8c3d-1234567890ab");
  assert.equal(await resolveLeadKey(sb, "TMP-1037"), "tmp-live", "open file wins over an archived twin");
  assert.equal(await resolveLeadKey(sb, "roth-1048"), "roth", "any capitalization");
  assert.equal(await resolveLeadKey(sb, "TMP-9999"), null);
  assert.equal(await resolveLeadKey(sb, "'; drop table leads"), null);
  assert.equal(leadKeyOf({ id: "x", lead_no: "TMP-1042" }), "TMP-1042");
  assert.equal(leadKeyOf({ id: "x", lead_no: null }), "x");
  pass++; console.log("ok lead URLs: /app/TMP-1042 and /leads/TMP-1042 find the file");
}
// A stand-in admin client for ingestLead: leads found by LawRuler id, and
// every insert and update recorded.
function fakeAdmin(existing: any[] = []) {
  const writes: { table: string; op: string; value: any }[] = [];
  const from = (table: string) => {
    let op = "read"; let val: any = null;
    const filters: ((r: any) => boolean)[] = [];
    const q: any = {
      select: () => q, is: () => q, gte: () => q, order: () => q, limit: () => q, maybeSingle: () => q, single: () => q,
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
      or: (s: string) => { const ids = s.split(",").map((x) => x.split(".").slice(2).join(".")); filters.push((r) => ids.includes(r.lawruler_ref_no) || ids.includes(r.external_id)); return q; },
      insert: (v: any) => { op = "insert"; val = v; return q; },
      update: (v: any) => { op = "update"; val = v; return q; },
      then: (res: any, rej: any) => Promise.resolve().then(() => {
        if (op !== "read") { writes.push({ table, op, value: val }); return { data: op === "insert" ? { id: "NEW", lead_no: "T-1" } : null, error: null }; }
        if (table === "leads") return { data: existing.filter((r) => filters.every((f) => f(r))), error: null };
        return { data: null, error: null };
      }).then(res, rej),
    };
    return q;
  };
  return { from, rpc: async () => ({ data: "T-1", error: null }), writes };
}
const MVA_CAMP = CAMPS[0];
const SENT = { LeadID: "7001", CaseType: "INNO MVA", FirstName: "Test", LastName: "Person", email: "test.person@example.test",
  home_phone: "2025550101", work_phone: "2025550102", alt_phone: "2025550103",
  incident_date: "09/03/2026", incident_state: "Nevada", incident_city: "Reno" };

async function promotion() {
  const n = normalizeLead(SENT);
  assert.equal(n.homePhone, "2025550101"); assert.equal(n.workPhone, "2025550102"); assert.equal(n.altPhone, "2025550103");
  const fresh = fakeAdmin();
  const r = await ingestLead(fresh, { lead: n, campaign: MVA_CAMP, via: "lawruler" });
  assert.equal(r.ok, true, r.error);
  const ins = fresh.writes.find((w) => w.table === "leads" && w.op === "insert")!.value;
  assert.equal(ins.incident_start, "2026-09-03");
  assert.equal(ins.incident_state, "NV");
  assert.equal(ins.incident_city, "Reno");
  assert.equal(ins.home_phone, "2025550101"); assert.equal(ins.work_phone, "2025550102"); assert.equal(ins.phone_alt, "2025550103");
  // What the standard record (export and webhooks) then says for the new file's only matter.
  const std = standardFromRows({ lead: { id: "NEW", ...ins }, claim: { id: "c1", campaign: ins.campaign, claim_type: ins.case_type }, sole: true });
  assert.equal(std.incident_date, "2026-09-03"); assert.equal(std.incident_state, "NV"); assert.equal(std.home_phone, "2025550101");
  pass++; console.log("ok ingest promotes incident date, city, state and home/work/alternate phones into their columns");

  const had = fakeAdmin([{ id: "X", firm_id: "tmp", lead_no: "T-9", lawruler_ref_no: "7001", external_id: "7001", campaign_id: "tmp-mva", first_name: "Test",
    home_phone: "7025559999", work_phone: null, phone_alt: "", incident_start: null, incident_city: null, incident_state: "TX" }]);
  const r2 = await ingestLead(had, { lead: n, campaign: MVA_CAMP, via: "lawruler" });
  assert.equal(r2.ok, true, r2.error);
  const patch = had.writes.find((w) => w.table === "leads" && w.op === "update" && !("vendor_fields" in w.value))!.value;
  assert.equal(patch.home_phone, undefined, "an existing home phone is never overwritten");
  assert.equal(patch.work_phone, "2025550102"); assert.equal(patch.phone_alt, "2025550103");
  assert.equal(patch.incident_start, "2026-09-03", "a blank incident date is filled");
  assert.ok(!("incident_city" in patch) && !("incident_state" in patch), "a file with a state keeps its place; no Reno with Texas");
  pass++; console.log("ok ingest fills blanks on an existing file and overwrites nothing");
}

lk().then(promotion).then(() => console.log(`${pass} passed`)).catch((e) => { console.error(e); process.exit(1); });
