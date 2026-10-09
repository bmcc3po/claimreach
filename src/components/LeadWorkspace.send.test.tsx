import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

// Actual owner send handlers, with synthetic delivery responses only.
const source = fs.readFileSync(path.join(__dirname, "LeadWorkspace.tsx"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture({ failed = false, uncertain = false, sent = false, recipient = "firm@example.test" } = {}) {
  let cursor = 0, tree: any, refreshes = 0;
  const slots: any[] = [], effects: Array<() => void> = [], cleanups: any[] = [], posts: any[] = [];
  const props: any = { leadId: "test-lead", claimId: "test-matter" };
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value: any) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect(effect: () => any, deps: any[]) { const i = cursor++, before = slots[i]; if (!before || deps.some((value, j) => !Object.is(value, before[j]))) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); } },
  };
  const fakeFetch = async (url: string, options: any = {}) => {
    if (options.method === "POST") {
      posts.push({ url, body: JSON.parse(options.body) });
      return { ok: !failed, json: async () => failed ? { error: "Synthetic delivery failure" } : { ok: true, to: recipient, attachments: ["intake.pdf", "signed.pdf"] } };
    }
    return { ok: true, json: async () => ({ firm_sent_at: sent ? "2026-10-01T12:00:00Z" : null, delivery: { firm: "Synthetic Firm", to: recipient, cc: ["copy@example.test"] }, dispatch: uncertain ? { state: "uncertain" } : null, can_reconcile: false }) };
  };
  const exports: any = {};
  new Function("require", "exports", "fetch", "window", code)((id: string) => {
    if (id === "react") return hooks;
    if (id === "react/jsx-runtime") return jsx;
    if (id === "next/navigation") return { useRouter: () => ({ refresh: () => { refreshes++; } }) };
    return {};
  }, exports, fakeFetch, { confirm() { throw new Error("Native confirm must not open"); } });
  const render = () => { cursor = 0; tree = exports.SendToFirmButton(props); effects.splice(0).forEach(effect => effect()); };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== "object" ? [] : Array.isArray(root) ? root.flatMap(node => nodes(node)) : [root, ...nodes(root.props?.children)];
  const text = (root: any): string => root == null || typeof root === "boolean" ? "" : typeof root !== "object" ? String(root) : Array.isArray(root) ? root.map(text).join("") : text(root.props?.children);
  const button = (label: string) => { const node = nodes().find(node => node.type === "button" && text(node) === label); assert.ok(node, `Missing button ${label}`); return node; };
  const click = (label: string) => { const node = button(label); assert.ok(!node.props.disabled, `${label} disabled`); node.props.onClick(); render(); };
  return { props, render, flush, button, click, nodes, posts, text: () => text(tree), refreshes: () => refreshes };
}
async function main() {
  const f = fixture(); f.render(); assert.equal(f.button("Send signed packet to firm").props.disabled, true); await f.flush();
  f.click("Send signed packet to firm"); assert.equal(f.posts.length, 0); assert.match(f.text(), /firm@example.test.*copy@example.test/);
  f.click("Go back"); assert.equal(f.posts.length, 0); assert.ok(!f.nodes().some(node => node.props?.["aria-label"] === "Confirm firm delivery"));
  f.click("Send signed packet to firm");
  const send = f.button("Confirm & send").props.onClick; send(); send(); await f.flush();
  assert.equal(f.posts.length, 1, "Double tap dispatches once");
  assert.deepEqual(f.posts[0].body, { lead_id: "test-lead", claim_id: "test-matter", force: false, expected_to: "firm@example.test", expected_cc: ["copy@example.test"] });
  assert.equal(f.button("Already sent to firm").props.disabled, true); assert.equal(f.refreshes(), 1); assert.match(f.text(), /2 attachments/);
  for (const options of [{ sent: true }, { uncertain: true }]) { const blocked = fixture(options); blocked.render(); await blocked.flush(); assert.equal(blocked.button(options.sent ? "Already sent to firm" : "Send signed packet to firm").props.disabled, true); assert.equal(blocked.posts.length, 0); }
  const missing = fixture({ recipient: "" }); missing.render(); await missing.flush(); missing.click("Send signed packet to firm"); assert.equal(missing.button("Confirm & send").props.disabled, true); assert.equal(missing.posts.length, 0);
  const failed = fixture({ failed: true }); failed.render(); await failed.flush(); failed.click("Send signed packet to firm"); failed.click("Confirm & send"); await failed.flush(); assert.match(failed.text(), /Synthetic delivery failure/); assert.equal(failed.refreshes(), 0); assert.ok(!failed.text().includes("Already sent"));
  const changed = fixture(); changed.render(); await changed.flush(); changed.click("Send signed packet to firm"); changed.props.claimId = "other-matter"; changed.render(); await changed.flush(); assert.ok(!changed.nodes().some(node => node.props?.["aria-label"] === "Confirm firm delivery")); assert.equal(changed.posts.length, 0);
  assert.match(source, /SendToFirmButton key=\{`\$\{lead\.id\}:\$\{activeClaimId\}`\}/, "Switching lead or matter remounts the action and isolates in-flight UI state");
  console.log("Owner delivery: inline review/cancel, recipient review, duplicate tap, sent/uncertain/missing recipient guards, failure and matter isolation passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
