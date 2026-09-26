// npx tsx src/lib/lead-ingest.test.ts
import assert from "node:assert/strict";
import { normalizeLead, chooseCampaign, isSensitiveKey, redactForLog, type CampaignRow } from "./lead-ingest";
import { readLeadStory, storyTags, prefillFromStory, isoDate } from "./mva-call/lead-story";
import { safeAppNext } from "./mva-call/links";

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

console.log(`${pass} passed`);
