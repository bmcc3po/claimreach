import assert from "node:assert/strict";
import { groupHomeNeeds } from "./home-needs";

const first = { href: "/leads/TEST?claim=one", why: "No movement", tone: "warn" as const };
const rows = [first, { ...first, why: "Flagged", tone: "bad" as const }, { ...first, why: "Flagged" },
  { ...first, href: "/leads/TEST?claim=two" }, { ...first, href: "/leads/TEST" }];
const grouped = groupHomeNeeds(rows);
assert.equal(grouped.length, 3, "sibling matters and an unresolved lead remain distinct");
assert.equal(grouped[0].why, "No movement · Flagged");
assert.equal(grouped[0].tone, "bad", "retain the most urgent reason");
assert.equal(first.why, "No movement", "do not mutate source alerts");
assert.equal(first.tone, "warn");
assert.deepEqual(groupHomeNeeds([]), []);
console.log("Dashboard combines repeated alerts without combining sibling matters or losing reasons");
