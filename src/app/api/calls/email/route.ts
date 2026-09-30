import { NextRequest, NextResponse } from "next/server";
import { leadKeyOf } from "@/lib/lead-key";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { caseReport, caseReportHtml, caseReportText } from "@/lib/mva-call/report";
import { signedPdfAttachment } from "@/lib/signed-docs";
import { loadIntakeBundle, hasIntakeQuestions, buildIntakePdfAttachment } from "@/lib/intake-render";
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided, getMatterEmergency, emergencySupersedes } from "@/lib/mva-call/signing-matter";
import { matterRowsFilter } from "@/lib/matter";

export const runtime = "edge";

// POST /api/calls/email  { lead_id, to, attach? }
// Emails the whole case by hand: the automatic summary, the six qualifiers,
// every intake question with its answer, her details, and where the agreement
// stands. The signed agreement is attached when it is complete and the sender
// left "Attach the signed agreement" on. Never the SSN in the email itself.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Emailing the whole case out is an export; it takes the export permission
  // like the CSV and PDF exports do (Astra round 4).
  {
    const { requirePerm } = await import("@/lib/gate");
    const gate = await requirePerm(sb, "leads.export");
    if (!gate.ok) return NextResponse.json({ error: "Emailing a case out needs the Export leads permission." }, { status: 403 });
  }
  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  const to = String(b?.to || "").trim().toLowerCase();
  const attach = b?.attach !== false;
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "That email is not valid." }, { status: 400 });

  const context = await resolveSigningMatter(sb, leadId, { claimId: b?.claim_id });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const lead = { ...context.lead, campaign_id: context.campaignId, campaign: context.matter.claim.campaign ?? context.lead.campaign,
    case_type: context.matter.claim.claim_type ?? context.lead.case_type };
  const selected = await getMatterAgreement(sb, context.lead, context.matter, b?.agreement_id);
  if (!selected.ok) return NextResponse.json({ error: selected.error }, { status: selected.status });
  const emergency = await getMatterEmergency(sb, context.lead, context.matter);
  if (!emergency.ok) return NextResponse.json({ error: emergency.error }, { status: emergency.status });
  const sub = agreementIsVoided(selected.row) || emergencySupersedes(selected.row, emergency.row) ? null : selected.row;
  const { data: call, error: callError } = await sb.from("intake_calls").select("answers").eq("lead_id", leadId)
    .or(matterRowsFilter(context.matter)).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (callError) return NextResponse.json({ error: `Could not read this matter's intake: ${callError.message}. Nothing was emailed.` }, { status: 500 });

  const report = caseReport(lead, call?.answers || context.matter.claim.answers?.mva_call || {}, sub);
  const link = `${new URL(req.url).origin}/app/${leadKeyOf(lead)}?claim=${encodeURIComponent(context.matter.claim.id)}`;
  const attachments: { filename: string; content: string }[] = [];
  try {
    const bundle = await loadIntakeBundle(sb, leadId, context.matter.claim.id);
    if (!bundle || !hasIntakeQuestions(bundle)) throw new Error("this matter's intake questions are unavailable");
    attachments.push(await buildIntakePdfAttachment(bundle));
  } catch (e: any) {
    return NextResponse.json({ error: `The intake PDF could not be attached (${e?.message || "unknown error"}). Nothing was emailed.` }, { status: 503 });
  }
  let attachError = "";
  if (attach && sub?.status === "completed" && sub?.completed_pdf_path) {
    const a = await signedPdfAttachment(supabaseAdmin(), sub.completed_pdf_path, `${report.name} agreement`);
    if (a.file) attachments.push(a.file); else attachError = a.error || "";
  }
  // This is the case SUMMARY export: the report plus the primary signed
  // agreement when attached. It is NOT the verified full packet — that goes
  // through firm delivery, which checks every packet PDF and the certificate.
  // The email says which one it is so nobody mistakes it (Astra round 5).
  const hasSignedPdf = attachments.length > 1;
  const scopeNote = hasSignedPdf
    ? "The intake is in the email body and attached as a PDF, along with the primary signed agreement. The firm's complete verified packet and signing certificate go through firm delivery."
    : "The intake is in the email body and attached as a PDF. This email does not include signed documents; the firm's verified packet goes through firm delivery.";
  const r = await sendEmail({
    to,
    subject: `Case summary: ${report.name}${lead.lead_no ? `, ${lead.lead_no}` : ""}`,
    html: caseReportHtml(report, { link, note: `Sent by ${me.name || "ClaimReach"}. ${scopeNote}`, attached: hasSignedPdf }),
    text: `${scopeNote}\n\n` + caseReportText(report, link),
    attachments,
  });
  if (!r.ok) return NextResponse.json({ error: r.error || "The email did not send." }, { status: 502 });
  await recordAudit({
    firm_id: lead.firm_id, lead_id: lead.id, actor: me.id, actor_name: me.name ?? "Staff", category: "contact",
    description: `Emailed the case and intake PDF to ${to}${hasSignedPdf ? " with the signed agreement" : ""}.`,
  });
  return NextResponse.json({ ok: true, attached: hasSignedPdf, intake_pdf_attached: true, attach_error: attachError || null, signed: report.agreement.signed, has_pdf: report.agreement.hasPdf });
}
