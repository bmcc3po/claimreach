// Run: npx tsx src/components/contact-saves.test.ts
//
// Contact saves must never lose or revert a change (Astra round 7b, #6).
// Drives the REAL ContactInfo, CaseDetails and call-console ContactCard
// (src/components/calls/DeskPanel.tsx) through contact-saves.harness.ts: a
// small React stand-in with real effect cleanup and unmount, a fake clock,
// fake fetch and fake window events. No network, no database.
import assert from "node:assert/strict";
import { createRuntime, one, walk, text, fieldControl, type Node } from "./contact-saves.harness";

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
function t(name: string, fn: () => Promise<void>) { tests.push([name, fn]); }

const LEAD = {
  id: "lead-1", updated_at: "v1", first_name: "OLD_NAME", last_name: "OLD_LAST", phone: "+12025550101",
  email: "old@example.invalid", mail_addr1: "10 Test St", mail_city: "Las Vegas", mail_state: "NV", mail_zip: "89101",
  case_summary: "OLD_SUMMARY", call_outcome: "OLD_OUTCOME", case_tags: ["old"],
};
const type = (el: Node, value: any) => () => el.props.onChange({ target: { value } });

// ---------------------------------------------------------------- ContactInfo
function contactInfo(lead: any = LEAD) {
  const rt = createRuntime();
  const C = rt.load("src/components/ContactInfo.tsx").default;
  const props = { lead, editMode: true, claimType: "mva" };
  const view = rt.mount(C, props);
  const firstName = () => fieldControl(view.tree, "First name");
  const lastName = () => fieldControl(view.tree, "Last name");
  const email = () => one(view.tree, (n) => n.type === "input" && n.props.type === "email", "email box");
  return { rt, view, props, firstName, lastName, email };
}

t("ContactInfo: a refresh before the debounce still saves the typed value, and only it", async () => {
  const { rt, view, props, firstName, email } = contactInfo();
  view.act(type(firstName(), "TYPED_NAME"));
  await rt.advance(500);
  // An unrelated refresh lands: a new updated_at and a new email on the record.
  view.rerender({ ...props, lead: { ...LEAD, updated_at: "v2", email: "server@example.invalid" } });
  assert.equal(firstName().props.value, "TYPED_NAME", "typing stays on screen");
  assert.equal(email().props.value, "server@example.invalid", "clean field takes the refreshed value");
  assert.equal(rt.pendingTimers(), 1, "the pending save was not cancelled");
  await rt.advance(1000);
  const posts = rt.posts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "/api/leads");
  assert.deepEqual(posts[0].body, { op: "save", lead_id: "lead-1", lead: { first_name: "TYPED_NAME" } });
  assert.match(text(view.tree), /Saved /);
});

t("ContactInfo: a clean field refresh never POSTs", async () => {
  const { rt, view, props, firstName } = contactInfo();
  view.rerender({ ...props, lead: { ...LEAD, updated_at: "v2", first_name: "SERVER_NAME", phone: "+12025550199" } });
  await rt.advance(5000);
  assert.equal(rt.posts().length, 0);
  assert.equal(firstName().props.value, "SERVER_NAME");
  assert.doesNotMatch(text(view.tree), /Saved /);
});

t("ContactInfo: the read-only view follows a refreshed record (Astra round 5 stays fixed)", async () => {
  const rt = createRuntime();
  const C = rt.load("src/components/ContactInfo.tsx").default;
  const props = { lead: LEAD, editMode: false, claimType: "mva" };
  const view = rt.mount(C, props);
  view.rerender({ ...props, lead: { ...LEAD, updated_at: "v2", first_name: "SERVER_NAME" } });
  assert.equal(text(one(view.tree, (n) => n.props?.className === "ro-name", "name card")), "SERVER_NAME OLD_LAST");
  await rt.advance(5000);
  assert.equal(rt.posts().length, 0);
});

t("ContactInfo: typing while a save is out saves the newer value after it lands", async () => {
  const { rt, view, firstName } = contactInfo();
  rt.hold();
  view.act(type(firstName(), "FIRST"));
  await rt.advance(1000);
  assert.equal(rt.posts().length, 1);
  view.act(type(firstName(), "SECOND"));
  await rt.advance(1000); // the debounce fires while the first request is still out
  assert.equal(rt.posts().length, 1, "never two saves at once");
  await rt.release();
  assert.equal(firstName().props.value, "SECOND");
  assert.doesNotMatch(text(view.tree), /Saved /, "not Saved while SECOND is unsaved");
  assert.equal(rt.posts().length, 2);
  assert.deepEqual(rt.posts()[1].body.lead, { first_name: "SECOND" });
  await rt.release();
  assert.match(text(view.tree), /Saved /);
  await rt.advance(5000);
  assert.equal(rt.posts().length, 2, "nothing left to save");
});

t("ContactInfo: a failed save keeps the field unsaved, says why, never says Saved", async () => {
  const { rt, view, props, firstName, lastName } = contactInfo();
  rt.replyWith(() => ({ status: 400, body: { error: "Could not save: the record is locked." } }));
  view.act(type(firstName(), "TYPED_NAME"));
  await rt.advance(1000);
  assert.equal(rt.posts().length, 1);
  assert.match(text(view.tree), /the record is locked/);
  assert.doesNotMatch(text(view.tree), /Saved /);
  // Still unsaved, so a refresh does not wipe it.
  view.rerender({ ...props, lead: { ...LEAD, updated_at: "v2", first_name: "SERVER_NAME" } });
  assert.equal(firstName().props.value, "TYPED_NAME");
  // The next save carries it along with the new edit.
  rt.replyWith(() => ({ status: 200, body: { ok: true } }));
  view.act(type(lastName(), "NEW_LAST"));
  await rt.advance(1000);
  assert.deepEqual(rt.posts()[1].body.lead, { first_name: "TYPED_NAME", last_name: "NEW_LAST" });
  assert.match(text(view.tree), /Saved /);
  assert.doesNotMatch(text(view.tree), /locked/);
});

t("ContactInfo: a dropped connection says so and keeps the edit", async () => {
  const { rt, view, firstName } = contactInfo();
  rt.hold();
  view.act(type(firstName(), "TYPED_NAME"));
  await rt.advance(1000);
  await rt.dropConnection();
  assert.match(text(view.tree), /Could not reach the server\. Nothing was saved\./);
  assert.doesNotMatch(text(view.tree), /Saved /);
  assert.equal(firstName().props.value, "TYPED_NAME");
});

t("ContactInfo: leaving the tab sends the pending edit at once", async () => {
  const { rt, view, firstName } = contactInfo();
  view.act(type(firstName(), "TYPED_NAME"));
  view.unmount();
  await rt.settle();
  assert.equal(rt.posts().length, 1);
  assert.deepEqual(rt.posts()[0].body.lead, { first_name: "TYPED_NAME" });
});

t("ContactInfo: switching files flushes the old name to the old lead and starts clean", async () => {
  const { rt, view, props, firstName } = contactInfo();
  view.act(type(firstName(), "OLD_FILE_DRAFT"));
  view.rerender({ ...props, lead: { ...LEAD, id: "lead-2", first_name: "NEW_FILE" } });
  assert.equal(firstName().props.value, "NEW_FILE");
  await rt.settle();
  assert.deepEqual(rt.posts().map((p) => p.body), [{ op: "save", lead_id: "lead-1", lead: { first_name: "OLD_FILE_DRAFT" } }]);
  view.act(type(firstName(), "NEW_FILE_EDIT"));
  await rt.advance(1000);
  assert.deepEqual(rt.posts()[1].body, { op: "save", lead_id: "lead-2", lead: { first_name: "NEW_FILE_EDIT" } });
});

t("ContactInfo: a held old-file save and queued correction never target the next file", async () => {
  const { rt, view, props, firstName } = contactInfo();
  rt.hold();
  view.act(type(firstName(), "FIRST_DRAFT")); await rt.advance(1000);
  view.act(type(firstName(), "FINAL_DRAFT"));
  view.rerender({ ...props, lead: { ...LEAD, id: "lead-2", first_name: "NEW_FILE" } });
  await rt.release();
  assert.equal(rt.posts().length, 2);
  assert.deepEqual(rt.posts()[1].body, { op: "save", lead_id: "lead-1", lead: { first_name: "FINAL_DRAFT" } });
  await rt.release();
  assert.equal(firstName().props.value, "NEW_FILE");
  await rt.advance(5000);
  assert.ok(rt.posts().every((p) => p.body.lead_id === "lead-1"));
});

t("ContactInfo: successful split-name save returns the server canonical display name to its parent", async () => {
  const { rt, view, props, firstName } = contactInfo();
  const saved: any[] = [];
  view.rerender({ ...props, onSaved: (p: any) => saved.push(p) });
  rt.replyWith(() => ({ status: 200, body: { ok: true, contact: { first_name: "New", last_name: "OLD_LAST", claimant_name: "New OLD_LAST" } } }));
  view.act(type(firstName(), "New")); await rt.advance(1000);
  assert.deepEqual(saved, [{ first_name: "New", claimant_name: "New OLD_LAST" }]);
});

t("ContactInfo: MVA presents one canonical mailing address and saves only that edit", async () => {
  const { rt, view } = contactInfo();
  assert.equal(walk(view.tree, (n) => (n.type as any)?.name === "FieldRenderer").length, 0, "MVA has no second legacy contact form");
  view.act(type(fieldControl(view.tree, "Address"), "22 New Rd"));
  await rt.advance(1000);
  assert.deepEqual(rt.posts()[0].body.lead, { mail_addr1: "22 New Rd" });
});

t("ContactInfo: non-MVA shared mailing-address controls still use one saved value", async () => {
  const { rt, view, props } = contactInfo();
  view.rerender({ ...props, claimType: "motel_trafficking" });
  const formCopy = () => one(view.tree, (n) => (n.type as any)?.name === "FieldRenderer" && n.props.field?.id === "mail_addr1", "form's street field");
  view.act(() => formCopy().props.onChange("22 New Rd"));
  assert.equal(fieldControl(view.tree, "Address").props.value, "22 New Rd");
  await rt.advance(1000);
  assert.deepEqual(rt.posts()[0].body.lead, { mail_addr1: "22 New Rd" });
});

// ---------------------------------------------------------------- CaseDetails
function caseDetails(lead: any = LEAD) {
  const rt = createRuntime();
  const C = rt.load("src/components/CaseDetails.tsx").default;
  const saved: Record<string, any>[] = [];
  const props = { lead, editMode: true, onSaved: (p: Record<string, any>) => saved.push(p) };
  const view = rt.mount(C, props);
  const summary = () => one(view.tree, (n) => n.type === "textarea" && n.props.placeholder === "One-line summary for the firm.", "summary box");
  const outcome = () => one(view.tree, (n) => n.props?.label === "Call outcome", "call outcome").props.children as Node;
  const tags = () => one(view.tree, (n) => n.type === "input" && n.props.placeholder === "urgent, spanish, callback", "tags box");
  const posts = () => rt.posts().filter((p) => p.url === "/api/case/details");
  return { rt, view, props, saved, summary, outcome, tags, posts };
}

t("CaseDetails: a refresh before the debounce still saves the typed value, and only it", async () => {
  const { rt, view, props, summary, outcome, posts } = caseDetails();
  view.act(type(summary(), "TYPED_SUMMARY"));
  await rt.advance(500);
  view.rerender({ ...props, lead: { ...LEAD, updated_at: "v2", call_outcome: "SERVER_OUTCOME" } });
  assert.equal(summary().props.value, "TYPED_SUMMARY");
  assert.equal(outcome().props.value, "SERVER_OUTCOME", "clean field takes the refreshed value");
  await rt.advance(1000);
  assert.equal(posts().length, 1);
  assert.deepEqual(posts()[0].body, { lead_id: "lead-1", case_summary: "TYPED_SUMMARY" });
  assert.match(text(view.tree), /Saved\./);
});

t("CaseDetails: a clean field refresh never POSTs", async () => {
  const { rt, view, props, outcome, posts } = caseDetails();
  view.rerender({ ...props, lead: { ...LEAD, updated_at: "v2", call_outcome: "SERVER_OUTCOME", case_tags: ["a", "b"] } });
  await rt.advance(5000);
  assert.equal(posts().length, 0);
  assert.equal(outcome().props.value, "SERVER_OUTCOME");
});

t("CaseDetails: typing while a save is out saves the newer value after it lands", async () => {
  const { rt, view, summary, posts } = caseDetails();
  rt.hold();
  view.act(type(summary(), "FIRST"));
  await rt.advance(1000);
  view.act(type(summary(), "SECOND"));
  await rt.release(); // lands before the second debounce fires
  assert.equal(summary().props.value, "SECOND");
  assert.doesNotMatch(text(view.tree), /Saved\./);
  await rt.advance(1000);
  assert.equal(posts().length, 2);
  assert.deepEqual(posts()[1].body, { lead_id: "lead-1", case_summary: "SECOND" });
  await rt.release();
  assert.match(text(view.tree), /Saved\./);
});

t("CaseDetails: a failed save keeps the field unsaved and never says Saved", async () => {
  const { rt, view, props, summary, posts } = caseDetails();
  rt.replyWith(() => ({ status: 500, body: { error: "permission denied" } }));
  view.act(type(summary(), "TYPED_SUMMARY"));
  await rt.advance(1000);
  assert.equal(posts().length, 1);
  assert.match(text(view.tree), /Save failed: permission denied/);
  assert.doesNotMatch(text(view.tree), /Saved\./);
  view.rerender({ ...props, lead: { ...LEAD, updated_at: "v2", case_summary: "SERVER_SUMMARY" } });
  assert.equal(summary().props.value, "TYPED_SUMMARY");
});

t("CaseDetails: tags save as a list and the parent's echo does not rewrite the box", async () => {
  const { rt, view, props, saved, tags, posts } = caseDetails();
  view.act(type(tags(), "urgent, spanish,"));
  await rt.advance(1000);
  assert.deepEqual(posts()[0].body, { lead_id: "lead-1", case_tags: ["urgent", "spanish"] });
  assert.deepEqual(saved, [{ case_tags: ["urgent", "spanish"] }]);
  // LeadWorkspace merges the saved patch into its live copy and re-renders.
  view.rerender({ ...props, lead: { ...LEAD, ...saved[0] } });
  assert.equal(tags().props.value, "urgent, spanish,", "the agent may still be typing the next tag");
  await rt.advance(5000);
  assert.equal(posts().length, 1);
});

t("CaseDetails: leaving the tab sends the pending edit at once", async () => {
  const { rt, view, summary, posts } = caseDetails();
  view.act(type(summary(), "TYPED_SUMMARY"));
  view.unmount();
  await rt.settle();
  assert.equal(posts().length, 1);
});

t("CaseDetails: switching files flushes the old summary under the old ID", async () => {
  const { rt, view, props, summary, posts } = caseDetails();
  view.act(type(summary(), "OLD_FILE_DRAFT"));
  view.rerender({ ...props, lead: { ...LEAD, id: "lead-2", case_summary: "NEW_FILE_SUMMARY" } });
  assert.equal(summary().props.value, "NEW_FILE_SUMMARY");
  await rt.settle();
  assert.deepEqual(posts().map((p) => p.body), [{ lead_id: "lead-1", case_summary: "OLD_FILE_DRAFT" }]);
  view.act(type(summary(), "NEW_FILE_EDIT")); await rt.advance(1000);
  assert.deepEqual(posts()[1].body, { lead_id: "lead-2", case_summary: "NEW_FILE_EDIT" });
});

t("CaseDetails: an in-flight old save cannot carry its queued tags onto the next lead", async () => {
  const { rt, view, props, summary, tags, posts } = caseDetails();
  rt.hold();
  view.act(type(summary(), "OLD_FILE_DRAFT")); await rt.advance(1000);
  view.act(type(tags(), "old-file-only"));
  view.rerender({ ...props, lead: { ...LEAD, id: "lead-2", case_tags: ["new-file"] } });
  await rt.release();
  assert.deepEqual(posts()[1].body, { lead_id: "lead-1", case_tags: ["old-file-only"] });
  await rt.release();
  assert.equal(tags().props.value, "new-file");
  assert.ok(posts().every((p) => p.body.lead_id === "lead-1"));
});

// ------------------------------------------------ call console ContactCard
const CARD_INITIAL = { phone: "2025550101", email: "old@example.invalid", mail_addr1: "10 Test St", mail_city: "Las Vegas", mail_state: "NV", mail_zip: "89101" };
function contactCard(initial: Record<string, string> = CARD_INITIAL) {
  const rt = createRuntime();
  const C = rt.load("src/components/calls/DeskPanel.tsx", ["ContactCard"]).__ContactCard;
  const view = rt.mount(C, { leadId: "lead-1", initial });
  const box = (label: string) => one(view.tree, (n) => n.type === "input" && n.props["aria-label"] === label, label);
  const openEdit = () => view.act(() => one(view.tree, (n) => n.type === "button" && n.props.children === "Edit", "Edit button").props.onClick());
  return { rt, view, box, openEdit };
}

t("ContactCard: email edit + the console saving a phone posts only the email, never the old phone", async () => {
  const { rt, view, box, openEdit } = contactCard();
  openEdit();
  view.act(type(box("Email"), "draft@example.invalid"));
  rt.dispatch("cr:record", { leadId: "lead-1", phone: "2025550199" });
  assert.equal(box("Cell").props.value, "2025550199", "the card shows the saved phone");
  assert.equal(box("Email").props.value, "draft@example.invalid", "typing stays");
  await rt.advance(900);
  const posts = rt.posts();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { op: "save", lead_id: "lead-1", lead: { email: "draft@example.invalid" } });
  // The call's own copy follows the record: new phone, new email.
  const sent = rt.dispatched.filter((e) => e.type === "cr:contact");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].detail.phone, "2025550199");
  assert.equal(sent[0].detail.email, "draft@example.invalid");
  assert.equal(sent[0].detail.addr, "10 Test St, Las Vegas, NV 89101");
  assert.match(text(view.tree), /Saved to the file\./);
});

t("ContactCard: a console save never overwrites a box with unsaved typing", async () => {
  const { rt, view, box, openEdit } = contactCard();
  openEdit();
  view.act(type(box("Cell"), "7025550123"));
  rt.dispatch("cr:record", { leadId: "lead-1", phone: "2025550199", email: "console@example.invalid" });
  assert.equal(box("Cell").props.value, "7025550123");
  assert.equal(box("Email").props.value, "console@example.invalid");
  await rt.advance(900);
  assert.deepEqual(rt.posts()[0].body.lead, { phone: "7025550123" });
});

t("ContactCard: a console save onto clean fields never POSTs", async () => {
  const { rt, view, box, openEdit } = contactCard();
  rt.dispatch("cr:record", { leadId: "lead-1", phone: "2025550199", mail_zip: "89102" });
  rt.dispatch("cr:record", { leadId: "someone-else", phone: "9999999999" });
  await rt.advance(5000);
  assert.equal(rt.posts().length, 0);
  openEdit();
  assert.equal(box("Cell").props.value, "2025550199");
  assert.equal(box("ZIP").props.value, "89102");
  assert.doesNotMatch(text(view.tree), /Saved to the file/);
});

t("ContactCard: typing while a save is out saves the newer value after it lands", async () => {
  const { rt, view, box, openEdit } = contactCard();
  openEdit();
  rt.hold();
  view.act(type(box("Email"), "first@example.invalid"));
  await rt.advance(900);
  assert.equal(rt.posts().length, 1);
  view.act(type(box("Email"), "second@example.invalid"));
  await rt.release();
  assert.doesNotMatch(text(view.tree), /Saved to the file/, "not Saved while the newer email is unsaved");
  await rt.advance(900);
  assert.equal(rt.posts().length, 2);
  assert.deepEqual(rt.posts()[1].body.lead, { email: "second@example.invalid" });
  await rt.release();
  assert.match(text(view.tree), /Saved to the file\./);
  const sent = rt.dispatched.filter((e) => e.type === "cr:contact");
  assert.equal(sent[sent.length - 1].detail.email, "second@example.invalid");
  assert.equal(sent[sent.length - 1].detail.prevEmail, "first@example.invalid");
});

t("ContactCard: a failed save shows the error, keeps the edit, and a console save does not replace it", async () => {
  const { rt, view, box, openEdit } = contactCard();
  openEdit();
  rt.replyWith(() => ({ status: 403, body: { error: "forbidden" } }));
  view.act(type(box("Email"), "draft@example.invalid"));
  await rt.advance(900);
  assert.match(text(view.tree), /forbidden/);
  assert.doesNotMatch(text(view.tree), /Saved to the file/);
  assert.equal(rt.dispatched.filter((e) => e.type === "cr:contact").length, 0, "the call is not told a failed save landed");
  rt.dispatch("cr:record", { leadId: "lead-1", email: "console@example.invalid" });
  assert.equal(box("Email").props.value, "draft@example.invalid");
  // The next edit carries the unsaved email too.
  rt.replyWith(() => ({ status: 200, body: { ok: true } }));
  view.act(type(box("Home phone"), "7025550000"));
  await rt.advance(900);
  assert.deepEqual(rt.posts()[1].body.lead, { email: "draft@example.invalid", home_phone: "7025550000" });
  assert.match(text(view.tree), /Saved to the file\./);
});

t("ContactCard: pasting an address with no ZIP clears the old ZIP", async () => {
  const { rt, box, view, openEdit } = contactCard();
  openEdit();
  view.act(type(box("Street address"), "9 Elm Rd, Houston, TX"));
  assert.equal(box("Street address").props.value, "9 Elm Rd");
  assert.equal(box("City").props.value, "Houston");
  assert.equal(box("State").props.value, "TX");
  assert.equal(box("ZIP").props.value, "", "the Las Vegas ZIP does not stay on a Houston address");
  await rt.advance(900);
  assert.deepEqual(rt.posts()[0].body.lead, { mail_addr1: "9 Elm Rd", mail_city: "Houston", mail_state: "TX", mail_zip: "" });
});

t("ContactCard: pasting an address with a ZIP fills it", async () => {
  const { rt, box, view, openEdit } = contactCard();
  openEdit();
  view.act(type(box("Street address"), "18475 Zurich Ln, Tinley Park, IL 60477"));
  assert.equal(box("ZIP").props.value, "60477");
  await rt.advance(900);
  assert.deepEqual(rt.posts()[0].body.lead, { mail_addr1: "18475 Zurich Ln", mail_city: "Tinley Park", mail_state: "IL", mail_zip: "60477" });
});

t("ContactCard: a one-line address on the record is saved split once, on open", async () => {
  const { rt, view } = contactCard({ phone: "2025550101", mail_addr1: "18475 Zurich Ln, Tinley Park, IL 60477" });
  await rt.settle();
  assert.equal(rt.posts().length, 1);
  assert.deepEqual(rt.posts()[0].body.lead, { mail_addr1: "18475 Zurich Ln", mail_city: "Tinley Park", mail_state: "IL", mail_zip: "60477" });
  assert.match(text(view.tree), /18475 Zurich Ln, Tinley Park, IL 60477/);
  await rt.advance(5000);
  assert.equal(rt.posts().length, 1);
});

t("ContactCard: leaving the call sends the pending edit at once", async () => {
  const { rt, view, box, openEdit } = contactCard();
  openEdit();
  view.act(type(box("Email"), "draft@example.invalid"));
  view.unmount();
  await rt.settle();
  assert.equal(rt.posts().length, 1);
  assert.deepEqual(rt.posts()[0].body.lead, { email: "draft@example.invalid" });
});

t("ContactCard: a successful name correction emits canonical and previous names after acknowledgement", async () => {
  const { rt, view, box, openEdit } = contactCard({ ...CARD_INITIAL, first_name: "Old", last_name: "Tester", claimant_name: "Old Tester" });
  openEdit(); rt.hold();
  view.act(type(box("PNC first name"), "New")); await rt.advance(900);
  assert.equal(rt.dispatched.filter((e) => e.type === "cr:contact").length, 0);
  assert.deepEqual(rt.posts()[0].body.lead, { first_name: "New" });
  await rt.release({ status: 200, body: { ok: true, contact: { first_name: "New", last_name: "Tester", claimant_name: "New Tester" } } });
  const event = rt.dispatched.find((e) => e.type === "cr:contact")!.detail;
  assert.equal(event.name, "New Tester"); assert.equal(event.previousName, "Old Tester");
  assert.equal(event.first_name, "New"); assert.equal(event.last_name, "Tester");
});

t("ContactCard: a rejected name correction keeps the draft and emits no canonical name", async () => {
  const { rt, view, box, openEdit } = contactCard({ ...CARD_INITIAL, first_name: "Old", last_name: "Tester", claimant_name: "Old Tester" });
  openEdit();
  rt.replyWith(() => ({ status: 409, body: { error: "The name changed on another screen." } }));
  view.act(type(box("PNC last name"), "Draft")); await rt.advance(900);
  assert.equal(box("PNC last name").props.value, "Draft");
  assert.match(text(view.tree), /name changed on another screen/);
  assert.equal(rt.dispatched.filter((e) => e.type === "cr:contact").length, 0);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log("ok", name); }
    catch (e: any) { console.error("FAIL", name, "\n   ", String(e?.message ?? e).split("\n")[0]); }
  }
  console.log(`${passed}/${tests.length} passed`);
  if (passed !== tests.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
