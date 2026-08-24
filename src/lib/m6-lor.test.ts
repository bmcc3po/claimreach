// LOR compose. Run: npx tsx src/lib/m6-lor.test.ts
import {
  M6_LOR_RECIPIENT, M6_LOR_TEMPLATE_KEY, composeLorLetter, defaultLorFrom,
  displayClientName, letterIsMoneyBlind, lorAlreadySent, minusYears,
  postgridMode, pronounsFor, windowLine,
} from "./m6-lor";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nLOR LETTER");
const letter = composeLorLetter({
  firstName: "Ada", lastName: "Cole", gender: "female",
  leadNo: "TMP-1001",
  incidentStart: "2019-04-01", incidentEnd: "2019-06-15",
  propertyName: "Motel 6", propertyStreet: "100 Main",
  propertyCity: "Jackson", propertyState: "MS", propertyZip: "39201",
}, {
  today: "2026-08-23",
  from: {
    companyName: "Turnbull Moak & Pendergrass",
    attention: "Legal / Client Care",
    addressLine1: "1 Firm Way", city: "Jackson", state: "MS", zip: "39201",
    countryCode: "US", phone: "+12562075828",
  },
});

check("name", letter.clientName, "Ada Cole");
check("she/her", letter.pronouns.they, "she");
check("recipient is G6", letter.recipient.orgName, M6_LOR_RECIPIENT.orgName);
check("preserve is start minus 3yr", letter.preserveFrom, minusYears("2019-04-01", 3));
check("window wording", windowLine("2019-04-01", "2019-06-15").includes("2019"), true);
check("letter has no money", letterIsMoneyBlind(letter.body), true);
check("letter has no $", letter.body.includes("$"), false);
check("can send with a name", letter.canSend, true);
check("template key is one", M6_LOR_TEMPLATE_KEY, "m6_lor_g6");
check("display prefers full name", displayClientName({ fullName: "Ada Cole", firstName: "A" }), "Ada Cole");
check("they/them default", pronounsFor("unknown").they, "they");
check("already sent", lorAlreadySent("sent"), true);
check("not sent", lorAlreadySent("ready"), false);
check("missing key is missing mode", postgridMode(""), "missing");
check("test_ key is test", postgridMode("test_abc"), "test");
check("live key is live", postgridMode("live_abc"), "live");

const unnamed = composeLorLetter({ claimantName: "Unnamed file" }, {
  from: defaultLorFrom({}),
});
check("unnamed cannot send", unnamed.canSend, false);
check("missing name listed", unnamed.missing.includes("client name"), true);

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log(`\n${pass} passed`);
