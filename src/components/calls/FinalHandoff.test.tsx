import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

// Exercise the actual component's event handlers and asynchronous requests. A
// minimal hook scheduler replaces the DOM; provider calls remain synthetic.
const source = fs.readFileSync(path.join(__dirname, "FinalHandoff.tsx"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture({ failed = false, pending = false, confirmed = true, ownerSent = false } = {}) {
  let cursor = 0;
  const slots: any[] = [], effects: Array<() => void> = [], posts: any[] = [];
  let delivered = false, tree: any;
  const props: any = { leadId: "test-lead", claimId: "test-claim", missing: [] };
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value: any) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial: any) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect(effect: () => void, deps: any[]) {
      const i = cursor++, before = slots[i];
      if (!before || deps.some((value, j) => !Object.is(value, before[j]))) { slots[i] = deps; effects.push(effect); }
    },
  };
  const exports: any = {};
  const fakeFetch = async (url: string, options: any = {}) => {
    if (options.method === "POST") {
      posts.push({ url, body: JSON.parse(options.body) });
      if (failed) return { ok: false, json: async () => ({ error: "Synthetic QA failure" }) };
      if (url === "/api/firm-delivery") delivered = true;
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => url.startsWith("/api/calls/file") ? {
      agreements: [{ status: "completed", pax: null, signed_url: "/test-packet" }],
    } : {
      claim_id: "test-claim", confirmed_firm_sent_at: delivered && confirmed ? "2026-10-04T12:00:00Z" : null,
      owner_confirmed_delivery: ownerSent,
      qa_approved: false, dispatch: pending ? { state: "uncertain" } : null,
      delivery: { to: "firm@example.test", owner_email: "owner@example.test", cc: "copy@example.test" },
    } };
  };
  new Function("require", "exports", "fetch", "window", "CustomEvent", "setTimeout", "clearTimeout", code)((id: string) => {
    if (id === "react") return hooks;
    if (id === "react/jsx-runtime") return jsx;
    if (id === "@/lib/office-clock") return { officeDateTime: (value: string) => value };
    if (["./OwnerFirmDownload", "./FinishFileSteps", "./FileQaCheck"].includes(id)) return { default: () => null };
    throw new Error(`Unexpected import ${id}`);
  }, exports, fakeFetch, { dispatchEvent() {}, confirm() { throw new Error("Native confirmation must never open"); } }, class { constructor(..._args: any[]) {} }, () => 0, () => {});
  const render = () => { cursor = 0; tree = exports.default(props); effects.splice(0).forEach(effect => effect()); return tree; };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== "object" ? [] : Array.isArray(root) ? root.flatMap(node => nodes(node ?? null)) : [root, ...nodes(root.props?.children ?? null)];
  const text = (root: any): string => root == null || typeof root === "boolean" ? "" : typeof root !== "object" ? String(root) : Array.isArray(root) ? root.map(text).join("") : text(root.props?.children);
  const button = (label: string) => { const node = nodes().find(node => node.type === "button" && text(node) === label); assert.ok(node, `Missing button ${label}`); return node; };
  const click = (label: string) => { const node = button(label); assert.ok(!node.props.disabled, `${label} disabled`); const result = node.props.onClick(); render(); return result; };
  const prepare = async () => {
    render(); await flush();
    click("1. Review intake PDF Open PDF"); click("Back to file review");
    click("2. Review signed retainer + HIPAA/HITECH Open PDF"); click("Back to file review");
    for (let n = 0; n < 3; n++) { nodes().filter(node => node.type === "input" && node.props.type === "checkbox")[n].props.onChange(); render(); }
  };
  return { props, posts, render, flush, nodes, text: () => text(tree), button, click, prepare };
}

async function main() {
  const historical = fixture({ ownerSent: true }); historical.render(); await historical.flush();
  assert.match(historical.text(), /owner confirmed this file was already sent/);
  assert.match(historical.text(), /return window cannot be calculated/);
  assert.ok(!historical.nodes().some(node => node.type === "button" && String(node.props.children).includes("Send file")));
  assert.equal(historical.posts.length, 0);
  const f = fixture(); await f.prepare();
  f.click("Send file to firm →");
  assert.equal(f.posts.length, 0, "Reviewing recipients never submits QA or sends email");
  assert.match(f.text(), /firm@example.test.*owner@example.test.*copy@example.test/);
  assert.ok(f.nodes().some(node => node.props?.["aria-label"] === "Confirm firm delivery"));
  f.click("Go back"); assert.equal(f.posts.length, 0);
  f.click("Send file to firm →");
  f.nodes().find(node => node.type === "input" && node.props.type === "text").props.onChange({ target: { value: "extra@example.test" } }); f.render();
  assert.ok(!f.nodes().some(node => node.props?.["aria-label"] === "Confirm firm delivery"), "Edited recipient requires another review");
  f.click("Send file to firm →"); assert.match(f.text(), /extra@example.test/);
  const confirm = f.button("Confirm & send").props.onClick;
  confirm(); confirm(); await f.flush(); await f.flush();
  assert.deepEqual(f.posts.map(post => post.url), ["/api/calls/qa/ready", "/api/firm-delivery"], "Rapid double click produces one QA and one delivery request");
  assert.equal(f.posts[1].body.claim_id, "test-claim");
  assert.equal(f.posts[1].body.expected_to, "firm@example.test");
  assert.deepEqual(f.posts[1].body.additional_recipients, ["extra@example.test"]);
  assert.match(f.text(), /Sent to firm/);

  const missing = fixture(); await missing.prepare(); missing.click("Send file to firm →");
  missing.props.missing = [{ label: "Missing answer", go() {} }]; missing.render();
  assert.equal(missing.button("Confirm & send").props.disabled, true); assert.equal(missing.posts.length, 0);

  const failed = fixture({ failed: true }); await failed.prepare(); failed.click("Send file to firm →"); failed.click("Confirm & send"); await failed.flush(); await failed.flush();
  assert.equal(failed.posts.length, 1); assert.match(failed.text(), /Synthetic QA failure/);
  assert.ok(!failed.nodes().some(node => node.type === "h2" && node.props.children === "Sent to firm"));
  assert.ok(failed.button("Send file to firm →"));

  const uncertain = fixture({ pending: true }); await uncertain.prepare();
  assert.equal(uncertain.button("Send file to firm →").props.disabled, true); assert.equal(uncertain.posts.length, 0);

  const unconfirmed = fixture({ confirmed: false }); await unconfirmed.prepare(); unconfirmed.click("Send file to firm →"); unconfirmed.click("Confirm & send"); await unconfirmed.flush(); await unconfirmed.flush();
  assert.ok(!unconfirmed.nodes().some(node => node.type === "h2" && node.props.children === "Sent to firm"), "Provider response alone cannot mark delivered without confirmed readback");
  console.log("Final handoff: inline review, cancel, edited recipients, single dispatch, validation, QA failure, uncertain hold and confirmed delivery readback passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
