// LOR compose. Run: npx tsx src/lib/m6-lor.test.ts
// Asserts the TMP letter, not the old Dear Counsel stub.
import {
  M6_LOR_FROM_EMAIL_DEFAULT, M6_LOR_FROM_FAX_DEFAULT, M6_LOR_FROM_NAME_DEFAULT,
  M6_LOR_FROM_PHONE_DEFAULT, M6_LOR_INJURY_PHRASE, M6_LOR_RECIPIENT,
  M6_LOR_TEMPLATE_KEY, composeLorLetter, dateRangeLine, defaultLorFrom,
  displayClientName, franchiseeRecipientFromHistory, letterIsMoneyBlind,
  lorAlreadySent, minusYears, pickLorRecipient, postgridMode, pronounsFor,
  windowLine,
} from "./m6-lor";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nTMP LETTER");
const letter = composeLorLetter({
  firstName: "Bob", lastName: "Builder", gender: "male",
  leadNo: "TMP-1086",
  incidentStart: "2019-04-01", incidentEnd: "2019-06-15",
  propertyName: "Motel 6", propertyStreet: "100 Main",
  propertyCity: "Jackson", propertyState: "MS", propertyZip: "39201",
}, {
  today: "2026-08-23",
  from: defaultLorFrom({}),
});

check("name from the file", letter.clientName, "Bob Builder");
check("he/his", letter.pronouns.they, "he");
check("default envelope is G6 Plano", letter.recipient.orgName, M6_LOR_RECIPIENT.orgName);
check("G6 street", letter.recipient.addressLine1, "6509 Windcrest Drive, Suite 100");
check("G6 city", letter.recipient.city, "Plano");
check("preserve is start minus 3yr", letter.preserveFrom, minusYears("2019-04-01", 3));
check("window wording", windowLine("2019-04-01", "2019-06-15").includes("2019"), true);
check("date range is On / about", letter.dateRange, "On / about April 1, 2019 to June 15, 2019");
check("letter has no money", letterIsMoneyBlind(letter.body), true);
check("letter has no $", letter.body.includes("$"), false);
check("html has no $", letter.html.includes("$"), false);
check("can send with a name", letter.canSend, true);
check("template key is one", M6_LOR_TEMPLATE_KEY, "m6_lor_g6");
check("display prefers full name", displayClientName({ fullName: "Bob Builder", firstName: "B" }), "Bob Builder");
check("they/them default", pronounsFor("unknown").they, "they");
check("already sent", lorAlreadySent("sent"), true);
check("not sent", lorAlreadySent("ready"), false);
check("missing key is missing mode", postgridMode(""), "missing");
check("test_ key is test", postgridMode("test_abc"), "test");
check("live key is live", postgridMode("live_abc"), "live");

check("default sender Josh", letter.body.includes(M6_LOR_FROM_NAME_DEFAULT), true);
check("default phone", letter.body.includes(M6_LOR_FROM_PHONE_DEFAULT), true);
check("default fax", letter.body.includes(`${M6_LOR_FROM_FAX_DEFAULT}, fax`), true);
check("default email", letter.body.includes(M6_LOR_FROM_EMAIL_DEFAULT), true);
check("initials JB/am", letter.body.includes("JB/am"), true);
check("USPS certified", letter.body.includes("USPS Certified Mail"), true);
check("dear sir or madam", letter.body.includes("Dear Sir or Madam:"), true);
check("not the stub greeting", letter.body.includes("Dear Counsel:"), false);
check("not the stub do-not-contact line", letter.body.includes("Do not contact our client directly"), false);
check("investigation file", letter.body.includes("complete investigation file"), true);
check("insurance heading", letter.body.includes("Request for Insurance Information"), true);
check("under oath", letter.body.includes("under oath"), true);
check("preserve heading", letter.body.includes("Request to Preserve Evidence and Notice Against Spoliation of Evidence"), true);
check("numbered preserve list", letter.body.includes("1. All video recordings of the Property"), true);
check("eighteen preserve items", letter.body.includes("18. Any other documents and things"), true);
check("injury phrase", letter.body.includes(M6_LOR_INJURY_PHRASE), true);
check("RE client", letter.body.includes("Our Client:\tBob Builder"), true);
check("html is the same letter", letter.html.includes("Request for Insurance Information"), true);
check("html has numbered preserve", letter.html.includes("All video recordings of the Property"), true);
check("html money blind", letterIsMoneyBlind(letter.html), true);
check("no signature image required", letter.html.includes("<img"), false);

const envFrom = defaultLorFrom({
  M6_LOR_FROM_ATTN: "Pat Lee",
  M6_LOR_FROM_PHONE: "(555) 010-0101",
  M6_LOR_FROM_FAX: "(555) 010-0102",
  M6_LOR_FROM_EMAIL: "pat@turnbullfirm.com",
  M6_LOR_FROM_INITIALS: "PL",
  M6_LOR_TYPIST_INITIALS: "bb",
});
check("env overrides sender name", envFrom.attention, "Pat Lee");
check("env overrides phone", envFrom.phone, "(555) 010-0101");
check("env overrides fax", envFrom.fax, "(555) 010-0102");
check("env overrides email", envFrom.email, "pat@turnbullfirm.com");
const envLetter = composeLorLetter({ claimantName: "Bob Builder" }, { from: envFrom, today: "2026-08-23" });
check("overridden sender is in the letter", envLetter.body.includes("Pat Lee"), true);
check("overridden initials", envLetter.body.includes("PL/bb"), true);
check("Josh is not baked when env is set", envLetter.body.includes("Josh Bauer"), false);

check("bare defaults", defaultLorFrom({}).attention, M6_LOR_FROM_NAME_DEFAULT);
check("date range helper", dateRangeLine("2019-04-01", "2019-06-15").startsWith("On / about"), true);

const unnamed = composeLorLetter({ claimantName: "Unnamed file" }, {
  from: defaultLorFrom({}),
});
check("unnamed cannot send", unnamed.canSend, false);
check("missing name listed", unnamed.missing.includes("client name"), true);

const alt = franchiseeRecipientFromHistory({
  brand: "Motel 6", from: 2014, to: 2014,
  llc: "Motels of Indiana LLC", owner: "Pat Lee",
  address: "123 Happy St, Gary, IN 46402", source: "desk",
});
check("franchisee uses recorded LLC", alt?.orgName, "Motels of Indiana LLC");
check("default send stays G6", pickLorRecipient("g6", alt).key, "g6");
check("explicit franchisee when address is complete", pickLorRecipient("franchisee", alt).key, "franchisee");
const altLetter = composeLorLetter({
  claimantName: "Bob Builder", gender: "male",
  incidentStart: "2019-04-01", incidentEnd: "2019-06-15",
  propertyName: "Motel 6", propertyStreet: "100 Main",
  propertyCity: "Jackson", propertyState: "MS", propertyZip: "39201",
}, { today: "2026-08-23", recipient: alt! });
check("optional envelope uses recorded LLC", altLetter.body.includes("Motels of Indiana LLC"), true);
check("optional envelope still TMP letter", altLetter.body.includes("Request for Insurance Information"), true);
check("no invented LLC", franchiseeRecipientFromHistory({
  brand: "Motel 6", from: 2014, to: 2014, llc: "", owner: "", address: "", source: "desk",
}), null);
check("blank history does not become G6 clone", franchiseeRecipientFromHistory(null), null);

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log(`\n${pass} passed`);
