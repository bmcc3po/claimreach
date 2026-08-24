// Brand hunt. Run: npx tsx src/lib/property-hunt.test.ts
import {
  REGISTRY_KEY_INVALID, REGISTRY_KEY_MISSING, REGISTRY_UNREACHABLE,
  companyActiveInYear, companiesFromOpenCorporates,
  deskHits, huntEmptyMessage, huntHitFromCompany, huntQueries,
  inboundOwnerFields, mergeHuntHits, openCorporatesPublicSearchUrl,
  runBrandHunt, scoreHuntHit, searchOpenCorporates,
} from "./property-hunt";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

const fakeLlc = {
  results: {
    companies: [{
      company: {
        name: "MOTELS OF INDIANA LLC",
        company_number: "1",
        jurisdiction_code: "us_in",
        current_status: "Active",
        opencorporates_url: "https://opencorporates.com/companies/us_in/1",
        registered_address_in_full: "123 Happy St, Gary, IN",
      },
    }],
  },
};

function fetchStatus(status: number, body: any = {}) {
  return (async (url?: any) => ({
    ok: status >= 200 && status < 300,
    status,
    url: String(url || ""),
    json: async () => body,
  })) as any;
}

console.log("\nHUNT HELPERS");
check("queries include Motel 6 + city", huntQueries({
  name: "Motel 6 Gary", city: "Gary", state: "IN",
})[0], "Motel 6 Gary IN");
check("queries include live name", huntQueries({
  name: "Red Roof Inn Gary", city: "Gary", state: "IN",
}).some((q) => q.includes("Red Roof Inn Gary")), true);
check("public search uses first hunt query", openCorporatesPublicSearchUrl(huntQueries({
  name: "Motel 6 Hammond", city: "Hammond", state: "IN",
})[0]), "https://opencorporates.com/companies?q=Motel%206%20Hammond%20IN");
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

const oc = companiesFromOpenCorporates(fakeLlc);
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
  let fetches = 0;
  const empty = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    token: "test-token",
    fetchImpl: (async () => { fetches++; return { ok: true, status: 200, json: async () => ({ results: { companies: [] } }) }; }) as any,
  });
  check("empty registry is not found", empty.hits.length, 0);
  check("empty copy is honest", empty.emptyMessage, huntEmptyMessage(2014));
  check("does not invent Motels of Indiana", empty.hits.some((h) => /motels of indiana/i.test(h.llc)), false);
  check("empty registry called the API", fetches > 0, true);

  fetches = 0;
  const noKey = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    token: "",
    fetchImpl: (async () => { fetches++; return { ok: false, status: 401, json: async () => fakeLlc }; }) as any,
  });
  check("missing key does not call the registry", fetches, 0);
  check("missing key is skipped", noKey.registry, "skipped");
  check("missing key is not a crash", noKey.error, null);
  check("missing key copy names Pages", noKey.emptyMessage, REGISTRY_KEY_MISSING);
  check("missing key invents nothing", noKey.hits.length, 0);

  fetches = 0;
  const blankToken = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    token: "   ",
    fetchImpl: (async () => { fetches++; return { ok: true, status: 200, json: async () => fakeLlc }; }) as any,
  });
  check("whitespace token does not call the registry", fetches, 0);
  check("whitespace token invents nothing", blankToken.hits.length, 0);

  const noKeyDesk = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN",
    token: null,
    history: [{ brand: "Motel 6", from: 2014, to: 2014, llc: "Motels of Indiana LLC", owner: "", address: "123 Happy St", source: "desk" }],
    fetchImpl: (async () => { throw new Error("must not fetch"); }) as any,
  });
  check("missing key still returns desk hits", noKeyDesk.hits[0]?.llc, "Motels of Indiana LLC");
  check("missing key with desk is still a hint", noKeyDesk.emptyMessage, REGISTRY_KEY_MISSING);
  check("missing key with desk is HTTP-200 shaped", noKeyDesk.error, null);

  const unauthorized = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    token: "bad-token",
    fetchImpl: fetchStatus(401, { error: { message: "Invalid Api Token..." }, results: fakeLlc.results }),
  });
  check("401 is unauthorized", unauthorized.registry, "unauthorized");
  check("401 is not a crash", unauthorized.error, null);
  check("401 copy names the key", unauthorized.emptyMessage, REGISTRY_KEY_INVALID);
  check("401 invents nothing", unauthorized.hits.length, 0);

  const forbidden = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    token: "bad-token",
    fetchImpl: fetchStatus(403, fakeLlc),
  });
  check("403 is unauthorized", forbidden.registry, "unauthorized");
  check("403 invents nothing", forbidden.hits.length, 0);
  check("403 copy names the key", forbidden.emptyMessage, REGISTRY_KEY_INVALID);

  const down = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    token: "test-token",
    fetchImpl: fetchStatus(429),
  });
  check("rate limit is unreachable", down.registry, "unreachable");
  check("rate limit is not a crash", down.error, null);
  check("rate limit copy", down.emptyMessage, REGISTRY_UNREACHABLE);
  check("rate limit invents nothing", down.hits.length, 0);

  const serverDown = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN", history: [],
    token: "test-token",
    fetchImpl: fetchStatus(503),
  });
  check("5xx is unreachable", serverDown.registry, "unreachable");
  check("5xx copy", serverDown.emptyMessage, REGISTRY_UNREACHABLE);

  const recorded = await runBrandHunt({
    year: 2014, name: "Motel 6", city: "Gary", state: "IN",
    token: "test-token",
    history: [{ brand: "Motel 6", from: 2014, to: 2014, llc: "Motels of Indiana LLC", owner: "", address: "123 Happy St", source: "desk" }],
    fetchImpl: fetchStatus(429),
  });
  check("desk still shows when registry is down", recorded.hits[0]?.llc, "Motels of Indiana LLC");
  check("desk plus 429 still hints try again", recorded.emptyMessage, REGISTRY_UNREACHABLE);

  const urls: string[] = [];
  await searchOpenCorporates("Motel 6 Gary IN", {
    token: "abc",
    fetchImpl: (async (u: any) => { urls.push(String(u)); return { ok: true, status: 200, json: async () => ({}) }; }) as any,
  });
  check("sends api_token when present", urls[0].includes("api_token=abc"), true);

  let skippedCalls = 0;
  const skipped = await searchOpenCorporates("Motel 6 Gary IN", {
    token: "",
    fetchImpl: (async (u: any) => { skippedCalls++; urls.push(String(u)); return { ok: true, status: 200, json: async () => fakeLlc }; }) as any,
  });
  check("blank token does not fetch", skippedCalls, 0);
  check("blank token is skipped", skipped.ok, false);
  if (!skipped.ok) check("blank token reason", skipped.reason, "skipped");
}

huntCases().then(() => {
  if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
  console.log(`\n${pass} passed`);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
