import { NextRequest, NextResponse } from "next/server";
import { leadKeyOf } from "@/lib/lead-key";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, LEAD_CALL_COLS } from "@/lib/mva-call/server";
import { caseReport, caseReportHtml, caseReportText } from "@/lib/mva-call/report";
import { signedPdfAttachment } from "@/lib/signed-docs";
import { loadIntakeBundle, hasIntakeQuestions, buildIntakePdfAttachment } from "@/lib/intake-render";
import { validateDispo, DISPO_STATUS, DISPO_FIXED_DQ_KEY, DISPO_LABEL, DEFAULT_CALL_REASONS } from "@/lib/mva-call/dispo";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided, getMatterEmergency, emergencySupersedes } from "@/lib/mva-call/signing-matter";
import { recordAudit } from "@/lib/audit";
import { fireEvent } from "@/lib/webhook-deliver";
import { sendEmail } from "@/lib/email";
import { officeDateTime } from "@/lib/office-clock";

export const runtime = "edge";

// POST /api/calls/dispo
//   { lead_id, call_id?, dispo, reasons[], callback_at?, note?, notify[] }
// Closes the call: writes the dispo on the call session, moves the claim to the
// matching status through the one status setter, fires call.dispositioned, and
// for a signed file emails the case and its intake PDF to selected owners.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const leadId = String(raw?.lead_id || "");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const v = validateDispo(raw);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const d = v.value;
  // The signed-call notice is for the active owners shown by the Desk. It is
  // not a second free-form case export path around /api/calls/email's export
  // permission. Check before changing status or closing the call.
  if (d.notify.length && me.role !== "owner") {
    const { data: owners, error: ownersError } = await sb.from("app_users")
      .select("email").eq("role", "owner").eq("active", true);
    if (ownersError) return NextResponse.json({ error: "The owner notification list is unavailable. Nothing was closed." }, { status: 503 });
    const allowed = new Set((owners ?? []).map((o: any) => String(o.email || "").trim().toLowerCase()).filter(Boolean));
    if (d.notify.some((address) => !allowed.has(address))) {
      return NextResponse.json({ error: "Signed-call notices can only go to active ClaimReach owners. Nothing was closed." }, { status: 403 });
    }
  }

  const context = await resolveSigningMatter(sb, leadId, {
    claimId: raw?.claim_id ? String(raw.claim_id) : null,
    callId: raw?.call_id ? String(raw.call_id) : null,
  });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { lead, matter, campaignId } = context;
  const admin = supabaseAdmin();

  // The call's ONE matter: the claim the console pinned, else the claim the
  // call session was pinned to, else the file's single matter. Ambiguity
  // stops here (Astra round 6: a campaign-derived scope could widen).
  const claimId = matter.claim.id;
  // Signed means a real signature. The agent cannot declare one; an owner or
  // admin can, for a file signed outside ClaimReach. Other dispositions do
  // not depend on signing reads: a provider-record outage must not block DNC.
  let currentAgreement: any = null;
  if (d.dispo === "signed") {
    const agreement = await getMatterAgreement(sb, lead, matter);
    if (!agreement.ok) return NextResponse.json({ error: agreement.error }, { status: agreement.status });
    const emergency = await getMatterEmergency(sb, lead, matter);
    if (!emergency.ok) return NextResponse.json({ error: emergency.error }, { status: emergency.status });
    if (emergencySupersedes(agreement.row, emergency.row)) return NextResponse.json({ error: "This matter has a newer provisional emergency agreement. Finish the DocuSeal re-sign before recording a primary signed disposition; the emergency agreement remains in history." }, { status: 409 });
    currentAgreement = agreementIsVoided(agreement.row) ? null : agreement.row;
    if (!["owner", "admin"].includes(me.role) && (!currentAgreement || !["signed", "completed"].includes(currentAgreement.status))) return NextResponse.json({ error: "There's no current signed agreement on this matter yet. Pick E-sign sent." }, { status: 409 });
  }

  // Reason keys must be real rows, and their labels go on the file.
  let labels: string[] = [];
  if (d.dispo === "dq") {
    const { data: rows } = await admin.from("dq_reasons").select("key, label").in("key", d.reasons);
    const byKey = new Map((rows ?? []).map((r: any) => [r.key, r.label]));
    const bad = d.reasons.filter((k) => !byKey.has(k));
    if (bad.length) return NextResponse.json({ error: `Unknown DQ reason: ${bad.join(", ")}` }, { status: 400 });
    labels = d.reasons.map((k) => byKey.get(k) as string);
  } else if (d.dispo === "esign" || d.dispo === "callback" || d.dispo === "ni") {
    const { data: rows, error } = await admin.from("call_dispo_reasons").select("key, label").eq("dispo", d.dispo).in("key", d.reasons);
    const list = error ? DEFAULT_CALL_REASONS[d.dispo].filter((r) => d.reasons.includes(r.key)) : (rows ?? []);
    const byKey = new Map(list.map((r: any) => [r.key, r.label]));
    const bad = d.reasons.filter((k) => !byKey.has(k));
    if (bad.length) return NextResponse.json({ error: `Unknown reason: ${bad.join(", ")}` }, { status: 400 });
    labels = d.reasons.map((k) => byKey.get(k) as string);
  }

  // Status FIRST, through the one setter, on THIS matter only. A failure here
  // leaves the call open so the agent can fix it and press Save again —
  // it used to close the call and then fail (Astra round 5). Signed is left
  // alone: the signature moved it.
  const status = DISPO_STATUS[d.dispo];
  if (status) {
    const dqKey = d.dispo === "dq" ? d.reasons[0] : DISPO_FIXED_DQ_KEY[d.dispo] ?? null;
    const res = await setClaimStatusForLeads({
      leadIds: [lead.id], claimIds: [claimId], status, dqReasonKey: dqKey,
      dqNote: labels.length ? labels.join(", ") : null,
      actorId: me.id, actorName: me.name ?? "Agent",
    });
    if (!res.ok) return NextResponse.json({ error: `Nothing was closed; the status did not change: ${res.error}` }, { status: 500 });
  }

  // Close the call session (create it if autosave never got one in).
  const now = new Date().toISOString();
  const close = {
    disposition: d.dispo,
    dispo_reasons: d.reasons,
    reason: labels.join(", ") || null,
    callback_at: d.callbackAt,
    dispo_note: d.note,
    status: "ended",
    ended_at: now,
    updated_at: now,
  };
  let callId: string | null = raw?.call_id ? String(raw.call_id) : null;
  if (callId) {
    const { data: upd, error } = await sb.from("intake_calls").update(close).eq("id", callId).eq("lead_id", lead.id).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!upd) return NextResponse.json({ error: "The status was saved, but this call is no longer available. Refresh the file before trying again." }, { status: 409 });
  }
  if (!callId) {
    const { data: ins, error } = await sb.from("intake_calls").insert({
      firm_id: lead.firm_id, campaign_id: campaignId, lead_id: lead.id,
      agent_id: me.id, agent_name: me.name, caller_id: lead.phone || lead.lead_no || "unknown",
      first_name: lead.first_name, call_type: "mva_console", claim_id: claimId, answers: {}, ...close,
    }).select("id").single();
    if (error) {
      const hint = /column .* does not exist/i.test(error.message) ? " Run migration 0097, then try again." : "";
      return NextResponse.json({ error: `The status changed, but the call record did not close: ${error.message}${hint}` }, { status: 500 });
    }
    callId = ins.id;
  }

  // DNC: every channel off, today.
  if (d.dispo === "dnc") {
    const { error } = await admin.from("leads").update({ perm_call: false, perm_text: false, perm_email: false }).eq("id", lead.id);
    if (error) return NextResponse.json({ error: `Status is DNC, but contact permissions did not turn off: ${error.message}`, call_id: callId }, { status: 500 });
    await admin.from("contact_points").update({ status: "opted_out" }).eq("lead_id", lead.id).in("kind", ["mobile", "landline"]);
  }

  const when = d.callbackAt ? officeDateTime(d.callbackAt) : "";
  await recordAudit({
    firm_id: lead.firm_id, lead_id: lead.id, actor: me.id, actor_name: me.name ?? "Agent", category: "call",
    description: `Call ended: ${DISPO_LABEL[d.dispo]}${labels.length ? ` (${labels.join(", ")})` : ""}${when ? `, call back ${when}` : ""}.`,
    meta: { claim_id: claimId, campaign_id: campaignId, call_id: callId, dispo: d.dispo, reasons: d.reasons, callback_at: d.callbackAt },
  });

  try {
    await fireEvent(lead.firm_id, "call.dispositioned", {
      lead_id: lead.id, claim_id: claimId, lead_no: lead.lead_no, call_id: callId, dispo: d.dispo, dispo_label: DISPO_LABEL[d.dispo],
      reasons: d.reasons, reason_labels: labels, callback_at: d.callbackAt, note: d.note,
      agent: me.name, claimant_name: lead.claimant_name, phone: lead.phone, email: lead.email,
      campaign: matter.claim.campaign, status: status ?? null,
    }, { campaignId });
  } catch (e) { console.error("call.dispositioned webhook failed", e); }

  // Signed: email the case to whoever is checked. Report what really happened.
  let emailed: string[] = [];
  let emailError: string | null = null;
  if (d.dispo === "signed" && d.notify.length) {
    // The whole case: summary, qualifiers, every question and answer, and the
    // signed agreement when it is already complete.
    const { data: call } = await sb.from("intake_calls").select("answers").eq("id", callId).maybeSingle();
    const sub = currentAgreement;
    const origin = new URL(req.url).origin;
    const report = caseReport({ ...lead, campaign: matter.claim.campaign, case_type: matter.claim.claim_type }, matter.claim.answers?.mva_call || call?.answers || {}, sub);
    const link = `${origin}/leads/${leadKeyOf(lead)}?claim=${claimId}`;
    const pdf = sub?.completed_pdf_path ? await signedPdfAttachment(admin, sub.completed_pdf_path, `${report.name} agreement`) : { file: null };
    try {
      const bundle = await loadIntakeBundle(sb, lead.id, claimId);
      if (!bundle || !hasIntakeQuestions(bundle)) throw new Error("this matter's intake questions are unavailable");
      const intake = await buildIntakePdfAttachment(bundle);
      const attachments = [intake, ...(pdf.file ? [pdf.file] : [])];
      const html = caseReportHtml(report, { link, note: `${me.name || "An agent"} signed this file${matter.claim.campaign ? ` on ${matter.claim.campaign}` : ""}. The intake PDF is attached.`, attached: !!pdf.file });
      const text = `${caseReportText(report, link)}\n\nThe intake PDF is attached.`;
      for (const to of d.notify) {
        const r = await sendEmail({ to, subject: `Signed: ${report.name}${lead.lead_no ? `, ${lead.lead_no}` : ""}`, html, text, attachments });
        if (r.ok) emailed.push(to); else emailError = r.error || "email failed";
      }
    } catch (e: any) {
      emailError = `The intake PDF could not be attached (${e?.message || "unknown error"}). No signed-call notice was emailed.`;
    }
  }

  return NextResponse.json({ ok: true, call_id: callId, emailed, email_error: emailError });
}
