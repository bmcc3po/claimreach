// Plaintiff fact sheet. Run: npx tsx src/lib/pfs.test.ts
import {
  PFS_FORM_KEY, PFS_ID_PREFIX, addPfsQuestion, buildPfsAnswersCsv, fieldsFromPfsCsv,
  isPfsFieldId, mergePfsAnswers, mergePfsFields, movePfsQuestion, parseCsvRows,
  pfsAnswersOnly, pfsKindLabel, pfsListRows, pfsProgress, pfsSectionOf,
  removePfsQuestion, updatePfsQuestion,
} from "./pfs";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nIDS + MERGE");
check("form key", PFS_FORM_KEY, "m6_pfs");
check("prefix id", isPfsFieldId("pfs_q001"), true);
check("intake id stays out", isPfsFieldId("safe_to_speak"), false);
check("merge writes pfs only", mergePfsAnswers(
  { safe_to_speak: true, pfs_q001: "old" },
  { safe_to_speak: false, pfs_q001: "new", pfs_q002: "two" },
), { safe_to_speak: true, pfs_q001: "new", pfs_q002: "two" });
check("answers only strips intake", pfsAnswersOnly({ safe_to_speak: true, pfs_q001: "a" }), { pfs_q001: "a" });

console.log("\nCSV PARSE");
check("quoted comma stays one cell", parseCsvRows('a,"b, c",d')[0], ["a", "b, c", "d"]);
check("blank file errors", fieldsFromPfsCsv("   ").error, "That file is empty.");

const listed = fieldsFromPfsCsv("What is your name?\nWere you at the motel?");
check("plain list count", listed.fields.length, 2);
check("plain list first id", listed.fields[0].id, "pfs_q001");
check("plain list is longtext", listed.fields[0].kind, "longtext");
check("plain list label", listed.fields[1].label, "Were you at the motel?");

const headed = fieldsFromPfsCsv(
  "section,question,type,options\n" +
  "About you,What is your name?,text,\n" +
  "Stay,Were you at Motel 6?,yes_no,\n" +
  "Stay,Which brand?,select,Motel 6;Studio 6\n",
);
check("headed askable+section", headed.fields.map((f) => f.kind), ["section", "text", "section", "bool", "select"]);
check("select options", headed.fields.find((f) => f.kind === "select")?.options, ["Motel 6", "Studio 6"]);
check("keeps pfs id", fieldsFromPfsCsv("id,question\npfs_full_name,Your name") .fields[0].id, "pfs_full_name");

console.log("\nPROGRESS + EXPORT");
const fields = headed.fields;
const answers = { pfs_q001: "Ada", other: "nope" };
// headed ids: pfs_s_about_you, pfs_what_is_your_name, pfs_s_stay, pfs_were_you_at_motel_6, pfs_which_brand
const nameId = fields.find((f) => f.kind === "text")!.id;
const ynId = fields.find((f) => f.kind === "bool")!.id;
check("progress 1 of 3", pfsProgress(fields, { [nameId]: "Ada" }), { asked: 3, answered: 1 });
const csv = buildPfsAnswersCsv(fields, [
  { lead_no: "TMP-1", claimant_name: "Ada Cole", answers: { [nameId]: "Ada", [ynId]: true } },
]);
check("csv has header and one row", csv.split("\n").length, 2);
check("csv has Yes", /Yes/.test(csv), true);
check("csv has lead no", /TMP-1/.test(csv), true);
check("prefix constant", PFS_ID_PREFIX, "pfs_");

console.log("\nONE-BY-ONE");
const started = addPfsQuestion([], { label: "What is your name?", kind: "text", section: "About you" });
check("add makes section + question", started.fields.map((f) => f.kind), ["section", "text"]);
check("add id is pfs_", started.id?.startsWith("pfs_"), true);
check("kind label matches builder", pfsKindLabel("bool"), "Yes / No");
check("blank label errors", addPfsQuestion([], { label: "  ", kind: "text" }).error, "Type the question.");
check("choice needs options", addPfsQuestion([], { label: "Brand?", kind: "select" }).error, "Add at least one choice.");

const withChoice = addPfsQuestion(started.fields, {
  label: "Which brand?", kind: "select", section: "Stay", options: ["Motel 6", "Studio 6"],
});
check("second section", withChoice.fields.filter((f) => f.kind === "section").map((f) => f.label), ["About you", "Stay"]);
check("list rows skip section", pfsListRows(withChoice.fields).map((r) => r.section), ["About you", "Stay"]);
check("section of second", pfsSectionOf(withChoice.fields, withChoice.id!), "Stay");

const edited = updatePfsQuestion(withChoice.fields, started.id!, { label: "Full name?" });
check("edit keeps place", pfsListRows(edited.fields)[0].field.label, "Full name?");
check("edit does not jump section", pfsSectionOf(edited.fields, started.id!), "About you");

const moved = movePfsQuestion(edited.fields, started.id!, 1);
check("move swaps askable rows", pfsListRows(moved.fields).map((r) => r.field.id), [
  withChoice.id, started.id,
]);

const gone = removePfsQuestion(edited.fields, started.id!);
check("delete drops question", pfsListRows(gone.fields).map((r) => r.field.label), ["Which brand?"]);
check("empty section cleaned", gone.fields.some((f) => f.label === "About you"), false);

const merged = mergePfsFields(gone.fields, fieldsFromPfsCsv("What is your name?\nWhich brand?").fields);
check("merge skips same label", pfsListRows(merged).map((r) => r.field.label), ["Which brand?", "What is your name?"]);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
