// Brand hunt. Run: npx tsx src/lib/property-hunt.test.ts
import {
  REGISTRY_UNREACHABLE, companyActiveInYear, companiesFromOpenCorporates,
  deskHits, huntEmptyMessage, huntHitFromCompany, huntQueries,
  inboundOwnerFields, mergeHuntHits, runBrandHunt, scoreHuntHit,
} from "./property-hunt";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nHUNT HELPERS");
check("queries include Motel 6 + city", huntQueries({
  name: "Motel 6 Gary", city: "Gary", state: "IN",
})[0], "Motel 6 Gary IN");
check("queries include live name", huntQueries({
  name: "Red Roof Inn Gary", city: "Gary", state: "IN",
}).some((q) => q.includes("Red Roof Inn Gary")), true);
check("active in year", companyActiveInYear({
  incorporation_date: "2010-01-01", dissolution_date: null, current_status: "Active",
}, 2014), true);
check("not yet formed", companyActiveInYear({
  incorporation_date: "2018-01-01", current_status: "Active",
}, 2014), false);
check("dissolved before stay", companyActiveInYear({
  incorporation_date: "2001-01-01", dissolution_date: "2012-05-01", current_status: "Dissolved",
}, 2014), false);
check("empty year message is honest", huntEmptyMessage(2014),
  "No filing found for this building in 2014. You can type one if you have it.");

const oc = companiesFromOpenCorporates({
  results: { companies: [{ company: { name: "MOTELS OF INDIANA LLC", company_number: "1", jurisdiction_code: "us_in", current_status: "Active", opencorporates_url: "https://opencorporates.com/companies/us_in/1", registered_address_in_full: "123 Happy St, Gary, IN" } }] },
});
check("parses OC rows", oc[0].name, "MOTELS OF INDIANA LLC");
const hit = huntHitFromCompany(oc[0], 2014);
check("OC hit keeps company number", hit?.companyNumber, "1");
check("OC hit keeps source URL", hit?.url.includes("opencorporates.com"), true);

const desk = deskHits([{
  brand: "Motel 6", from: 2012, to: 2016, llc: "Motels of Indiana LLC", owner: "", address: "123 Happy St", source: "desk",
}], 2014);
check("desk history is a hit", desk[0]?.llc, "Motels of Indiana LLC");
check("desk misses other years", deskHits([{
  brand: "Motel 6", from: 2012, to: 2016, llc: "X", owner: "", address: "", source: "desk",
}], 2020).length, 0);
check("empty desk is not an invented LLC", deskHits([], 2014).length, 0);

const ranked = mergeHuntHits([
  { id: "oc:us_tx:9", llc: "RANDOM HOLDINGS LLC", owner: "", address: "", brand: "", status: "Active", jurisdiction: "us_tx", companyNumber: "9", url: "https://x", source: "opencorporates", sourceLabel: "Company registry", activeInYear: true },
  { id: "desk:2014", llc: "Motels of Indiana LLC", owner: "", address: "123 Happy St", brand: "Motel 6", status: "Recorded", jurisdiction: "", companyNumber: "", url: "", source: "desk", sourceLabel: "Already on this building", activeInYear: true },
], 2014, "IN", "Motel 6 Gary");
check("desk ranks first", ranked[0].source, "desk");
check("desk score beats a random TX LLC", scoreHuntHit(ranked[0], 2014, "IN", "Motel 6") > scoreHuntHit(ranked[1], 2014, "IN", "Motel 6"), true);

check("LawRuler llc maps", inboundOwnerFields({ llc_name: "Motels of Indiana LLC", owner_name: "Pat" }).llc, "Motels of Indiana LLC");
check("placeholder llc is dropped", inboundOwnerFields({ llc: "{{llc}}" }).llc, null);

async function huntCases() {
  console.log("\nHUNT RUN");
  const empty = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({ results: { companies: [] } }) })) as any,
  });
  check("empty registry is not found", empty.hits.length, 0);
  check("empty copy is honest", empty.emptyMessage, huntEmptyMessage(2014));
  check("does not invent Motels of Indiana", empty.hits.some((h) => /motels of indiana/i.test(h.llc)), false);

  const down = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    fetchImpl: (async () => ({ ok: false, status: 429, json: async () => ({}) })) as any,
  });
  check("rate limit is unreachable", down.registry, "unreachable");
  check("rate limit copy", down.error, REGISTRY_UNREACHABLE);
  check("rate limit invents nothing", down.hits.length, 0);

  const recorded = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN",
    history: [{ brand: "Motel 6", from: 2014, to: 2014, llc: "Motels of Indiana LLC", owner: "", address: "123 Happy St", source: "desk" }],
    fetchImpl: (async () => ({ ok: false, status: 429, json: async () => ({}) })) as any,
  });
  check("desk still shows when registry is down", recorded.hits[0]?.llc, "Motels of Indiana LLC");
}

huntCases().then(() => {
  if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
  console.log(`\n${pass} passed`);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
