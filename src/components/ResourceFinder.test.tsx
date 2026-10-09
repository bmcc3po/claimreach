import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "ResourceFinder.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture(initial: "ok" | "empty" | "server" | "html" | "network", address = "Synthetic City") {
  let cursor = 0, tree: any, mode = initial;
  const slots: any[] = [], requests: any[] = [];
  const hooks = {
    useState(v: any) { const i = cursor++; if (!(i in slots)) slots[i] = v; return [slots[i], (n: any) => { slots[i] = typeof n === "function" ? n(slots[i]) : n; }]; },
    useRef(v: any) { const i = cursor++; return slots[i] ||= { current: v }; },
  };
  const exports: any = {};
  new Function("require", "exports", "fetch", code)((id: string) => id === "react" ? hooks : id === "react/jsx-runtime" ? jsx : { default: "PlaceField" }, exports, async (_url: string, init: any) => {
    requests.push(JSON.parse(init.body)); if (mode === "network") throw new TypeError("Failed to fetch");
    return { ok: mode !== "server", json: async () => { if (mode === "html") throw new SyntaxError("HTML"); return mode === "server" ? { error: "Synthetic service unavailable" } : { results: mode === "empty" ? [] : [{ place_id: "synthetic", name: "Synthetic resource", address }] }; } };
  });
  const render = () => { cursor = 0; tree = exports.default({ defaultAddress: address }); };
  const nodes = (r: any = tree): any[] => !r || typeof r !== "object" ? [] : Array.isArray(r) ? r.flatMap(n => nodes(n ?? null)) : [r, ...nodes(r.props?.children ?? null)];
  const text = (r: any = tree): string => r == null || typeof r === "boolean" ? "" : typeof r !== "object" ? String(r) : Array.isArray(r) ? r.map(n => text(n ?? null)).join("") : text(r.props?.children ?? null);
  const button = (label: string) => { const node = nodes().find(n => n.type === "button" && text(n) === label); assert.ok(node, `Missing ${label}`); return node; };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); return { render, nodes, text, button, flush, requests, mode: (v: typeof mode) => { mode = v; } };
}
async function main() {
  for (const mode of ["server", "html", "network"] as const) {
    const f = fixture(mode); f.button("Search").props.onClick(); f.render(); await f.flush();
    assert.ok(f.nodes().some(n => n.props?.role === "alert")); assert.equal(f.button("Search").props.disabled, false);
    assert.equal(f.nodes().find(n => n.type === "PlaceField").props.value, "Synthetic City");
    f.mode("ok"); f.button("Search").props.onClick(); await f.flush(); assert.match(f.text(), /Synthetic resource/); assert.ok(!f.nodes().some(n => n.props?.role === "alert"));
  }
  const blank = fixture("ok", ""); blank.button("Search").props.onClick(); blank.render(); assert.equal(blank.requests.length, 0); assert.match(blank.text(), /Enter an address/);
  const empty = fixture("empty"); empty.button("Search").props.onClick(); await empty.flush(); assert.match(empty.text(), /No resources found here/);
  const double = fixture("ok"), search = double.button("Search").props.onClick; search(); search(); await double.flush(); assert.equal(double.requests.length, 1);
  console.log("Resource search: empty address, real empty results, server/network/malformed failure, retained location, retry and duplicate taps passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
