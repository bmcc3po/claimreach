import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "ImportedPacketHandoff.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture({ failed = false, pending = false, confirmed = true, ownerSent = false, wrongMatter = false } = {}) {
  let cursor = 0, tree: any, delivered = false;
  const slots: any[] = [], effects: Array<() => void> = [], posts: any[] = [];
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v: any) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect(effect: () => void, deps: any[]) { const i = cursor++, prev = slots[i]; if (!prev || deps.some((v, j) => !Object.is(v, prev[j]))) { slots[i] = deps; effects.push(effect); } },
  };
  const exports: any = {};
  const fakeFetch = async (url: string, options: any = {}) => {
    if (options.method === "POST") {
      posts.push(JSON.parse(options.body));
      if (failed) return { ok: false, json: async () => ({ error: "Synthetic delivery failed" }) };
      delivered = true; return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => url.startsWith("/api/imported-packet") ? {
      documents: [{ id: "original", name: "NONBINDING.pdf", kind: "retainer", url: "/synthetic.pdf" }], status: "external_signed_review", source_signed_at: "2026-10-01T12:00:00Z",
    } : { claim_id: wrongMatter ? "other-matter" : "test-claim", confirmed_firm_sent_at: delivered && confirmed ? "2026-10-01T12:00:00Z" : null,
      owner_confirmed_delivery: ownerSent, dispatch: pending ? { state: "uncertain" } : null,
      delivery: { to: "firm@example.test", owner_email: "owner@example.test", cc: "copy@example.test" } } };
  };
  new Function("require", "exports", "fetch", "window", code)((id: string) => {
    if (id === "react") return hooks;
    if (id === "react/jsx-runtime") return jsx;
    if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    if (id.endsWith(".css")) return {};
    throw new Error(`Unexpected import ${id}`);
  }, exports, fakeFetch, { confirm() { throw new Error("Native confirmation must not open"); } });
  const render = () => { cursor = 0; tree = exports.default({ leadId: "test-lead", claimId: "test-claim" }); effects.splice(0).forEach(f => f()); };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  const nodes = (r: any = tree): any[] => !r || typeof r !== "object" ? [] : Array.isArray(r) ? r.flatMap(n => nodes(n ?? null)) : [r, ...nodes(r.props?.children ?? null)];
  const text = (r: any): string => r == null || typeof r === "boolean" ? "" : typeof r !== "object" ? String(r) : Array.isArray(r) ? r.map(text).join("") : text(r.props?.children);
  const button = (label: string) => { const node = nodes().find(n => n.type === "button" && text(n) === label); assert.ok(node, `Missing ${label}`); return node; };
  const click = (label: string) => { const n = button(label); assert.ok(!n.props.disabled); n.props.onClick(); render(); };
  const prepare = async () => { render(); await flush(); for (const link of nodes().filter(n => n.type === "a")) { link.props.onClick({ preventDefault() {} }); render(); } for (let i = 0; i < 4; i++) { nodes().filter(n => n.type === "input" && n.props.type === "checkbox")[i].props.onChange(); render(); } };
  return { render, flush, nodes, button, click, prepare, posts, text: () => text(tree) };
}

async function main() {
  const missing = fixture(); missing.render(); await missing.flush(); missing.click("Send file to firm →");
  assert.match(missing.text(), /Open the intake and every original PDF/); assert.equal(missing.posts.length, 0);
  const f = fixture(); await f.prepare(); f.click("Send file to firm →");
  assert.equal(f.posts.length, 0); assert.match(f.text(), /firm@example.test.*owner@example.test.*copy@example.test/);
  f.click("Go back"); assert.equal(f.posts.length, 0); f.click("Send file to firm →");
  f.nodes().find(n => n.type === "input" && n.props.placeholder).props.onChange({ target: { value: "extra@example.test" } }); f.render();
  assert.ok(!f.nodes().some(n => n.props?.["aria-label"] === "Confirm imported packet delivery"));
  f.click("Send file to firm →"); assert.match(f.text(), /extra@example.test/);
  const send = f.button("Confirm & send").props.onClick; send(); send(); await f.flush(); await f.flush();
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].claim_id, "test-claim"); assert.equal(f.posts[0].expected_to, "firm@example.test"); assert.deepEqual(f.posts[0].additional_recipients, ["extra@example.test"]);
  assert.match(f.text(), /Firm delivery confirmed/); assert.ok(!f.text().includes("Ready for billing"));
  const failed = fixture({ failed: true }); await failed.prepare(); failed.click("Send file to firm →"); failed.click("Confirm & send"); await failed.flush(); await failed.flush();
  assert.match(failed.text(), /Synthetic delivery failed/); assert.ok(failed.button("Send file to firm →")); assert.ok(!failed.text().includes("Firm delivery confirmed"));
  const uncertain = fixture({ pending: true }); await uncertain.prepare(); assert.equal(uncertain.button("Send file to firm →").props.disabled, true);
  const unconfirmed = fixture({ confirmed: false }); await unconfirmed.prepare(); unconfirmed.click("Send file to firm →"); unconfirmed.click("Confirm & send"); await unconfirmed.flush(); await unconfirmed.flush(); assert.ok(!unconfirmed.text().includes("Firm delivery confirmed"));
  const prior = fixture({ ownerSent: true }); prior.render(); await prior.flush(); assert.match(prior.text(), /Do not send it again/); assert.equal(prior.posts.length, 0);
  const wrong = fixture({ wrongMatter: true }); wrong.render(); await wrong.flush(); assert.match(wrong.text(), /Could not confirm this matter/); assert.equal(wrong.posts.length, 0);
  console.log("Imported handoff: review gates, inline recipients, cancel, edits, single send, failed/uncertain/confirmed readback and matter isolation passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
