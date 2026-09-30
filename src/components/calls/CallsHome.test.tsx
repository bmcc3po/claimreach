import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as deskTypes from "../../lib/mva-call/desk-types";

const source = fs.readFileSync(path.join(__dirname, "CallsHome.tsx"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const modules: Record<string, any> = {
  react: React, "react/jsx-runtime": jsx, "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) },
  "@/lib/supabase-browser": { supabaseBrowser: () => { throw new Error("Unexpected browser database access"); } },
  "@/lib/mva-call/links": { APP_KINDS: [{ key: "mva", label: "INNO MVA" }] }, "@/lib/mva-call/desk-types": deskTypes,
};
const component: any = {};
new Function("require", "exports", code)((name: string) => { assert.ok(name in modules, `Unexpected client import ${name}`); return modules[name]; }, component);
const queues = { new: [], calling: [], callbacks: [], sent: [], signed: [], wip: [] };
const data = { me: { name: "Synthetic Agent", role: "agent" }, campaigns: [], queues, texts: [{ id: "text-file", name: "Reply" }], setup: [], notes: [] };
const html = renderToStaticMarkup(jsx.jsx(component.default, { data }));
const nav = html.match(/<nav[^>]*aria-label="Lists"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || "";
assert.equal((nav.match(/<button/g) || []).length, 6);
for (const [, label] of deskTypes.DESK_TABS) assert.ok(nav.includes(label), label);
assert.doesNotMatch(nav, /Texts|Review signed|Recent|Done/);
assert.match(html, />Texts \(1\)<\/button>/);
assert.match(html, /No new files/);
const signed = renderToStaticMarkup(jsx.jsx(component.default, { data: { ...data, queues: { ...queues, signed: [{ id: "signed", name: "Signed caller", tag: "Office step pending", href: "/app/signed?claim=exact" }] } } }));
assert.match(signed, /Signed caller/); assert.match(signed, /Office step pending/);
assert.match(signed, /Signed files stay here until delivered or closed/);
console.log("ok Desk renders exactly six primary queues with Texts reachable separately and signed office work visible");
