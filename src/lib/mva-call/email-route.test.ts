// Actual manual email route with synthetic matter, PDF and mail boundaries.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { FakeDb } from "../test-fake-db";

globalThis.fetch = async () => { throw Error("Network forbidden"); };
const L = "10000000-0000-4000-8000-000000000001";
const C = "20000000-0000-4000-8000-000000000001";
function makeRoute(intakeAvailable = true) {
  const db = new FakeDb({
    leads: [{ id: L, claimant_name: "Synthetic PNC", lead_no: "TEST-1", firm_id: "firm", campaign_id: "campaign" }],
    claims: [{ id: C, lead_id: L, claim_type: "mva", firm_id: "firm", campaign_id: "campaign", answers: { mva_call: { story: { text: "SYNTHETIC_INTAKE" } } } }],
    intake_calls: [{ id: "call", lead_id: L, claim_id: C, answers: { story: { text: "SYNTHETIC_INTAKE" } } }],
  });
  const sent: any[] = [];
  const agreement = { id: "agreement", status: "completed", completed_pdf_path: "private/synthetic.pdf" };
  const mods: Record<string, any> = {
    "next/server": { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/lead-key": { leadKeyOf: () => "TEST-1" },
    "@/lib/supabase-server": { supabaseServer: async () => db, supabaseAdmin: () => db },
    "@/lib/mva-call/server": { requireStaff: async () => ({ id: "owner", name: "Synthetic Owner" }) },
    "@/lib/gate": { requirePerm: async () => ({ ok: true }) },
    "@/lib/mva-call/report": { caseReport: () => ({ name: "Synthetic PNC", agreement: { signed: true, hasPdf: true } }),
      caseReportHtml: (_report: any, opts: any) => `BODY ${opts.note}`, caseReportText: () => "INTAKE BODY" },
    "@/lib/intake-render": { loadIntakeBundle: async (_sb: any, leadId: string, claimId: string) => {
      assert.equal(leadId, L); assert.equal(claimId, C);
      if (!intakeAvailable) throw Error("synthetic PDF failure");
      return { lead: db.tables.leads[0], claim: db.tables.claims[0] };
    }, hasIntakeQuestions: () => true,
      buildIntakePdfAttachment: async () => ({ filename: "Synthetic_PNC_intake.pdf", content: "JVBERi0=" }) },
    "@/lib/signed-docs": { signedPdfAttachment: async () => ({ file: { filename: "Synthetic_PNC_signed.pdf", content: "JVBERi0=" } }) },
    "@/lib/email": { sendEmail: async (mail: any) => { sent.push(mail); return { ok: true }; } },
    "@/lib/audit": { recordAudit: async () => {} },
    "@/lib/mva-call/signing-matter": { resolveSigningMatter: async () => ({ ok: true, lead: db.tables.leads[0],
      matter: { claim: db.tables.claims[0] }, campaignId: "campaign" }),
      getMatterAgreement: async () => ({ ok: true, row: agreement }), getMatterEmergency: async () => ({ ok: true, row: null }),
      agreementIsVoided: () => false, emergencySupersedes: () => false },
    "@/lib/matter": { matterRowsFilter: () => `claim_id.eq.${C}` },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../../app/api/calls/email/route.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const route: any = {};
  new Function("require", "exports", code)((id: string) => { if (!(id in mods)) throw Error(`Unstubbed ${id}`); return mods[id]; }, route);
  return { sent, post: () => route.POST({ url: "https://synthetic.invalid/api/calls/email", json: async () => ({ lead_id: L, claim_id: C, to: "owner@example.invalid", attach: true }) }) };
}

async function main() {
  const good = makeRoute();
  const result = await good.post();
  assert.equal(result.status, 200);
  assert.equal(result.body.intake_pdf_attached, true);
  assert.deepEqual(good.sent[0].attachments.map((a: any) => a.filename), ["Synthetic_PNC_intake.pdf", "Synthetic_PNC_signed.pdf"]);
  assert.match(good.sent[0].html, /intake is in the email body and attached as a PDF/);
  assert.match(good.sent[0].text, /INTAKE BODY/);
  const failed = makeRoute(false);
  const failResult = await failed.post();
  assert.equal(failResult.status, 503);
  assert.equal(failed.sent.length, 0);
  assert.match(failResult.body.error, /Nothing was emailed/);
  console.log("2 manual case-email scenarios passed");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
