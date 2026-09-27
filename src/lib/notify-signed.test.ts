// Run: npx tsx src/lib/notify-signed.test.ts
import assert from "node:assert/strict";
import { cleanEmails, signedRecipients, type NotifyRoute } from "./notify-signed";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log("ok", name); };
const R = (o: Partial<NotifyRoute>): NotifyRoute => ({ event: "signed", case_type: null, campaign_id: null, to_emails: [], cc_emails: [], active: true, ...o });

t("emails are cleaned, lowercased, deduped", () => {
  assert.deepEqual(cleanEmails("MVA@x.com, tmpmva@x.com; mva@x.com  nope"), ["mva@x.com", "tmpmva@x.com"]);
  assert.deepEqual(cleanEmails(""), []);
});

const routes = [
  R({ case_type: "mva", to_emails: ["mva@ii.com"] }),
  R({ case_type: "mva", campaign_id: "c-tmp", cc_emails: ["tmpmva@ii.com"] }),
  R({ case_type: "mva", campaign_id: "c-other", cc_emails: ["other@ii.com"] }),
  R({ case_type: "motel_trafficking", to_emails: ["m6@ii.com"] }),
];

t("the distro plus that campaign's CC, nobody else's", () => {
  assert.deepEqual(signedRecipients(routes, { case_type: "mva", campaign_id: "c-tmp" }), { to: ["mva@ii.com"], cc: ["tmpmva@ii.com"] });
});

t("a campaign with no CC gets just the distro", () => {
  assert.deepEqual(signedRecipients(routes, { case_type: "mva", campaign_id: "c-new" }), { to: ["mva@ii.com"], cc: [] });
});

t("no distro for the type: the CCs become the To", () => {
  const r = [R({ case_type: "pfas", campaign_id: "c-p", cc_emails: ["pfas@ii.com"] })];
  assert.deepEqual(signedRecipients(r, { case_type: "pfas", campaign_id: "c-p" }), { to: ["pfas@ii.com"], cc: [] });
});

t("nothing set, nobody is emailed; switched off rules are ignored", () => {
  assert.deepEqual(signedRecipients([], { case_type: "mva", campaign_id: "c-tmp" }), { to: [], cc: [] });
  assert.deepEqual(signedRecipients([R({ case_type: "mva", to_emails: ["a@b.co"], active: false })], { case_type: "mva", campaign_id: "x" }), { to: [], cc: [] });
});

t("an address in both lists is only a To", () => {
  const r = [R({ case_type: "mva", to_emails: ["a@b.co"] }), R({ campaign_id: "c", cc_emails: ["a@b.co", "c@d.co"] })];
  assert.deepEqual(signedRecipients(r, { case_type: "mva", campaign_id: "c" }), { to: ["a@b.co"], cc: ["c@d.co"] });
});

console.log(passed, "passed");
