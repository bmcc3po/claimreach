import { NextRequest, NextResponse } from "next/server";
import { leadKeyOf } from "@/lib/lead-key";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, LEAD_CALL_COLS } from "@/lib/mva-call/server";
import { caseReport, caseReportHtml, caseReportText } from "@/lib/mva-call/report";
import { signedPdfAttachment } from "@/lib/signed-docs";
import { validateDispo, DISPO_STATUS, DISPO_FIXED_DQ_KEY, DISPO_LABEL, DEFAULT_CALL_REASONS } from "@/lib/mva-call/dispo";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";
import { fireEvent } from "@/lib/webhook-deliver";
import { sendEmail } from "@/lib/email";

export const runtime = "edge";

// POST /api/calls/dispo
//   { lead_id, call_id?, dispo, reasons[], callback_at?, note?, notify[] }
// Closes the call: writes the dispo on the call session, moves the claim to the
// matching status through the one status setter, fires call.dispositioned, and
// for a signed file emails the case (no SSN, no PDF, a link to the file).
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

  const { data: lead, error: leadErr } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const admin = supabaseAdmin();

  // Signed means a real signature. The agent cannot declare one; an owner or
  // admin can, for a file signed outside ClaimReach.
  if (d.dispo === "signed" && !["owner", "admin"].includes(me.role)) {
    const { data: sig } = await admin.from("esign_submissions").select("id, status")
      .eq("lead_id", lead.id).in("status", ["signed", "completed"]).limit(1).maybeSingle();
    if (!sig) return NextResponse.json({ error: "There's no signed agreement on this file yet. Pick E-sign sent." }, { status: 409 });
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
    if (!upd) callId = null;
  }
  if (!callId) {
    const { data: ins, error } = await sb.from("intake_calls").insert({
      firm_id: lead.firm_id, campaign_id: lead.campaign_id, lead_id: lead.id,
      agent_id: me.id, agent_name: me.name, caller_id: lead.phone || lead.lead_no || "unknown",
      first_name: lead.first_name, call_type: "mva_console", answers: {}, ...close,
    }).select("id").single();
    if (error) {
      const hint = /column .* does not exist/i.test(error.message) ? " Run migration 0097, then try again." : "";
      return NextResponse.json({ error: error.message + hint }, { status: 500 });
    }
    callId = ins.id;
  }

  // Status through the one setter. Signed is left alone: the signature moved it.
  const status = DISPO_STATUS[d.dispo];
  if (status) {
    const dqKey = d.dispo === "dq" ? d.reasons[0] : DISPO_FIXED_DQ_KEY[d.dispo] ?? null;
    const res = await setClaimStatusForLeads({
      leadIds: [lead.id], status, dqReasonKey: dqKey,
      dqNote: labels.length ? labels.join(", ") : null,
      actorId: me.id, actorName: me.name ?? "Agent",
    });
    if (!res.ok) return NextResponse.json({ error: `Dispo saved on the call, status did not change: ${res.error}`, call_id: callId }, { status: 500 });
  }

  // DNC: every channel off, today.
  if (d.dispo === "dnc") {
    const { error } = await admin.from("leads").update({ perm_call: false, perm_text: false, perm_email: false }).eq("id", lead.id);
    if (error) return NextResponse.json({ error: `Status is DNC, but contact permissions did not turn off: ${error.message}`, call_id: callId }, { status: 500 });
    await admin.from("contact_points").update({ status: "opted_out" }).eq("lead_id", lead.id).in("kind", ["mobile", "landline"]);
  }

  const when = d.callbackAt ? new Date(d.callbackAt).toLocaleString("en-US", { timeZone: "America/Chicago", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT" : "";
  await recordAudit({
    firm_id: lead.firm_id, lead_id: lead.id, actor: me.id, actor_name: me.name ?? "Agent", category: "call",
    description: `Call ended: ${DISPO_LABEL[d.dispo]}${labels.length ? ` (${labels.join(", ")})` : ""}${when ? `, call back ${when}` : ""}.`,
    meta: { call_id: callId, dispo: d.dispo, reasons: d.reasons, callback_at: d.callbackAt },
  });

  try {
    await fireEvent(lead.firm_id, "call.dispositioned", {
      lead_id: lead.id, lead_no: lead.lead_no, call_id: callId, dispo: d.dispo, dispo_label: DISPO_LABEL[d.dispo],
      reasons: d.reasons, reason_labels: labels, callback_at: d.callbackAt, note: d.note,
      agent: me.name, claimant_name: lead.claimant_name, phone: lead.phone, email: lead.email,
      campaign: lead.campaign, status: status ?? null,
    }, { campaignId: lead.campaign_id ?? null });
  } catch (e) { console.error("call.dispositioned webhook failed", e); }

  // Signed: email the case to whoever is checked. Report what really happened.
  let emailed: string[] = [];
  let emailError: string | null = null;
  if (d.dispo === "signed" && d.notify.length) {
    // The whole case: summary, qualifiers, every question and answer, and the
    // signed agreement when it is already complete.
    const [{ data: call }, { data: sub }] = await Promise.all([
      sb.from("intake_calls").select("answers").eq("id", callId).maybeSingle(),
      sb.from("esign_submissions").select("id, status, template_key, signer_name, injured_name, sent_at, signed_at, completed_at, completed_pdf_path")
        .eq("lead_id", lead.id).is("pax_index", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const origin = new URL(req.url).origin;
    const report = caseReport(lead, call?.answers || {}, sub);
    const link = `${origin}/app/${leadKeyOf(lead)}`;
    const pdf = sub?.completed_pdf_path ? await signedPdfAttachment(admin, sub.completed_pdf_path, `${report.name} agreement`) : { file: null };
    const attachments = pdf.file ? [pdf.file] : [];
    const html = caseReportHtml(report, { link, note: `${me.name || "An agent"} signed this file${lead.campaign ? ` on ${lead.campaign}` : ""}.`, attached: attachments.length > 0 });
    const text = caseReportText(report, link);
    for (const to of d.notify) {
      const r = await sendEmail({ to, subject: `Signed: ${report.name}${lead.lead_no ? `, ${lead.lead_no}` : ""}`, html, text, attachments });
      if (r.ok) emailed.push(to); else emailError = r.error || "email failed";
    }
  }

  return NextResponse.json({ ok: true, call_id: callId, emailed, email_error: emailError });
}
