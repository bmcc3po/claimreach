// Run: npx tsx src/lib/mva-call/report.test.ts
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { caseReport, caseReportHtml, caseReportText } from "./report";

let passed = 0;
function t(name: string, fn: () => void) { fn(); passed++; console.log("ok", name); }
const isoAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const lead = { claimant_name: "John Mastowski", lead_no: "TMP-1181", campaign: "INNO MVA", phone: "2055550142", email: "john@example.com" };
const answers = {
  phase: "file",
  story: { city: "Houston, TX", when: "Pick a date", date: isoAgo(6), seat: "Driver", fault: "Other driver", police: "Came out", text: "2:14 PM: Rear-ended at a light on 610" },
  body: { pain: ["Neck", "Back"], seen: ["ER"], providers: ["Memorial Hermann"], done: { pain: true, seen: true }, willing: "Yes", work: "Yes", exchanged: "Yes", coverage: "Full coverage", uim: "Yes", check: "No", rep: "No" },
  car: { justMe: true, people: [] },
  file: { carrier: "State Farm", report: "HPD-22-1931", vYear: "2019", vMake: "Honda", vModel: "Accord", dob: "03/02/1988", ssn: "123456789", addr: "1 Main St, Houston, TX", dl: "TX12345" },
};
const sub = { id: "s1", status: "completed", template_key: "TX", signer_name: "John Mastowski", injured_name: "John Mastowski", signed_at: new Date().toISOString(), completed_pdf_path: "x/signed-1.pdf" };

t("the report reads every question as asked, with its answer", () => {
  const r = caseReport(lead, answers, sub);
  const all = r.sections.flatMap((s) => s.rows);
  const q = (text: string) => all.find((x) => x.q === text);
  assert.equal(q("What city and state was that in?")?.a, "Houston, TX");
  assert.equal(q("Were you driving, or were you a passenger?")?.a, "Driver");
  assert.equal(q("Tell me about the pain you're dealing with from this.")?.a, "Neck, Back");
  assert.equal(q("Who was at fault")?.a, "Other driver");
  assert.ok(r.sections.map((s) => s.title).join("|").startsWith("Client|Incident|Injury|Treatment|Insurance|Vehicle and passengers|Notes"));
  assert.equal(r.agreement.signed, true);
  assert.equal(r.agreement.hasPdf, true);
});

t("the summary is plain sentences from the answers", () => {
  const r = caseReport(lead, answers, sub);
  const s = r.summary.join(" ");
  assert.ok(/^John was the driver in a crash in Houston, TX on \w{3} \d+, \d{4}, 6 days ago\./.test(s), s);
  assert.ok(s.includes("The other driver was at fault."));
  assert.ok(s.includes("Police came to the scene, report HPD-22-1931."));
  assert.ok(s.includes("John is hurting in the neck and back."));
  assert.ok(s.includes("Seen at ER (Memorial Hermann)."));
  assert.ok(s.includes("The other driver's insurance is State Farm."));
  assert.ok(s.includes("John has full coverage with UM/UIM."));
  assert.ok(s.includes("John signed the Texas agreement"));
});

t("never the SSN, anywhere", () => {
  const r = caseReport(lead, answers, sub);
  const html = caseReportHtml(r, { link: "https://claimreach.com/app/TMP-1181", attached: true });
  const text = caseReportText(r, "https://claimreach.com/app/TMP-1181");
  for (const out of [JSON.stringify(r), html, text]) { assert.ok(!out.includes("123456789")); assert.ok(!/\bSSN:/.test(out)); }
  writeFileSync(process.env.REPORT_OUT || "/tmp/claude-0/report.html", html);
});

t("an empty file still reads cleanly", () => {
  const r = caseReport({ claimant_name: "Dana Reyes", phone: "8325550188" }, {}, null);
  assert.equal(r.agreement.signed, false);
  assert.equal(r.agreement.line, "No agreement sent yet.");
  const incident = r.sections.find((s) => s.id === "incident")!;
  assert.ok(incident.rows.every((row) => row.a === "Not answered" || row.q === "Report number"));
});

console.log(passed, "passed");
