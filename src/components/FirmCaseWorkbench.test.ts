import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { statusLabel } from "../lib/statuses";

// Execute the actual server component, with only its client document loader
// replaced. Pending/no-matter pages must never mount a loader or action.
const jsx = (type: any, props: any, key?: string) => ({ type, props, key });
const modules: Record<string, any> = {
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "./CaseDocuments": { default: "Documents" },
  "@/lib/statuses": { statusLabel },
};
const source = fs.readFileSync(path.join(__dirname, "FirmCaseWorkbench.tsx"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exp: any = {};
new Function("require", "exports", js)((name: string) => { assert.ok(name in modules, name); return modules[name]; }, exp);
function nodes(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
const lead = { id: "file", lead_no: "TEST-1", claimant_name: "Synthetic client", stage: "DEAD" };
const claim = { id: "released-matter", claim_type: "MVA", status: "delivered" };
for (const props of [{ lead, claim, locked: true }, { lead }]) {
  const tree = exp.default(props);
  assert.ok(!nodes(tree).some(n => n.type === "Documents"));
  assert.ok(JSON.stringify(tree).includes("Awaiting file review"));
}
const tree = exp.default({ lead, claim });
const docs = nodes(tree).filter(n => n.type === "Documents");
assert.equal(docs.length, 1);
assert.deepEqual(docs[0].props, { leadId: lead.id, claimId: claim.id, readOnly: true });
assert.equal(docs[0].key, claim.id);
assert.ok(JSON.stringify(tree).includes("Delivered to Firm"));
assert.ok(!JSON.stringify(tree).includes("DEAD"));
assert.ok(!nodes(tree).some(n => ["select", "textarea", "input"].includes(n.type)));
assert.ok(!nodes(tree).some(n => Object.keys(n.props || {}).some(k => k.startsWith("on"))));
assert.ok(!nodes(tree).some(n => String(n.props?.href || "").startsWith("/api/")));
console.log("PASS locked and missing matters cannot mount documents");
console.log("PASS released documents keep exact matter and read-only mode");
console.log("PASS status uses selected matter; no legacy stage or lead-wide actions");
