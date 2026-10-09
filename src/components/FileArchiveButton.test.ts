import assert from "node:assert/strict";
import { createRuntime, one, text } from "./contact-saves.harness";
import { archiveControlAvailable } from "../lib/archive-control";
const props = { leadId: "synthetic-file", label: "Synthetic PNC (TEST-1)", allowed: true, archivedAt: null as string | null };
function mount(extra = {}) { const rt = createRuntime(); const view = rt.mount(rt.load("src/components/FileArchiveButton.tsx").default, { ...props, ...extra }); return { rt, view }; }
function click(view: any, label: string) { view.act(() => one(view.tree, (n) => n.type === "button" && text(n) === label, label).props.onClick()); }
let count = 0;
async function check(name: string, fn: () => Promise<void> | void) { await fn(); count++; console.log("ok", name); }
async function main() {
  await check("archive availability agrees with the existing pilot fence", () => {
    assert.equal(archiveControlAvailable("owner", true), true);
    assert.equal(archiveControlAvailable("owner", false), false);
    for (const role of ["admin", "manager", "qa", "agent"]) assert.equal(archiveControlAvailable(role, true), false, `${role} cannot reach the bulk route, even with a permission override`);
  });
  await check("no archive controls without existing server capability", () => { const { view } = mount({ allowed: false }); assert.equal(view.tree, null); });
  await check("opening or cancelling confirmation never archives", async () => {
    const { rt, view } = mount(); click(view, "Archive file"); assert.match(text(view.tree), /Synthetic PNC/); assert.match(text(view.tree), /whole file and all its matters/);
    click(view, "Cancel"); await rt.settle(); assert.equal(rt.posts().length, 0);
  });
  await check("confirmed archive targets exactly one file and preserves restore action", async () => {
    const { rt, view } = mount(); click(view, "Archive file");
    view.act(() => one(view.tree, (n) => n.type === "input", "archive reason").props.onChange({ target: { value: "Duplicate record" } }));
    click(view, "Confirm archive"); await rt.settle();
    assert.deepEqual(rt.posts()[0].body, { op: "archive", ids: [props.leadId], reason: "Duplicate record" });
    assert.match(text(view.tree), /File archived/); assert.match(text(view.tree), /Restore file/);
  });
  await check("archive error leaves record active and visibly unsaved", async () => {
    const { rt, view } = mount(); rt.replyWith(() => ({ status: 403, body: "forbidden" }));
    click(view, "Archive file"); click(view, "Confirm archive"); await rt.settle();
    assert.match(text(view.tree), /This account cannot archive or restore files/); assert.doesNotMatch(text(view.tree), /File archived/);
  });
  await check("expired session shows a sign-in instruction without false success", async () => {
    const { rt, view } = mount(); rt.replyWith(() => ({ status: 401, body: "unauthorized" }));
    click(view, "Archive file"); click(view, "Confirm archive"); await rt.settle();
    assert.match(text(view.tree), /Your session expired/); assert.doesNotMatch(text(view.tree), /File archived/);
  });
  await check("restore uses existing restore operation and never permanent deletion", async () => {
    const { rt, view } = mount({ archivedAt: "2026-09-28" }); click(view, "Restore file"); click(view, "Confirm restore"); await rt.settle();
    assert.deepEqual(rt.posts()[0].body, { op: "restore", ids: [props.leadId] }); assert.match(text(view.tree), /File restored/);
  });
  console.log(`${count} passed`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
