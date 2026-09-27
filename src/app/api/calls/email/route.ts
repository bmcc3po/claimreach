import { NextRequest, NextResponse } from "next/server";
import { leadKeyOf } from "@/lib/lead-key";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, LEAD_CALL_COLS } from "@/lib/mva-call/server";
import { caseReport, caseReportHtml, caseReportText } from "@/lib/mva-call/report";
import { signedPdfAttachment } from "@/lib/signed-docs";
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";

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
  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  const to = String(b?.to || "").trim().toLowerCase();
  const attach = b?.attach !== false;
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "That email is not valid." }, { status: 400 });

  const { data: lead } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const [{ data: call }, { data: sub }] = await Promise.all([
    sb.from("intake_calls").select("answers").eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("esign_submissions").select("id, status, template_key, signer_name, injured_name, sent_at, signed_at, completed_at, completed_pdf_path")
      .eq("lead_id", leadId).is("pax_index", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const report = caseReport(lead, call?.answers || {}, sub);
  const link = `${new URL(req.url).origin}/app/${leadKeyOf(lead)}`;
  const attachments: { filename: string; content: string }[] = [];
  let attachError = "";
  if (attach && sub?.completed_pdf_path) {
    const a = await signedPdfAttachment(supabaseAdmin(), sub.completed_pdf_path, `${report.name} agreement`);
    if (a.file) attachments.push(a.file); else attachError = a.error || "";
  }
  const r = await sendEmail({
    to,
    subject: `Case: ${report.name}${lead.lead_no ? `, ${lead.lead_no}` : ""}`,
    html: caseReportHtml(report, { link, note: `Sent by ${me.name || "ClaimReach"}.`, attached: attachments.length > 0 }),
    text: caseReportText(report, link),
    attachments,
  });
  if (!r.ok) return NextResponse.json({ error: r.error || "The email did not send." }, { status: 502 });
  await recordAudit({
    firm_id: lead.firm_id, lead_id: lead.id, actor: me.id, actor_name: me.name ?? "Staff", category: "contact",
    description: `Emailed the case to ${to}${attachments.length ? " with the signed agreement" : ""}.`,
  });
  return NextResponse.json({ ok: true, attached: attachments.length > 0, attach_error: attachError || null, signed: report.agreement.signed, has_pdf: report.agreement.hasPdf });
}
