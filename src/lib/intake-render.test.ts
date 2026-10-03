import assert from "node:assert/strict";
import { PDFDocument, PDFRawStream, PDFArray, decodePDFRawStream } from "pdf-lib";
import { intakeSections, buildIntakeCsvSingle, buildIntakePdf, buildIntakePdfAttachment, buildIntakeEmailHtml, loadIntakeBundle, type IntakeBundle } from "./intake-render";
import { caseReport } from "./mva-call/report";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as matter from "./matter";

// No network: load uses the synthetic DB below; PDF bytes stay in memory.
globalThis.fetch = async () => { throw new Error("network forbidden in intake render tests"); };
let count = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); count++; console.log("ok", name); };
const lead = { id: "1ead", firm_id: "firm", claimant_name: "Synthetic PNC", lead_no: "TEST-1", campaign_id: "campaign-A", campaign: "Sibling campaign", phone: "2025550142" };
const call = {
  phase: "file", story: { city: "Houston, TX", when: "Pick a date", date: "2026-09-01", seat: "Driver", fault: "Other driver", police: "Came out", text: "MVA_ONLY_SENTINEL" },
  body: { pain: ["Neck", "Back"], seen: ["ER"], providers: ["Synthetic Provider"], done: { pain: true, seen: true }, willing: "Yes", work: "Yes", exchanged: "Yes", coverage: "Full coverage", check: "No", rep: "No" },
  car: { justMe: true, people: [] }, file: { carrier: "State Farm", report: "TEST-REPORT", vYear: "2022", vMake: "Toyota", vModel: "Camry", ssn: "000001234", addr: "10 Test St, Houston, TX", dl: "SYNTHETIC-DL" },
};
const claim = { id: "bbb2", lead_id: lead.id, firm_id: "firm", campaign_id: "campaign-B", campaign: "MVA campaign", claim_type: "mva", answers: { mva_call: call } };
const bundle: IntakeBundle = { lead, claim, answers: claim.answers, caseType: "mva", fields: [] };

function db(rows: Record<string, any[]>) {
  return { from(table: string) {
    let filters: ((r: any) => boolean)[] = [];
    let selection: { count?: string; head?: boolean } = {};
    const result = () => {
      const matches = (rows[table] ?? []).filter((r) => filters.every((f) => f(r)));
      return { data: selection.head ? null : matches, error: null, count: selection.count === "exact" ? matches.length : null };
    };
    const q: any = { select: (_columns?: string, options?: typeof selection) => { selection = options ?? {}; return q; }, eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; }, order: () => q,
      maybeSingle: async () => ({ data: (rows[table] ?? []).find((r) => filters.every((f) => f(r))) ?? null, error: null }),
      then: (a: any, b: any) => Promise.resolve(result()).then(a, b) };
    return q;
  } };
}
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const texts: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
    for (const stream of streams) if (stream instanceof PDFRawStream) {
      const operators = new TextDecoder().decode(decodePDFRawStream(stream).decode());
      for (const match of operators.matchAll(/<([0-9A-Fa-f]+)>/g)) texts.push(Buffer.from(match[1], "hex").toString("latin1"));
    }
  }
  return texts.join(" ");
}
function exportRoute(sb: any, makePdf: (b: IntakeBundle) => Promise<Uint8Array>, user: any = { role: "owner", can: () => true }) {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/export/intake-pdf/route.ts"), "utf8");
  const mods: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, o: any = {}) => ({ body, status: o.status ?? 200 }) } },
    "@/lib/supabase-server": { supabaseServer: async () => sb },
    "@/lib/gate": { gateUser: async () => user },
    "@/lib/permissions": { isInternalRole: (role: string) => role !== "firm" }, "@/lib/matter": matter,
    "@/lib/intake-render": { loadIntakeBundle, buildIntakePdf: makePdf, hasIntakeQuestions: () => true },
  };
  const exp: any = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", code)((id: string) => { if (!(id in mods)) throw new Error(`unstubbed ${id}`); return mods[id]; }, exp);
  return exp;
}

(async () => {
  await t("NETFLY nested answers and source notes appear in the actual PDF, CSV and email", async () => {
    const answers = { netfly_secondary: { fields: { accident_date: '2026-09-04', police_report: 'NF-REPORT-1', treatment_location: 'Near work', final_notes: 'Call after 3 PM 🎈', first_visit_unavailable: 'Not available yet' },
      handoffs: [{ note: 'Client/Driver: Synthetic PNC\nInsurance: Both parties believed insured.\nInjuries & Treatment: Pain and appointment planned.' }] } };
    const netfly: IntakeBundle = { ...bundle, claim: { ...claim, campaign: 'NETFLY ONTAKE' }, answers };
    const csv = buildIntakeCsvSingle(netfly), html = buildIntakeEmailHtml(netfly), text = await pdfText(await buildIntakePdf(netfly));
    for (const output of [csv, html, text]) for (const value of ['NF-REPORT-1', 'Near work', 'Call after 3 PM', 'Both parties believed insured.', 'Pain and appointment planned.']) assert(output.includes(value), value);
    assert(text.includes('U+1F388'), 'unsupported pasted emoji does not block the PDF');
    assert(!csv.includes('MVA_ONLY_SENTINEL'), 'NETFLY never reads a different intake namespace');
  });
  await t("MVA questions/answers reuse the existing call report and never dump SSN", () => {
    assert.deepEqual(intakeSections(bundle), caseReport({ ...lead, campaign: claim.campaign }, call).sections);
    const csv = buildIntakeCsvSingle(bundle);
    for (const value of ["Houston, TX", "Neck, Back", "MVA_ONLY_SENTINEL", "MVA campaign", "State Farm", "TEST-REPORT", "2022", "Toyota", "Camry"]) assert.ok(csv.includes(value), value);
    assert.ok(!csv.includes("000001234")); assert.ok(!csv.includes("Sibling campaign"));
  });
  await t("actual PDF bytes include nested MVA values and exclude SSN", async () => {
    const text = await pdfText(await buildIntakePdf(bundle));
    assert.match(text, /Houston, TX/); assert.match(text, /Neck, Back/); assert.match(text, /MVA_ONLY_SENTINEL/);
    for (const value of ["State Farm", "TEST-REPORT", "2022", "Toyota", "Camry"]) assert.ok(text.includes(value), value);
    assert.ok(!text.includes("000001234"));
  });
  await t("email attachment contains the same PDF bytes and excludes SSN", async () => {
    const attachment = await buildIntakePdfAttachment(bundle);
    assert.equal(attachment.filename, "Synthetic_PNC_intake.pdf");
    const bytes = Buffer.from(attachment.content, "base64");
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const text = await pdfText(bytes);
    assert.match(text, /MVA_ONLY_SENTINEL/);
    assert.ok(!text.includes("000001234"));
  });
  await t("a moderately sized intake stays on one PDF page without losing answers", async () => {
    const fields = Array.from({ length: 16 }, (_, i) => ({ id: `q${i}`, kind: "text", label: `Question ${i + 1}` }));
    const answers = Object.fromEntries(fields.map((f, i) => [f.id, `Synthetic answer ${i + 1}`]));
    const bytes = await buildIntakePdf({ ...bundle, caseType: "other", fields, answers });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    const text = await pdfText(bytes);
    assert.match(text, /Synthetic answer 1/);
    assert.match(text, /Synthetic answer 16/);
  });
  await t("email body uses the same MVA answers and escapes claimant text", () => {
    const html = buildIntakeEmailHtml({ ...bundle, answers: { mva_call: { ...call, story: { ...call.story, text: "Crash <script>alert(1)</script>" } } } });
    assert.match(html, /Crash &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Houston, TX/);
    assert.ok(!html.includes("000001234"));
  });
  await t("generic form choice labels and lead fallback remain intact", () => {
    const csv = buildIntakeCsvSingle({ ...bundle, caseType: "other", answers: { answer: "yes_code" }, fields: [{ id: "answer", kind: "select", label: "Question", choices: [{ value: "yes_code", label: "Spoken yes" }] }, { id: "phone", kind: "phone", label: "Phone" }] });
    assert.match(csv, /Spoken yes/); assert.match(csv, /2025550142/); assert.ok(!csv.includes("MVA_ONLY_SENTINEL"));
  });
  await t("PDF route pins named claim B and reads nested MVA through session only", async () => {
    const sb = db({ leads: [lead], claims: [{ ...claim, id: "aaa1", campaign: "Wrong", campaign_id: "campaign-A", answers: { sibling: true } }, claim] });
    let rendered: IntakeBundle | null = null;
    const r = await exportRoute(sb, async (b) => { rendered = b; return new Uint8Array([1]); }).GET({ url: `https://synthetic.invalid/api/export/intake-pdf?lead_id=${lead.id}&claim_id=${claim.id}` });
    assert.equal(r.status, 200); assert.equal(rendered!.claim.id, claim.id); assert.equal(rendered!.answers.mva_call.story.text, "MVA_ONLY_SENTINEL");
  });
  await t("PDF route rejects a named claim belonging to another person before rendering", async () => {
    const sb = db({ leads: [lead], claims: [{ ...claim, lead_id: "other-person" }] });
    let rendered = false;
    const r = await exportRoute(sb, async () => { rendered = true; return new Uint8Array(); }).GET({ url: `https://synthetic.invalid/api/export/intake-pdf?lead_id=${lead.id}&claim_id=${claim.id}` });
    assert.notEqual(r.status, 200); assert.equal(rendered, false);
  });
  await t("agent without bulk-export permission can review only an explicit visible matter", async () => {
    const sb = db({ leads: [lead], claims: [claim] });
    const agent = { role: "agent", can: (permission: string) => permission === "intake.fill" };
    const route = exportRoute(sb, async () => new Uint8Array([1]), agent);
    const prefix = `https://synthetic.invalid/api/export/intake-pdf?lead_id=${lead.id}`;
    const preview = await route.GET({ url: `${prefix}&claim_id=${claim.id}&preview=1` });
    assert.equal(preview.status, 200); assert.match(preview.headers.get("Content-Disposition"), /^inline/);
    assert.equal((await route.GET({ url: `${prefix}&claim_id=${claim.id}` })).status, 403);
    assert.equal((await route.GET({ url: `${prefix}&preview=1` })).status, 403);
    assert.notEqual((await route.GET({ url: `${prefix}&claim_id=someone-else&preview=1` })).status, 200);
    assert.equal((await exportRoute(db({ leads: [], claims: [claim] }), async () => { throw Error("must not render"); }, agent).GET({ url: `${prefix}&claim_id=${claim.id}&preview=1` })).status, 404);
  });
  await t("firm, deactivated and denied agents cannot use the review exception", async () => {
    for (const user of [null, { role: "firm", can: () => true }, { role: "agent", can: () => false }]) {
      const r = await exportRoute(db({ leads: [lead], claims: [claim] }), async () => { throw Error("must not render"); }, user).GET({ url: `https://synthetic.invalid/api/export/intake-pdf?lead_id=${lead.id}&claim_id=${claim.id}&preview=1` });
      assert.equal(r.status, user ? 403 : 401);
    }
  });
  console.log(`${count} passed`);
})().catch((e) => { console.error(e); process.exitCode = 1; });

