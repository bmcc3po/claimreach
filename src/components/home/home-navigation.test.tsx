import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FakeDb } from "../../lib/test-fake-db";
import * as links from "../../lib/mva-call/links";
import * as statuses from "../../lib/statuses";
import * as officeClock from "../../lib/office-clock";
import * as caseNames from "../../lib/case-name";
import * as workArea from '../../lib/work-area';
import { pilotStaffPageAllowed } from "../../lib/inno-pilot-access";

const stamp = "2026-01-01T00:00:00Z";
const lead: any = { id: "lead", lead_no: "TMP-SYNTHETIC", campaign_id: "inno", claimant_name: "Synthetic Caller", phone: "2025550100", case_type: "mva", updated_at: stamp, created_at: stamp, archived_at: null };
const sibling = { id: "outside", campaign_id: "other", status: "retained" };
const claim: any = { id: "exact-inno-claim", claim_type: 'mva', lead_id: lead.id, campaign: "INNO MVA", campaign_id: "inno", status: "signed_grievous", updated_at: stamp, supervisor_flag: true, tier_letter: "A", leads: { lead_no: lead.lead_no, claimant_name: lead.claimant_name, archived_at: null } };
lead.claims = [sibling, claim];
function dbFor(role: string) {
  return new FakeDb({ app_users: [{ id: "operator", role, full_name: "Synthetic Operator" }], campaigns: [{ id: "inno", name: "INNO MVA", case_type: "mva", active: true, firms: { slug: "tmp" } }],
    leads: [lead], claims: [claim], statuses: statuses.DEFAULT_STATUSES, boards: [], bulletins: [] });
}
const alert = { kind: "signed_unreviewed", lead_id: lead.id, lead_no: lead.lead_no, title: "Signed — Synthetic Caller", hours: 28, severity: "bad" };
const load = (file: string, mods: Record<string, any>) => {
  const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: any = {};
  new Function("require", "exports", code)((name: string) => { assert.ok(name in mods, `Unexpected import ${name}`); return mods[name]; }, exports);
  return exports.default;
};
const View = load("HomeView.tsx", { react: React, "react/jsx-runtime": jsx, "@/components/ui/Icon": { default: () => null }, "@/lib/case-name": caseNames });
async function main() {
  for (const role of ["agent", "qa", "manager", "admin", "owner"]) {
    const db = dbFor(role);
    const Page = load("../../app/(internal)/dashboard/page.tsx", {
      "react/jsx-runtime": jsx, "next/navigation": { redirect: () => { throw new Error("Unexpected redirect"); } },
      "@/lib/supabase-server": { supabaseServer: async () => db }, "@/lib/auth-user": { authUser: async () => ({ data: { user: { id: "operator" } } }) },
      "@/lib/alerts": { computeAlerts: async () => [alert] }, "@/lib/statuses": statuses, "@/lib/case-name": caseNames,
      "@/lib/mva-call/links": links, "@/components/home/HomeView": { default: View },
      "@/lib/office-clock": officeClock,
      '@/lib/work-area': workArea,
    });
    const tree = await Page({ searchParams: Promise.resolve({}) }), data = tree.props.data;
    const html = renderToStaticMarkup(tree);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"));
    if (role === "owner") {
      assert.equal(data.links.add, "/intake"); assert.equal(data.links.all, "/leads"); assert.equal(data.links.signed, "/signed");
      assert.ok(data.needs.every((row: any) => row.href.startsWith("/leads/")));
      assert.match(html, /All leads/);
    } else {
      for (const href of hrefs.filter(href => !href.startsWith("#"))) assert.ok(pilotStaffPageAllowed(new URL(href, "https://example.invalid").pathname), `${role}: ${href}`);
      assert.equal(data.links.add, "/app?new=1"); assert.equal(data.links.signed, "/app?tab=signed");
      assert.equal(data.recent[0].href, "/app/TMP-SYNTHETIC?claim=exact-inno-claim&review=1");
      assert.equal(data.recent[0].status, "Signed: Finish intake", "the displayed status and link use the same claim, not its sibling");
      for (const row of data.needs) assert.equal(row.href, "/app/TMP-SYNTHETIC?claim=exact-inno-claim&review=1");
      assert.match(html, /Desk queues/); assert.doesNotMatch(html, /href="\/(?:leads|signed|intake)(?:[?/"])/);
    }
  }
  console.log("ok actual dashboard page and rendered controls keep all staff roles within Desk routes and exact INNO claim; owner routes preserved");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
