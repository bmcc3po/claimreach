// ============================================================================
// When a client signs, email the people who handle that case type. One
// definition of who gets it (signedRecipients) and one sender (notifySigned),
// called from syncSubmission, so DocuSeal's webhook and the agent's screen
// can never both send it: the first to claim the row sends, the other stops.
//
// Rules live in notify_routes (migration 0099), set in Settings > When a
// client signs:
//   a case-type rule (no campaign) is the distro for every signing of that
//   type, like mva@
//   a campaign rule adds CCs for that campaign only, like tmpmva@
// Every matching rule's To and CC are combined.
// ============================================================================
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { caseReport, caseReportHtml, caseReportText } from "@/lib/mva-call/report";
import { signedPdfAttachment } from "@/lib/signed-docs";
import { caseName } from "@/lib/case-name";
import { leadKeyOf } from "@/lib/lead-key";

export interface NotifyRoute {
  event: string;
  case_type: string | null;
  campaign_id: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  active?: boolean | null;
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "mva@x.com, TMPmva@x.com; bad" -> ["mva@x.com", "tmpmva@x.com"]. Order kept, no repeats. */
export function cleanEmails(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/);
  const out: string[] = [];
  for (const p of parts) {
    const e = String(p ?? "").trim().toLowerCase();
    if (EMAIL_RE.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

/** Who gets the email for one signing. */
export function signedRecipients(routes: NotifyRoute[], lead: { case_type?: string | null; campaign_id?: string | null }): { to: string[]; cc: string[] } {
  const hits = routes.filter((r) =>
    r.active !== false && (r.event || "signed") === "signed" &&
    (r.campaign_id ? r.campaign_id === lead.campaign_id : (!r.case_type || r.case_type === lead.case_type)));
  let to = cleanEmails(hits.flatMap((r) => r.to_emails ?? []));
  let cc = cleanEmails(hits.flatMap((r) => r.cc_emails ?? [])).filter((e) => !to.includes(e));
  if (!to.length && cc.length) { to = cc; cc = []; }
  return { to, cc };
}

const AGREEMENT: Record<string, string> = { TX: "Texas", FL: "Florida", OTHER: "AL/GA" };

/**
 * Send the signing email for one agreement, once. Never throws: a failed
 * email is written to the file's history and the signing itself is untouched.
 */
export async function notifySigned(admin: any, row: any, origin = "https://claimreach.com"): Promise<void> {
  try {
    // Claim it. If migration 0099 has not run, or it was already sent, stop here.
    const { data: claimed, error: claimErr } = await admin.from("esign_submissions")
      .update({ signed_notified_at: new Date().toISOString() })
      .eq("id", row.id).is("signed_notified_at", null).select("id");
    if (claimErr || !claimed?.length) return;

    const { data: lead } = await admin.from("leads")
      .select("id, lead_no, claimant_name, phone, email, dob, case_type, campaign, campaign_id, firm_id")
      .eq("id", row.lead_id).maybeSingle();
    if (!lead) return;
    const { data: routes, error: routeErr } = await admin.from("notify_routes")
      .select("event, case_type, campaign_id, to_emails, cc_emails, active").eq("event", "signed").eq("active", true);
    if (routeErr) return;
    const { to, cc } = signedRecipients(routes ?? [], lead);
    if (!to.length) return;

    // The call's answers, for the summary. A passenger's file has none of its own.
    let answers: any = {};
    const q = admin.from("intake_calls").select("answers");
    const { data: call } = row.call_id
      ? await q.eq("id", row.call_id).maybeSingle()
      : await q.eq("lead_id", row.lead_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (call?.answers && typeof call.answers === "object") answers = call.answers;

    const name = row.injured_name || row.signer_name || lead.claimant_name || "New client";
    const camp = caseName(lead.campaign, lead.case_type);
    const agr = AGREEMENT[row.template_key] ? `${AGREEMENT[row.template_key]} ` : "";
    const who = row.signer_name && row.injured_name && row.signer_name !== row.injured_name
      ? `${row.signer_name} signed for ${row.injured_name}` : `${name} signed`;
    // The whole case: summary, qualifiers, every question and answer, and the
    // signed agreement when DocuSeal already has it complete.
    const report = caseReport(lead, answers, row);
    const link = `${origin}/app/${leadKeyOf(lead)}`;
    const pdf = row.completed_pdf_path ? await signedPdfAttachment(admin, row.completed_pdf_path, `${name} agreement`) : { file: null };
    const attachments = pdf.file ? [pdf.file] : [];
    const html = caseReportHtml(report, { link, note: `${who} the ${agr}agreement${row.pax_index != null ? " as a passenger" : ""}.`, attached: attachments.length > 0 });
    const r = await sendEmail({ to, cc, subject: `Signed: ${name}${camp ? `, ${camp}` : ""}`, html, text: caseReportText(report, link), attachments });
    await recordAudit({
      firm_id: lead.firm_id, lead_id: lead.id, actor_name: "ClaimReach", category: "retainer",
      description: r.ok
        ? `Emailed the signing to ${to.join(", ")}${cc.length ? `, cc ${cc.join(", ")}` : ""}.`
        : `The signing email did not send: ${r.error}`,
      meta: { submission_id: row.submission_id, to, cc },
    });
  } catch (e: any) {
    console.error("signing email failed", e?.message || e);
  }
}
