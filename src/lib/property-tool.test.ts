// npx tsx src/lib/property-tool.test.ts
import { guessBrand, brandsMismatch } from "./property-brand";
import {
  propertyToolKeyOk, cleanLeadid, normalizeStay, lawrulerPasteBlock,
  stayRangeLabel, flattenIdentification, propertyLookupKeys, propertyFileHref,
  brandHistoryForYear,
} from "./property-tool";
import {
  parseAddressComponents, parseFormattedAddress, mergeParsedAddress,
  parseStayAddressFromNarrative, milesToMeters, mapsApiKey,
} from "./places-search";
import { MAPS_NOT_CONFIGURED, searchProperties } from "./property-search";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nTOKEN (fail closed)");
check("empty env is closed", propertyToolKeyOk("secret", ""), false);
check("missing env is closed", propertyToolKeyOk("secret", undefined), false);
check("missing k is closed", propertyToolKeyOk("", "secret"), false);
check("null k is closed", propertyToolKeyOk(null, "secret"), false);
check("match", propertyToolKeyOk("secret", "secret"), true);
check("mismatch", propertyToolKeyOk("secreT", "secret"), false);
check("length mismatch", propertyToolKeyOk("no", "secret"), false);
check("rotation list accepts first", propertyToolKeyOk("aaa", "aaa,bbb"), true);
check("rotation list accepts second", propertyToolKeyOk("bbb", "aaa,bbb"), true);
check("rotation list rejects other", propertyToolKeyOk("ccc", "aaa,bbb"), false);

console.log("\nLEADID");
check("plain", cleanLeadid("12345"), "12345");
check("braces from a merge token", cleanLeadid("{{98765}}"), "98765");
check("hash prefix", cleanLeadid("#42"), "42");
check("empty", cleanLeadid("  "), "");
check("null", cleanLeadid(null), "");

console.log("\nBRAND");
check("Motel 6 from display name", guessBrand("Motel 6 Las Vegas - Tropicana"), "Motel 6");
check("Studio 6 is its own flag", guessBrand("Studio 6 Extended Stay Dallas"), "Studio 6");
check("unknown stays blank", guessBrand("Sunrise Inn"), "");
check("mismatch is case-insensitive", brandsMismatch("motel 6", "Motel 6"), false);
check("rebrand flags", brandsMismatch("Motel 6", "Red Roof"), true);
check("blank remembered does not flag", brandsMismatch("", "Motel 6"), false);

console.log("\nADDRESS PARSE");
check("street city state zip", parseAddressComponents([
  { types: ["street_number"], longText: "195" },
  { types: ["route"], longText: "E Tropicana Ave" },
  { types: ["locality"], longText: "Las Vegas" },
  { types: ["administrative_area_level_1"], shortText: "NV" },
  { types: ["postal_code"], longText: "89109" },
]), { street: "195 E Tropicana Ave", city: "Las Vegas", state: "NV", zip: "89109" });
check("empty components", parseAddressComponents([]), { street: "", city: "", state: "", zip: "" });
check("legacy long_name fields", parseAddressComponents([
  { types: ["street_number"], long_name: "195" },
  { types: ["route"], long_name: "E Tropicana Ave" },
  { types: ["locality"], long_name: "Las Vegas" },
  { types: ["administrative_area_level_1"], short_name: "NV" },
  { types: ["postal_code"], long_name: "89109" },
]), { street: "195 E Tropicana Ave", city: "Las Vegas", state: "NV", zip: "89109" });
check("formattedAddress fallback", parseFormattedAddress("195 E Tropicana Ave, Las Vegas, NV 89109, USA"), {
  street: "195 E Tropicana Ave", city: "Las Vegas", state: "NV", zip: "89109",
});
check("merge fills empty street from formatted", mergeParsedAddress(
  { street: "", city: "", state: "", zip: "" },
  "100 Main St, Dallas, TX 75201",
).street, "100 Main St");
check("narrative comma address", parseStayAddressFromNarrative(
  "Motel 6 Dallas — guest at 7111 LBJ Freeway, Dallas, TX 75251 during 2019",
), { name: "Motel 6", street: "7111 LBJ Freeway", city: "Dallas", state: "TX", zip: "75251" });
check("keys include uuid fallback", propertyLookupKeys({
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", external_id: null, lawruler_ref_no: null,
}), ["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]);
check("file href uses vendor id first", propertyFileHref({
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", external_id: "98765", lawruler_ref_no: null,
}), "/m6/property?leadid=98765");
check("history hits the stay year", brandHistoryForYear(
  [{ brand: "Motel 6", from: 2012, to: 2016, llc: "Motels of Indiana LLC", owner: "", address: "123 Happy St", source: "desk" }],
  2014,
)?.llc, "Motels of Indiana LLC");
check("history misses other years", brandHistoryForYear(
  [{ brand: "Motel 6", from: 2012, to: 2016, llc: "X", owner: "", address: "", source: "desk" }],
  2020,
), null);

console.log("\nSTAY + PASTE");
check("month/year normalizes", normalizeStay("03/2019"), "3/2019");
check("free-ish fallback", normalizeStay("spring 2018"), "spring 2018");
check("empty stay", normalizeStay("  "), "");
check("paste block matches LawRuler fields", lawrulerPasteBlock({
  name: "Motel 6 Las Vegas",
  street: "195 E Tropicana Ave",
  city: "Las Vegas",
  state: "NV",
  zip: "89109",
}), [
  "Property name: Motel 6 Las Vegas",
  "Street: 195 E Tropicana Ave",
  "City: Las Vegas",
  "State: NV",
  "Zip: 89109",
].join("\n"));
check("range label", stayRangeLabel("3/2019", "11/2021"), "3/2019 – 11/2021");
check("25 miles is under Places 50km cap", milesToMeters(25) < 50000, true);
check("tiny radius still has a floor", milesToMeters(0) >= 200, true);

console.log("\nFLATTEN");
check("nested canonical object", flattenIdentification({
  id: "link-1",
  remembered_brand: "Motel 6",
  current_brand: "Red Roof",
  brand_mismatch: true,
  stay_from: "3/2019",
  stay_to: "11/2021",
  properties_canonical: {
    name: "Red Roof Inn",
    street: "100 Main",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    address: "100 Main, Dallas, TX 75201",
    lat: 1, lng: 2,
  },
}).name, "Red Roof Inn");
check("flatten keeps recorded history", flattenIdentification({
  id: "link-2",
  remembered_brand: "Motel 6",
  current_brand: "Red Roof",
  brand_mismatch: true,
  stay_from: "3/2014",
  stay_to: "11/2014",
  properties_canonical: {
    name: "Red Roof Inn",
    street: "100 Main",
    city: "Gary",
    state: "IN",
    zip: "46402",
    address: "100 Main, Gary, IN 46402",
    lat: 1, lng: 2,
    current_brand: "Red Roof",
    brand_history: [{
      brand: "Motel 6", from: 2014, to: 2014,
      llc: "Motels of Indiana LLC", owner: "", address: "123 Happy St", source: "desk",
    }],
  },
}).history[0]?.llc, "Motels of Indiana LLC");

async function searchCases() {
  console.log("\nSEARCH (no crash, JSON errors)");
  const empty = await searchProperties({});
  check("empty location is 400 JSON", empty.status, 400);
  const prev = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  const missing = await searchProperties({ location: "Tropicana & Boulder Hwy, Las Vegas" });
  check("missing maps key is 503 JSON", missing.status, 503);
  check("missing maps key names Pages env", (missing as any).error, MAPS_NOT_CONFIGURED);
  check("mapsApiKey is null without env", mapsApiKey(), null);
  if (prev == null) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = prev;
}

searchCases().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exit(1);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
