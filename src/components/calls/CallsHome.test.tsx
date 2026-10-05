import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as deskTypes from "../../lib/mva-call/desk-types";
import * as callNowSort from "../../lib/mva-call/call-now-sort";

const source = fs.readFileSync(path.join(__dirname, "CallsHome.tsx"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const modules: Record<string, any> = {
  react: React, "react/jsx-runtime": jsx, "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) },
  "@/lib/supabase-browser": { supabaseBrowser: () => { throw new Error("Unexpected browser database access"); } },
  "@/lib/mva-call/links": { APP_KINDS: [{ key: "mva", label: "INNO MVA" }] }, "@/lib/mva-call/desk-types": deskTypes,
  "@/lib/mva-call/call-now-sort": callNowSort,
};
const component: any = {};
new Function("require", "exports", code)((name: string) => { assert.ok(name in modules, `Unexpected client import ${name}`); return modules[name]; }, component);
const queues = { due: [], wait: [], callbacks: [], sent: [], signed: [], wip: [], review: [] };
const data = { me: { name: "Synthetic Agent", role: "agent" }, campaigns: [], queues, texts: [{ id: "text-file", name: "Reply" }], setup: [], notes: [] };
const html = renderToStaticMarkup(jsx.jsx(component.default, { data }));
const nav = html.match(/<nav[^>]*aria-label="Lists"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || "";
assert.equal((nav.match(/<button/g) || []).length, 7);
for (const [, label] of deskTypes.DESK_TABS) assert.ok(nav.includes(label), label);
assert.doesNotMatch(nav, /Texts|Review signed|Recent|Done/);
assert.match(html, />Texts \(1\)<\/button>/);
assert.match(html, /No files are waiting for their next call/);
const signed = renderToStaticMarkup(jsx.jsx(component.default, { data: { ...data, queues: { ...queues, signed: [{ id: "signed", name: "Signed caller", tag: "Office step pending", href: "/app/signed?claim=exact" }] } } }));
assert.match(signed, /Signed caller/); assert.match(signed, /Office step pending/);
assert.match(signed, /Signed files stay here until delivered or closed/);
// Render the New call sheet open, then verify its separate signed-transfer choice.
let hook = 0;
const openSheetReact = { ...React, useState: (initial: any) => {
  hook++;
  return [hook === 5 ? true : typeof initial === "function" ? initial() : initial, () => {}];
} };
const openSheetModule: any = {};
new Function("require", "exports", code)((name: string) => name === "react" ? openSheetReact : modules[name], openSheetModule);
const withNetfly = renderToStaticMarkup(jsx.jsx(openSheetModule.default, { data: { ...data, netflyAvailable: true } }));
assert.match(withNetfly, /NETFLY ONTAKE/);
assert.match(withNetfly, /Already signed/);
hook = 0;
const withoutNetfly = renderToStaticMarkup(jsx.jsx(openSheetModule.default, { data }));
assert.doesNotMatch(withoutNetfly, /NETFLY ONTAKE/);
console.log("ok Desk renders due, wait, review and signed queues with Texts reachable separately");
hook = 0;
const searchReact = { ...React, useState: (initial: any) => {
  hook++;
  return [hook === 2 ? "TEST" : hook === 3 ? [{ id: "test", claimant_name: "TEST signed file", status: "delivered", status_label: "Signed — sent to firm" }] : typeof initial === "function" ? initial() : initial, () => {}];
} };
const searchModule: any = {};
new Function("require", "exports", code)((name: string) => name === "react" ? searchReact : modules[name], searchModule);
const searchHtml = renderToStaticMarkup(jsx.jsx(searchModule.default, { data }));
assert.match(searchHtml, /Signed — sent to firm/); assert.doesNotMatch(searchHtml, />Delivered</);
console.log("ok Desk search renders the confirmed matter status from the server");
