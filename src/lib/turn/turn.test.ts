// npx tsx src/lib/turn/turn.test.ts
import { bouncePath, isSafeFirmNext } from "../m6";
import { isTurnPublicPath } from "./public";
import { ORTIZ_FILE_ID, ORTIZ_FILE_NO, TURN_DEMO_TODAY } from "./types";
import { loadSeedFile, seedOrtiz, providerByKind } from "./seed";
import { lastHumanLabel, storedFacts, valleyChiroLastVisit, MISSING } from "./fields";
import { BOLTON_BUTTON, BOLTONS, SHELL_LINE, SHELL_MARK, SHELL_ROWS, chartswapIsRecordsPath, isShellRow } from "./shell";
import { pulledBrief, mmiFromRows } from "./brief";
import { returnToProviderRule, smsSendEnabled, selectHits } from "./playbook";
import { fallbackParse, runFallbackIngest, sanitizePatch, firmNote } from "./ingest";
import { answerAsk, landFile, queueLorResend, trySendSms } from "./land";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nCLAIMTURN SEED — Ortiz TMP-1182");
const file = seedOrtiz();
check("file id", file.id, ORTIZ_FILE_ID);
check("file no", file.fileNo, ORTIZ_FILE_NO);
check("load by id", loadSeedFile(ORTIZ_FILE_ID)?.fileNo, ORTIZ_FILE_NO);
check("unknown id is null", loadSeedFile("lead-uuid"), null);
check("not MMI", file.mmi, false);
check("still treating", file.treatingStatus, "still treating");
check("last PT date", file.lastTreatOn, "2026-08-22");
check("MRI date", file.nextTreatOn, "2026-09-04");
check("MRI place from row", file.nextTreatWhere, "Desert Radiology");
check("records 4 of 11", [file.recordsIn, file.recordsTotal], [4, 11]);
check("PD check not received", file.pdCheckReceived, false);
check("last human 19 days from demo today", lastHumanLabel(file, TURN_DEMO_TODAY), "19 days");
check("Valley Chiro on file", providerByKind(file, "chiro")?.onFile, true);
check("Valley last visit blank", providerByKind(file, "chiro")?.lastVisit, null);
check("blank visit says not on the file", valleyChiroLastVisit(file), MISSING);
check("claim number", file.carriers[0].claimNo, "18-449201");
check("LOR mailed Mar 18", file.carriers[0].lorMailedOn, "2026-03-18");
check("limits requested not in", file.carriers[0].limitsIn, false);
check("never a lead id shape", file.id.includes("-1182"), true);
check("venue is on the matter", file.venue, "NV · Clark");
check("MMI is one field on the file", typeof file.mmi, "boolean");
check("document pointers exist", file.documents.length > 0, true);
check("who sees this file is named", file.acl.some((a) => a.name === "Jordan Hale"), true);

console.log("\nCONCIERGE — stored fields only");
const facts = storedFacts(file);
check("MMI from row", facts.mmi, "No · still treating");
check("left to do from row", facts.leftToDo, "MRI, then ortho");
check("last offer missing", facts.lastOffer, MISSING);
const rows = mmiFromRows(file);
check("mmi chip from rows", rows.mmi.includes("No"), true);
check("brief does not invent a chiro visit", pulledBrief(file).includes("Valley Chiro last visit"), false);
check("brief names PD check", pulledBrief(file).includes("PD check not received"), true);

console.log("\nINGEST FALLBACK — never invent MMI or a provider");
const scream = "he's screaming about the check and nobody calling";
const screamIngest = runFallbackIngest(file, "client_phone", scream);
check("scream source is fallback", screamIngest.source, "fallback");
check("scream sets voice pref", screamIngest.patch.clientPref, "voice");
check("scream resets KEEP", screamIngest.patch.keepReset, true);
check("scream Maya callback", screamIngest.patch.callbackOwner, "Maya Chen");
check("note pulls not MMI from row", /not MMI/i.test(screamIngest.note), true);
check("note pulls MRI from row", screamIngest.note.includes("Sep 4") || screamIngest.note.includes("MRI"), true);
check("MMI diff left alone", screamIngest.diff.some((d) => d.field === "MMI / treat" && d.changed === false), true);
check("scream hits include Maya", screamIngest.hits.some((h) => h.id === "keep_maya_callback"), true);
check("scream does not auto-queue LOR", screamIngest.hits.some((h) => h.id === "notice_resend_lor"), false);

const adj = "dana doesn't have the lor in the claim notes. said she'll email monday. asked for limits again, still no dec page. client wants a person not a text if we call him.";
const adjIngest = runFallbackIngest(file, "adjuster", adj);
check("adjuster disputes LOR", adjIngest.patch.lorDisputed, true);
check("adjuster tickler monday", adjIngest.patch.adjusterWillEmailOn, "2026-08-31");
check("note cites mailed LOR from row", /Mar 18/.test(adjIngest.note) || /March 18/.test(adjIngest.note), true);
check("NOTICE hit is a PostGrid bolt-on button", adjIngest.hits.find((h) => h.id === "notice_resend_lor")?.button, BOLTON_BUTTON.postgrid);
check("NOTICE hit is tagged postgrid", adjIngest.hits.find((h) => h.id === "notice_resend_lor")?.bolton, "postgrid");
check("COVER hit is a button", adjIngest.hits.find((h) => h.id === "cover_tickler")?.button, "Set tickler");

const invented = sanitizePatch(file, {
  clientPref: "voice",
  mmi: true,
  provider: "Fake Spine",
  valleyLastVisit: "2026-08-01",
});
check("sanitize drops invented MMI", (invented as any).mmi, undefined);
check("sanitize drops invented provider", (invented as any).provider, undefined);
check("sanitize drops invented visit", (invented as any).valleyLastVisit, undefined);
check("sanitize keeps voice pref", invented.clientPref, "voice");

const emptyParse = fallbackParse(file, "looking", "just checking the file");
check("looking does not invent MMI", emptyParse.keepReset, undefined);
check("looking does not set a visit", (emptyParse as any).valleyLastVisit, undefined);

console.log("\nLAND — note + Maya + draft SMS, no live send");
const landed = landFile({
  file,
  note: screamIngest.note,
  patch: screamIngest.patch,
  armedHits: screamIngest.hits.map((h) => h.id),
});
check("landed flag", landed.landed, true);
check("file note written", landed.notes[0]?.body.includes("not MMI"), true);
check("pref voice after scream land", landed.clientPref, "voice");
check("KEEP reset", landed.keep.status, "human-spoke");
check("Maya callback order", landed.tasks.some((t) => t.id === "task-maya-call"), true);
check("return-to-chiro rule", returnToProviderRule(landed), true);
check("draft SMS exists", !!landed.draftSms?.body, true);
check("draft mentions Valley Chiro", landed.draftSms!.body.includes("Valley Chiro"), true);
check("draft mentions not MMI", /not at MMI/i.test(landed.draftSms!.body), true);
check("send disabled while voice only", landed.draftSms!.sendEnabled, false);
check("sms helper agrees", smsSendEnabled(landed), false);

const sent = trySendSms(landed);
check("trySend never sends", sent.sent, false);
check("file still has no live SMS", landed.sendLog.filter((s) => s.kind === "sms").every((s) => s.live === false && s.status !== "sent"), true);
check("every send-log row is not live", landed.sendLog.every((s) => s.live === false), true);

const queued = queueLorResend(landed);
check("LOR is queued not sent", queued.sendLog[0]?.status, "queued");
check("LOR live is false", queued.sendLog[0]?.live, false);
check("LOR is not an M6 G6 letter", queued.sendLog[0]?.body.includes("G6 Hospitality"), false);

const textAnyway = answerAsk(landed, "contact", "text_anyway");
check("text anyway enables the button", textAnyway.draftSms?.sendEnabled, true);
const stillBlocked = trySendSms(textAnyway);
check("enabled button still does not send", stillBlocked.sent, false);
check("blocked row is not sent", stillBlocked.file.sendLog[0]?.status, "blocked");

const chiroYes = answerAsk(landed, "chiro", "yes_2x");
check("yes 2x does not invent a last visit", providerByKind(chiroYes, "chiro")?.lastVisit, null);
check("cadence is stored", providerByKind(chiroYes, "chiro")?.cadence, "2x/week");

console.log("\nPLAYBOOK SELECT — same hits for same facts");
const a = selectHits(file, "adjuster", adj).map((h) => h.id).sort();
const b = selectHits(file, "adjuster", adj).map((h) => h.id).sort();
check("SELECT is deterministic", a, b);
check("firm note pulls claim number", adjIngest.note.includes("18-449201"), true);
check("firm note pulls mailed LOR date", /Mar 18|March 18/.test(adjIngest.note), true);

console.log("\nSHELL vs BOLT-ON — one vocabulary");
check("shell mark is ClaimTurn · shell", SHELL_MARK, "ClaimTurn · shell");
check("matter is a shell row", SHELL_ROWS.some((r) => r.key === "matter"), true);
check("providers are a shell row", SHELL_ROWS.some((r) => r.key === "providers"), true);
check("ChartSwap is not a shell row", isShellRow("chartswap"), false);
check("ChartSwap is not the records path", chartswapIsRecordsPath(), false);
check("Eve is a bolt-on and off this file", BOLTONS.find((b) => b.key === "eve")?.onFile, false);
check("ChartSwap is off this file", BOLTONS.find((b) => b.key === "chartswap")?.onFile, false);
check("Haiku is extract not chatbot", /not a chatbot/i.test(BOLTONS.find((b) => b.key === "haiku")?.job || ""), true);
check("PostGrid button label is one string", BOLTON_BUTTON.postgrid, "bolt-on · PostGrid");
check("JustCall button label is one string", BOLTON_BUTTON.justcall, "bolt-on · JustCall");
check("copy says we are the file", /ClaimTurn is the file/.test(SHELL_LINE), true);
check("copy rejects Filevine as the brain", /Filevine/.test(SHELL_LINE), true);

console.log("\nISOLATION — /turn is not /m6");
check("/turn is a public demo path", isTurnPublicPath("/turn"), true);
check("/turn/tmp-1182 is public", isTurnPublicPath("/turn/tmp-1182"), true);
check("/m6 is not a turn path", isTurnPublicPath("/m6"), false);
check("/m6/cases is not a turn path", isTurnPublicPath("/m6/cases"), false);
check("/turn is not a safe firm next (m6 landing unchanged)", isSafeFirmNext("/turn"), null);
check("/m6 is still a safe firm next", isSafeFirmNext("/m6"), "/m6");
const firmM6 = { signedIn: true, role: "firm", isM6Recipient: true, firmSlug: "tmp" };
check("firm+m6 still stays on /m6", bouncePath("/m6", firmM6), null);
check("firm+m6 still lands from dashboard to /m6", bouncePath("/dashboard", firmM6), "/m6");
check("signed-in firm is not bounced off /turn", bouncePath("/turn", firmM6), null);

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log(`\n${pass} passed`);
