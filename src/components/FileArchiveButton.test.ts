import assert from "node:assert/strict";
import { createRuntime, one, text } from "./contact-saves.harness";
const props = { leadId: "synthetic-file", label: "Synthetic PNC (TEST-1)", allowed: true, archivedAt: null as string | null };
function mount(extra = {}) { const rt = createRuntime(); const view = rt.mount(rt.load("src/components/FileArchiveButton.tsx").default, { ...props, ...extra }); return { rt, view }; }
function click(view: any, label: string) { view.act(() => one(view.tree, (n) => n.type === "button" && text(n) === label, label).props.onClick()); }
let count = 0;
async function check(name: string, fn: () => Promise<void> | void) { await fn(); count++; console.log("ok", name); }
async function main() {
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
    const { rt, view } = mount(); rt.replyWith(() => ({ status: 403, body: { error: "no delete permission" } }));
    click(view, "Archive file"); click(view, "Confirm archive"); await rt.settle();
    assert.match(text(view.tree), /no delete permission/); assert.doesNotMatch(text(view.tree), /File archived/);
  });
  await check("restore uses existing restore operation and never permanent deletion", async () => {
    const { rt, view } = mount({ archivedAt: "2026-09-28" }); click(view, "Restore file"); click(view, "Confirm restore"); await rt.settle();
    assert.deepEqual(rt.posts()[0].body, { op: "restore", ids: [props.leadId] }); assert.match(text(view.tree), /File restored/);
  });
  console.log(`${count} passed`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
