import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, firmSpoken, parseDob, dobForForm } from "@/lib/mva-call/server";
import { agreementChoice } from "@/lib/mva-call/agreement-choice";
import { createSubmission, docusealConfigured, expireSubmission, getSubmission, MISSING_DOCUSEAL, plainDocuSeal } from "@/lib/docuseal";
import { syncSubmission, packetsFor, templateFor, ssnForForm } from "@/lib/mva-call/esign";
import { sendJustCallSms, toE164 } from "@/lib/justcall-send";
import { normPhone } from "@/lib/comms";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { sameName, paxParentId } from "@/lib/linked-files";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided, getMatterEmergency, emergencySupersedes } from "@/lib/mva-call/signing-matter";
import { recordAudit } from "@/lib/audit";
import { ensureClientSignedSnapshot } from "@/lib/mva-call/client-signed";
import { readIdentityForSigning } from "@/lib/mva-call/identity";
import { UNSIGNED_AGREEMENT_STATUSES, agreementSendStatus } from "@/lib/mva-call/replacement";
import { bindSendAttempt, finalizeSendAttempt, holdSendAttempt, markSendPending, readPendingSendAttempt, rejectSendAttempt, reserveSendAttempt, safeSendAttempt, SEND_HELD_MESSAGE } from "@/lib/mva-call/send-attempt";
import { officeDateUS } from "@/lib/office-clock";

export const runtime = "edge";

const TODAY_RE = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;

// POST /api/calls/esign
//   { lead_id, call_id?, signer_name, injured_name, via: 'Text'|'Email', phone?, email?, city, today, doi, pax_index? }
// Sends the agreement for the state where the wreck happened. A text goes out
// from the JustCall line with the signing link; an email goes from DocuSeal.
// A passenger gets their own file and their own agreement.
// Every failure answers in plain words, as JSON, and is written to the file's
// history with what DocuSeal said, so a failed send is never a bare "502".
export async function POST(req: NextRequest) {
  try {
    return await send(req);
  } catch {
    // Provider exceptions can echo prefilled identity. Never log their body.
    await recordAudit({ category: "retainer", description: "Agreement send failed unexpectedly. Check the agreement history before retrying.", meta: { stage: "crash" } });
    return NextResponse.json({ error: "The agreement send could not be confirmed. Check the agreement history before retrying." }, { status: 500 });
  }
}

async function failed(lead: any, me: any, msg: string, meta: any, status = 424) {
  await recordAudit({ firm_id: lead?.firm_id ?? null, lead_id: lead?.id, actor: me?.id, actor_name: me?.name ?? "Agent", category: "retainer", description: `Agreement send failed: ${msg}`.slice(0, 500), meta });
  return NextResponse.json({ error: msg }, { status });
}

async function send(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!docusealConfigured()) return NextResponse.json({ error: MISSING_DOCUSEAL }, { status: 500 });

  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  const signer = String(b?.signer_name || "").trim().slice(0, 120);
  const injured = String(b?.injured_name || signer).trim().slice(0, 120);
  const via = b?.via === "Email" ? "Email" : "Text";
  const email = String(b?.email || "").trim().toLowerCase();
  const paxIndex = Number.isInteger(b?.pax_index) ? Number(b.pax_index) : null;
  // A passenger's STABLE key (given when they were added on the Car step);
  // legacy calls fall back to their list position (round 7).
  const paxKey = paxIndex == null ? null
    : (/^[A-Za-z0-9_-]{1,40}$/.test(String(b?.pax_key || "")) ? String(b.pax_key) : String(paxIndex));
  const paxMinor = b?.pax_minor === true;
  const paxDobInput = paxIndex != null ? String(b?.pax_dob || "").trim() : "";
  const paxDob = paxDobInput ? parseDob(paxDobInput) : null;
  // The signing date is the Pacific office day, independent of the agent's
  // device clock. The browser's preview uses this same calendar rule.
  const today = officeDateUS();
  const doi = TODAY_RE.test(String(b?.doi || "")) ? String(b.doi) : null;
  if (!leadId || !signer) return NextResponse.json({ error: "Add the signer's full name." }, { status: 400 });
  if (paxDobInput && !paxDob) return NextResponse.json({ error: "Check the passenger's date of birth, or leave it blank and finish it on their own file." }, { status: 400 });
  if (via === "Email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Add the PNC's email to send it by email." }, { status: 400 });

  const context = await resolveSigningMatter(sb, leadId, { claimId: b?.claim_id || null, callId: b?.call_id || null });
  if (!context.ok) return NextResponse.json({ error: context.error, ambiguous: !!context.ambiguous }, { status: context.status });
  if (!context.campaignId) return NextResponse.json({ error: "Choose this matter's campaign before sending its agreement." }, { status: 409 });
  const lead = { ...context.lead, campaign_id: context.campaignId, campaign: context.matter.claim.campaign ?? context.lead.campaign,
    case_type: context.matter.claim.claim_type ?? context.lead.case_type };
  const isMva = lead.case_type === "mva";
  if (isMva && !doi) return NextResponse.json({ error: "Add the date of the wreck. It prints on the agreement." }, { status: 400 });
  if (!isMva && paxIndex != null) return NextResponse.json({ error: "Open this person's own matter to send their agreement." }, { status: 400 });
  // An ADULT passenger's link goes to THEIR own phone or email, never falls
  // back to the caller's, and a destination equal to the caller's needs an
  // explicit "they share it" confirmation (Astra round 6). A minor's goes to
  // the guardian on the line.
  const adultPax = paxIndex != null && !paxMinor;
  const phone = toE164(String(b?.phone || (adultPax ? "" : lead.phone) || ""));
  if (adultPax && b?.pax_recipient_confirmed !== true) {
    const callerDigits = String(lead.phone || "").replace(/\D/g, "").slice(-10);
    if (via === "Text" && phone && callerDigits && String(phone).replace(/\D/g, "").slice(-10) === callerDigits) {
      return NextResponse.json({ error: "That is the caller's number. Confirm the passenger shares it, or add the passenger's own cell.", needs_recipient_confirm: true }, { status: 409 });
    }
    if (via === "Email" && email && String(lead.email || "").trim().toLowerCase() === email) {
      return NextResponse.json({ error: "That is the caller's email. Confirm the passenger shares it, or add the passenger's own email.", needs_recipient_confirm: true }, { status: 409 });
    }
  }
  if (via === "Text" && !phone) return NextResponse.json({ error: adultPax ? "Add the passenger's own cell number to text it." : "Add the PNC's cell number to text it." }, { status: 400 });
  if (via === "Text" && lead.perm_text === false && !adultPax) return NextResponse.json({ error: "The PNC asked not to be texted. Send it by email." }, { status: 409 });

  const configured = await sb.from("esign_templates").select("key").eq("campaign_id", context.campaignId).eq("provider", "docuseal");
  if (configured.error) return NextResponse.json({ error: "Could not read this campaign's DocuSeal templates." }, { status: 503 });
  const keys = (configured.data ?? []).map((t: any) => String(t.key));
  const choice = isMva ? agreementChoice(b?.city, b?.nv_variant, keys) : null;
  if (choice && !choice.available) return NextResponse.json({ error: choice.error }, { status: !choice.key || choice.variantError ? 400 : 409 });
  let key: string | null = choice?.key ?? String(b?.template_key || "").trim();
  if (isMva && b?.template_key && b.template_key !== key) return NextResponse.json({ error: "Choose a contract permitted for the state where the wreck happened." }, { status: 400 });
  if (!isMva) {
    if (!key) key = keys.includes("DEFAULT") ? "DEFAULT" : keys.length === 1 ? keys[0] : null;
    if (!key || !keys.includes(key)) return NextResponse.json({ error: keys.length ? "Choose a DocuSeal agreement configured for this campaign." : "No DocuSeal agreement is configured for this campaign. Add its Client and Intake template in campaign setup." }, { status: 409 });
  }
  if (!key) return NextResponse.json({ error: "Choose an agreement template." }, { status: 400 });
  // Nevada sends the TIERED contract by default. The non-tiered one goes out
  // only with a typed reason saying who approved it (Brett, Sep 28: "brett
  // approved friend/fam") — recorded on the file, refused without it.
  let nvReason = "";
  if (choice?.requiresReason) {
    nvReason = String(b?.nv_reason || "").trim().slice(0, 300);
    if (!nvReason) {
      return NextResponse.json({ error: "The non-tiered Nevada agreement only sends with a reason saying who approved it. Add the reason, or send the standard tiered agreement." }, { status: 400 });
    }
  }
  const admin = supabaseAdmin();
  const { data: campaign, error: campaignError } = await sb.from("campaigns").select("id, firm_id").eq("id", context.campaignId).maybeSingle();
  if (campaignError) return NextResponse.json({ error: `Could not read the campaign: ${campaignError.message}` }, { status: 500 });
  if (!campaign || (campaign.firm_id && campaign.firm_id !== lead.firm_id)) return NextResponse.json({ error: "This matter's campaign is not available for its firm." }, { status: 409 });
  const { data: firm } = await admin.from("firms").select("name, slug").eq("id", lead.firm_id).maybeSingle();

  // Reserve the stable parent/passenger scope before creating a passenger
  // file or touching any signing link. A competing request cannot get past
  // this durable reservation, including when the first request times out.
  const reservation = await reserveSendAttempt(admin, { claimId: context.matter.claim.id, actorId: me.id, paxKey, paxIndex });
  if (!reservation.ok) return NextResponse.json({ error: reservation.error }, { status: reservation.status });
  const attempt = reservation.attempt;
  let keepHeld = false;
  const held = async (code: string, message = SEND_HELD_MESSAGE, status = 502) => {
    keepHeld = true;
    await holdSendAttempt(admin, attempt.id, code);
    return NextResponse.json({ error: message, send_attempt: { ...attempt, state: "uncertain" } }, { status });
  };
  try {

  // A passenger is their own file.
  let fileLeadId = lead.id;
  if (paxIndex != null) {
    const ext = `${lead.id}:pax:${paxKey}`;
    const { data: existing, error: existingError } = await sb.from("leads").select("id, claimant_name, dob, archived_at").eq("firm_id", lead.firm_id).eq("external_id", ext).maybeSingle();
    if (existingError) return NextResponse.json({ error: `Could not read the passenger's file: ${existingError.message}` }, { status: 500 });
    if (existing?.archived_at) return NextResponse.json({ error: "The passenger's existing file is archived. Restore it before sending another agreement." }, { status: 409 });
    if (existing && !sameName(existing.claimant_name, injured)) {
      // The passenger list changed under an old position: never attach one
      // person's agreement to another person's file (Astra round 6).
      return NextResponse.json({ error: `That passenger spot already belongs to ${existing.claimant_name || "someone else"}. Remove this passenger on the Car step and add them again.` }, { status: 409 });
    }
    if (existing) {
      if (paxDob && existing.dob && existing.dob !== paxDob) return NextResponse.json({ error: "The passenger file has a different date of birth. Open their file and verify identity before sending another agreement." }, { status: 409 });
      if (paxDob && !existing.dob) {
        const { error: dobError } = await sb.from("leads").update({ dob: paxDob }).eq("id", existing.id).eq("firm_id", lead.firm_id);
        if (dobError) return NextResponse.json({ error: "The passenger's date of birth did not save. Open their file before sending." }, { status: 503 });
      }
      fileLeadId = existing.id;
    }
    else {
      const parts = injured.split(/\s+/).filter(Boolean);
      const { data: leadNo } = await sb.rpc("mint_lead_no", { p_firm: lead.firm_id });
      const ins: Record<string, any> = {
        firm_id: lead.firm_id, campaign_id: lead.campaign_id, campaign: lead.campaign, case_type: lead.case_type,
        claimant_name: injured, first_name: parts[0] || null, last_name: parts.slice(1).join(" ") || null,
        // The passenger's file carries THEIR number (the one this send goes
        // to), never the caller's — a minor's file keeps the guardian's.
        phone: phone || null, email: email || null, dob: paxDob, external_id: ext, source_key: "passenger", origin: "call",
        created_by: me.id, assigned_agent: me.id, intake_agent_id: me.id,
        caller_is_self: signer === injured, caller_first: signer.split(/\s+/)[0] || null,
      };
      // Same household: prefill the passenger's mailing address from this file.
      if (b?.pax_same_addr === true) {
        for (const k of ["mail_addr1", "mail_city", "mail_state", "mail_zip"]) {
          if ((lead as any)[k] != null) ins[k] = (lead as any)[k];
        }
      }
      if (leadNo) ins.lead_no = leadNo;
      // A database timeout can happen after the insert commits. Keep the
      // parent/passenger reservation until an owner verifies that outcome;
      // releasing it or blindly archiving can race an in-flight claim insert.
      try {
        const { data: pl, error } = await sb.from("leads").insert(ins).select("id").single();
        if (error || !pl?.id) return held("passenger_creation_unconfirmed", "The passenger file could not be confirmed. No agreement was sent; the owner must check it before another attempt.", 503);
        const { error: cErr } = await sb.from("claims").insert({ firm_id: lead.firm_id, lead_id: pl.id, claim_type: lead.case_type, campaign: lead.campaign, campaign_id: lead.campaign_id, status: "new", is_this_file: true, created_by: me.id });
        if (cErr) return held("passenger_creation_unconfirmed", "The passenger matter could not be confirmed. No agreement was sent; the owner must check the saved file before another attempt.", 503);
        fileLeadId = pl.id;
      } catch {
        return held("passenger_creation_unconfirmed", "The passenger file could not be confirmed. No agreement was sent; the owner must check it before another attempt.", 503);
      }
    }
  }

  // The signing's ONE matter, resolved BEFORE anything goes to DocuSeal: the
  // call's pinned claim for the main agreement, the passenger file's own
  // claim for a passenger. It is stamped on the signing row, so the signed
  // transition, QA and delivery read it instead of guessing (round 7).
  const target = paxIndex != null ? await resolveSigningMatter(sb, fileLeadId) : context;
  if (!target.ok) return NextResponse.json({ error: `${target.error} Nothing was sent.`, ambiguous: !!target.ambiguous }, { status: target.status });
  if (target.campaignId !== context.campaignId) return NextResponse.json({ error: "The passenger's file belongs to another campaign. Open their file to choose the correct agreement." }, { status: 409 });
  if (via === "Text" && target.lead.perm_text === false) return NextResponse.json({ error: "This signer asked not to receive texts. Choose an allowed channel." }, { status: 409 });
  if (via === "Email" && target.lead.perm_email === false) return NextResponse.json({ error: "This signer asked not to receive email. Choose an allowed channel." }, { status: 409 });
  const signClaimId = target.matter.claim.id;
  const current = await getMatterAgreement(sb, target.lead, target.matter);
  if (!current.ok) return NextResponse.json({ error: current.error }, { status: current.status });
  const emergency = await getMatterEmergency(sb, target.lead, target.matter);
  if (!emergency.ok) return NextResponse.json({ error: emergency.error }, { status: emergency.status });
  const emergencyResign = b?.emergency_resign === true && emergency.row?.status === "signed" && emergencySupersedes(current.row, emergency.row);
  const replacementReason = String(b?.replacement_reason || "").trim().slice(0, 300);
  const replacementId = String(b?.replacement_agreement_id || "");
  const live = !emergencyResign && current.row && !agreementIsVoided(current.row) && ["sending", "sent", "opened", "signed", "completed"].includes(current.row.status);
  if (live && (!replacementId || replacementReason.length < 10)) {
    return NextResponse.json({ error: "This matter already has a live agreement. To send a corrected one, review the new contract and enter a correction reason of at least 10 characters. The original stays in history.", agreement_id: current.row.id }, { status: 409 });
  }
  if (live && replacementId !== current.row.id) {
    return NextResponse.json({ error: "The current agreement changed. Refresh before replacing it; nothing was sent.", agreement_id: current.row.id }, { status: 409 });
  }
  if (!live && replacementId) {
    return NextResponse.json({ error: "There is no live agreement to replace. Refresh and send normally." }, { status: 409 });
  }
  if (live && (current.row.status === "completed" || ["delivered", "retained"].includes(String(target.matter.claim.status)))) {
    return NextResponse.json({ error: "This file already has a completed or delivered agreement. An owner or admin must review it before another agreement goes out." }, { status: 409 });
  }

  // Resolve the template only after the parent/child matter is validated.
  const packets = packetsFor(firm?.slug, target.matter.claim.claim_type ?? lead.case_type);
  const packet = packets ? (packets as any)[key] : null;
  let tpl: { template_id: string } | null = null;
  if (packet) {
    const t = await templateFor(admin, { firmId: lead.firm_id, campaignId: context.campaignId, key, packet, origin: new URL(req.url).origin, actorId: me.id });
    if (!t.ok) return t.missing ? NextResponse.json({ error: t.error }, { status: 409 }) : failed(lead, me, t.error, { stage: "template", key });
    tpl = { template_id: t.templateId };
  } else {
    const { data, error: templateError } = await admin.from("esign_templates").select("template_id")
      .eq("campaign_id", context.campaignId).eq("provider", "docuseal").eq("key", key).maybeSingle();
    if (templateError) return NextResponse.json({ error: `Could not read the agreement template: ${templateError.message}` }, { status: 500 });
    tpl = data;
  }
  if (!tpl) return NextResponse.json({ error: "E-sign is not set up for this campaign yet. An admin sets it up once from Calls." }, { status: 409 });

  // Identity belongs to the actual signer file, including passenger files.
  // Read before retiring any old agreement. Missing identity is allowed;
  // unreadable saved identity must not silently disappear from a new packet.
  const capturedIdentity = await readIdentityForSigning(admin, { leadId: fileLeadId, claimId: signClaimId, firmId: target.lead.firm_id });
  if (!capturedIdentity.ok) return NextResponse.json({ error: capturedIdentity.error }, { status: capturedIdentity.status });
  const capturedDob = paxIndex == null && b?.dob ? parseDob(b.dob) : paxDob || parseDob(target.lead.dob);
  if (paxIndex == null && b?.dob && !capturedDob) return NextResponse.json({ error: "Check the date of birth before sending, or leave it for the office step." }, { status: 400 });
  const capturedSsn = capturedIdentity.identity ? ssnForForm(capturedIdentity.identity.ssn) : null;
  const intakeValues = { ...(capturedDob ? { "Patient DOB": dobForForm(capturedDob) } : {}), ...(capturedSsn ? { "Patient SSN": capturedSsn.printed } : {}) };

  const bound = await bindSendAttempt(admin, attempt.id, {
    leadId: fileLeadId, claimId: signClaimId, expectedId: current.row?.id ?? null, expectedStatus: current.row?.status ?? null,
    templateKey: key, templateId: String(tpl.template_id), via, emergencyDocumentId: emergencyResign ? emergency.row.id : null,
    sendContext: { signer_name: signer, injured_name: injured, phone, email: email || null,
      call_id: b?.call_id || null, pax_index: paxIndex, replacement_of: live ? current.row.id : null },
  });
  if (!bound.ok) return NextResponse.json({ error: bound.error }, { status: bound.status });

  // Replacement is one deliberate send, never an agent-operated void. Verify
  // the latest provider state before changing anything: a signature can land
  // while an agent is selecting the correction. The old signed evidence stays
  // signed and receives an owner-review hold. An unsigned link must be expired
  // at DocuSeal and verified there before it is retired locally.
  let replaced: any = null;
  let signedReplacement = false;
  if (live) {
    const syncStatus = await syncSubmission(admin, current.row, { origin: new URL(req.url).origin });
    const refreshed = await getMatterAgreement(sb, target.lead, target.matter);
    if (!refreshed.ok) return NextResponse.json({ error: refreshed.error }, { status: refreshed.status });
    const old = refreshed.row;
    if (!old || old.id !== replacementId || agreementIsVoided(old)) return NextResponse.json({ error: "The current agreement changed while you were preparing the correction. Refresh; nothing new was sent." }, { status: 409 });
    if (old.status === "completed" || syncStatus === "completed") return NextResponse.json({ error: "The office has completed this packet. An owner or admin must review it before another agreement goes out." }, { status: 409 });
    if (!["sent", "opened", "signed"].includes(old.status)) return NextResponse.json({ error: `The current agreement is ${old.status}. Refresh before sending another one.` }, { status: 409 });
    replaced = old;
    const now = new Date().toISOString();
    if (old.status === "signed" || syncStatus === "signed") {
      signedReplacement = true;
      if (!old.agent_reviewed_at) return NextResponse.json({ error: "Open the client-signed preview in File, mark it reviewed, then report the error and send its correction." }, { status: 409 });
      const snapshot = await ensureClientSignedSnapshot(admin, old);
      if (!snapshot.ok) return NextResponse.json({ error: `Could not preserve the client-signed original (${snapshot.error}). No correction was sent.` }, { status: 503 });
      if (old.replacement_requested_at) {
        // The original's supervisor-review flag is permanent evidence. It is
        // not the send mutex: a conclusively rejected prior create may be
        // retried deliberately under this new durable reservation.
        const prior = await admin.from("esign_send_attempts").select("id,state,error_code,provider_started_at")
          .eq("target_claim_id", signClaimId).eq("expected_submission_id", old.id).eq("state", "rejected")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        const safeRetry = prior.data?.error_code === "definitive_provider_rejection" ||
          (prior.data?.error_code === "pre_provider_abort" && !prior.data.provider_started_at);
        if (prior.error || !safeRetry) return NextResponse.json({ error: "A correction is already in progress for this signed agreement. Refresh the file; no second agreement was sent." }, { status: 409 });
      } else {
        const { data: held, error: holdError } = await admin.from("esign_submissions").update({
          replacement_requested_at: now, replacement_requested_by: me.id, replacement_reason: replacementReason, updated_at: now,
        }).eq("id", old.id).eq("status", "signed").is("replacement_requested_at", null).select("id").maybeSingle();
        if (holdError || !held) return NextResponse.json({ error: "Could not flag the signed original for supervisor review. No replacement was sent." }, { status: 409 });
      }
      await recordAudit({ firm_id: lead.firm_id, lead_id: fileLeadId, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
        description: `Requested supervisor review of the client-signed ${old.template_key || "agreement"} before sending a correction: ${replacementReason}`.slice(0, 600),
        meta: { claim_id: signClaimId, original_agreement_id: old.id, replacement_reason: replacementReason, supervisor_review_required: true } });
    } else {
      if (!old.submission_id) return NextResponse.json({ error: "The current DocuSeal submission ID is missing. An owner must reconcile it before another agreement can be sent." }, { status: 409 });
      // Expiration, unlike archiving, explicitly disables the signing link.
      const expiredAt = new Date(Date.now() - 60_000).toISOString();
      const expired = await expireSubmission(old.submission_id, expiredAt);
      if (!expired.ok) return held("prior_expiry_unconfirmed", "The old link's expiry could not be confirmed. No replacement was sent; ask the owner to reconcile this file.");
      const checked = await getSubmission(old.submission_id);
      const providerExpiry = checked.ok ? Date.parse(String((checked.data as any)?.expire_at || "")) : NaN;
      if (!checked.ok || !Number.isFinite(providerExpiry) || providerExpiry > Date.now()) {
        return held("prior_expiry_unconfirmed", "DocuSeal did not confirm that the old link expired. No replacement was sent; ask an owner to reconcile the old link.");
      }
      const clientSigned = Array.isArray((checked.data as any)?.submitters) && (checked.data as any).submitters.some((s: any) =>
        s.role === "Client" && (s.completed_at || s.status === "completed"));
      if (clientSigned || checked.data?.status === "completed") return NextResponse.json({ error: "The client signed the old agreement while it was being replaced. It is preserved; refresh and use the signed-correction flow." }, { status: 409 });
      const { data: retired, error: retireError } = await admin.from("esign_submissions").update({
        status: "voided", voided_at: now, voided_by: me.id, void_reason: `Replaced with corrected agreement: ${replacementReason}`, updated_at: now,
      }).eq("id", old.id).in("status", UNSIGNED_AGREEMENT_STATUSES).is("signed_at", null).is("completed_at", null).is("voided_at", null).select("id").maybeSingle();
      if (retireError || !retired) {
        await recordAudit({ firm_id: lead.firm_id, lead_id: fileLeadId, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
          description: "DocuSeal confirmed the old link expired, but the local record did not retire. Replacement blocked for owner reconciliation.",
          meta: { claim_id: signClaimId, original_agreement_id: old.id, replacement_reason: replacementReason, needs_reconciliation: true } });
        return held("prior_retirement_failed", "The old DocuSeal link expired, but ClaimReach could not update the original. No replacement was sent; an owner must reconcile the file.", 409);
      }
      await recordAudit({ firm_id: lead.firm_id, lead_id: fileLeadId, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
        description: `Expired the prior unsigned ${old.template_key || "agreement"} link and prepared a corrected agreement: ${replacementReason}`.slice(0, 600),
        meta: { claim_id: signClaimId, original_agreement_id: old.id, replacement_reason: replacementReason, provider_expired_at: expiredAt } });
    }
  }

  const { data: auth } = await sb.auth.getUser();
  const submit = (templateId: string) => createSubmission({
    templateId,
    client: {
      name: signer, email: email || null, phone,
      values: { "Client Name": signer, "Injured Party Name": injured, "Signing Date": today, ...(isMva && doi ? { "Accident Date": doi } : {}) },
    },
    intake: { email: auth?.user?.email || "intake@claimreach.com", name: me.name || "Intake", values: intakeValues },
    emailClient: via === "Email",
    externalId: attempt.id,
  });
  // Mark BEFORE the network call. Even losing this RPC's response must leave
  // the attempt held; no new request can guess whether create ran afterward.
  keepHeld = true;
  const pending = await markSendPending(admin, attempt.id);
  if (!pending.ok) return NextResponse.json({ error: pending.error, send_attempt: attempt }, { status: pending.status });
  const res = await submit(tpl.template_id);
  if (!res.ok) {
    if (res.definitiveRejection === true) {
      const rejected = await rejectSendAttempt(admin, attempt.id, true);
      if (rejected.ok) return failed(lead, me, plainDocuSeal("provider rejected request", res.status, "send"), { stage: "docuseal_rejected", status: res.status ?? null, attempt_id: attempt.id, key });
    }
    await recordAudit({ firm_id: lead.firm_id, lead_id: fileLeadId, actor: me.id, category: "retainer",
      description: "Agreement creation could not be confirmed. Further sends are held for owner reconciliation.",
      meta: { claim_id: signClaimId, attempt_id: attempt.id, provider_status: res.status ?? null, needs_reconciliation: true } });
    return held("provider_create_unconfirmed");
  }
  // DocuSeal answers with the list of signers. Read it either way it comes back.
  const list: any[] = Array.isArray(res.data) ? res.data : Array.isArray((res.data as any)?.submitters) ? (res.data as any).submitters : [];
  const client = list.find((s) => s.role === "Client");
  const intake = list.find((s) => s.role === "Intake");
  if (!client?.id || !client.submission_id || !intake?.id || !client.embed_src) return held("provider_response_incomplete", "DocuSeal returned an incomplete agreement response. Further sends are held; ask the owner to reconcile this file.");

  const finalized = await finalizeSendAttempt(admin, attempt.id, {
    firm_id: lead.firm_id, lead_id: fileLeadId, call_id: b?.call_id || null, campaign_id: lead.campaign_id,
    provider: "docuseal", template_key: key, template_id: String(tpl.template_id), claim_id: signClaimId,
    submission_id: String(client.submission_id ?? ""), client_submitter_id: String(client.id), intake_submitter_id: intake ? String(intake.id) : null,
    signer_name: signer, injured_name: injured, phone, email: email || null, via, pax_index: paxIndex,
    status: "sent", sign_url: client.embed_src || null, sent_by: me.id, replacement_of: replaced?.id || null,
  });
  if (!finalized.ok) {
    await recordAudit({ firm_id: lead.firm_id, lead_id: fileLeadId, actor: me.id, category: "retainer",
      description: "DocuSeal created an agreement, but saving its local record was not confirmed. Further sends are held for owner reconciliation.",
      meta: { claim_id: signClaimId, attempt_id: attempt.id, submission_id: client.submission_id, needs_reconciliation: true } });
    return held("local_finalize_unconfirmed", "DocuSeal created the agreement, but saving it could not be confirmed. No text was sent by ClaimReach; ask the owner to reconcile this file before another send.", 500);
  }
  const row = { id: finalized.id };

  // Text the link ourselves so it comes from the firm's line and lands on the file.
  let textError: string | null = null;
  if (via === "Text") {
    const from = process.env.JUSTCALL_DEFAULT_FROM || "";
    const body = `${firmSpoken(firm?.name)}: your agreement is ready to sign. ${client.embed_src}`;
    const sent = from ? await sendJustCallSms({ to: phone!, from, body }) : { ok: false as const, error: "No JustCall number is set (JUSTCALL_DEFAULT_FROM)." };
    if (!sent.ok) textError = sent.error;
    else {
      await admin.from("communications").insert({
        lead_id: fileLeadId, firm_id: lead.firm_id, channel: "sms", direction: "outbound", phone_raw: phone, phone_norm: normPhone(phone),
        agent_name: me.name, body, provider: "justcall", send_status: "sent", occurred_at: new Date().toISOString(), purpose: "esign",
      });
    }
  }

  const nowIso = new Date().toISOString();
  await admin.from("leads").update({ esign_sent_at: nowIso }).eq("id", fileLeadId);
  // The send moves THIS matter only (Astra rounds 5-6).
  const st = await setClaimStatusForLeads({
    leadIds: [fileLeadId], claimIds: [signClaimId],
    status: "esign_sent", actorId: me.id, actorName: me.name ?? "Agent",
  });
  if (!st.ok) console.error("esign_sent status failed", st.error);
  await recordAudit({
    firm_id: lead.firm_id, lead_id: fileLeadId, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
    description: `Sent the ${key === "OTHER" ? "AL/GA" : key === "NV" ? "Nevada tiered" : key === "NV_FLAT" ? "Nevada NON-TIERED" : key} agreement by ${via.toLowerCase()} to ${signer}.${replaced ? ` Replaces ${replaced.template_key || "prior agreement"}; correction: ${replacementReason}.` : ""}${nvReason ? ` Non-tiered approved: ${nvReason}.` : ""}`,
    meta: { esign_id: row.id, submission_id: client.submission_id, via, ...(replaced ? { replacement_of: replaced.id, replacement_reason: replacementReason, supervisor_review_required: signedReplacement } : {}), ...(emergencyResign ? { emergency_resign_group: emergency.row.packet_group } : {}), ...(nvReason ? { nv_variant: "flat", nv_reason: nvReason } : {}) },
  });

  const identity = { claim_id: signClaimId, agreement_id: row.id, lead_id: fileLeadId, template_key: key, replacement_of: replaced?.id || null, owner_review_required: signedReplacement };
  if (textError) return NextResponse.json({ ok: true, status: "sent", ...identity, warning: `The agreement is ready, but the text did not go out: ${textError}. Use Send agreement again in the Retainer section.` });
  return NextResponse.json({ ok: true, status: "sent", ...identity });
  } finally {
    // Safe only while no create/uncertain provider mutation was attempted.
    // A crashed process leaves its reservation held rather than risking a
    // second send. An ordinary validation refusal releases it explicitly.
    if (!keepHeld) await rejectSendAttempt(admin, attempt.id);
  }
}

// GET /api/calls/esign?lead_id=&call_id=
// The live Sent, Opened, Signed steps. Asks DocuSeal for anything not finished.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const leadId = url.searchParams.get("lead_id") || "";
  const callId = url.searchParams.get("call_id") || "";
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const context = await resolveSigningMatter(sb, leadId, { claimId: url.searchParams.get("claim_id"), callId: callId || null, allowArchived: true });
  if (!context.ok) return NextResponse.json({ error: context.error, ambiguous: !!context.ambiguous }, { status: context.status });
  const pending = await readPendingSendAttempt(admin, context.matter.claim.id);
  if (!pending.ok) return NextResponse.json({ error: pending.error }, { status: pending.status });
  const passengerHolds = await admin.from("esign_send_attempts").select("id,state,created_at,pax_index,pax_key")
    .eq("parent_claim_id", context.matter.claim.id).in("state", ["reserved", "provider_pending", "uncertain"]);
  if (passengerHolds.error) return NextResponse.json({ error: "Could not verify passenger agreement sends. Refresh before sending another agreement." }, { status: 503 });
  const paxSendAttempts: Record<string, any> = {};
  for (const entry of passengerHolds.data ?? []) { const hold = safeSendAttempt(entry); if (hold && entry.pax_index != null) paxSendAttempts[String(entry.pax_index)] = hold; }

  // Every live submission goes through the one sync, INCLUDING completed rows
  // whose pointers exist: the manifest check inside syncSubmission is what
  // notices a missing secondary, a missing certificate object behind a live
  // pointer, or an unknown doc_count, and repairs it (Astra round 5: the real
  // route never invoked the recovery it told operators to use).
  const LIVE = ["sent", "opened", "signed", "completed"];
  const selected = await getMatterAgreement(sb, context.lead, context.matter, url.searchParams.get("agreement_id"));
  if (!selected.ok) return NextResponse.json({ error: selected.error }, { status: selected.status });
  const main = selected.row;
  const emergency = await getMatterEmergency(sb, context.lead, context.matter);
  if (!emergency.ok) return NextResponse.json({ error: emergency.error }, { status: emergency.status });
  // Nothing live (voided, expired, declined, failed): the send is open again,
  // on every screen, without a reload (Brett, Sep 28: TMP-1186 showed three
  // gray boxes for an agreement that was none of those).
  const DEAD = ["voided", "expired", "declined", "failed"];
  let status = !main || agreementIsVoided(main) || DEAD.includes(main.status) ? "ready" : main.status;
  if (!context.lead.archived_at && main && !agreementIsVoided(main) && LIVE.includes(main.status)) {
    status = await syncSubmission(admin, main, { origin: url.origin });
  }

  const pax: Record<string, string> = {};
  if (callId && !context.lead.archived_at) {
    const { data: rows, error: paxError } = await sb.from("esign_submissions").select("*").eq("call_id", callId).not("pax_index", "is", null)
      .order("created_at", { ascending: false }).limit(30);
    if (paxError) return NextResponse.json({ error: `Could not read passenger agreements: ${paxError.message}` }, { status: 500 });
    for (const r of rows ?? []) {
      if (String(r.pax_index) in pax) continue; // newest row per passenger only
      const child = await resolveSigningMatter(sb, r.lead_id, { claimId: r.claim_id });
      if (!child.ok) return NextResponse.json({ error: child.error }, { status: child.status });
      if (paxParentId(child.lead.external_id) !== leadId || child.lead.firm_id !== context.lead.firm_id) continue;
      const childAgreement = await getMatterAgreement(sb, child.lead, child.matter);
      if (!childAgreement.ok) return NextResponse.json({ error: childAgreement.error }, { status: childAgreement.status });
      if (childAgreement.row?.id !== r.id) continue;
      if (agreementIsVoided(r) || DEAD.includes(r.status)) { pax[String(r.pax_index)] = ""; continue; }
      // Passengers recover the same way as the main agreement (Astra round 5:
      // signed/completed passenger packets never reached the repair path).
      pax[String(r.pax_index)] = LIVE.includes(r.status) ? await syncSubmission(admin, r, { origin: url.origin }) : r.status;
    }
  }
  for (const k of Object.keys(pax)) if (!pax[k]) delete pax[k];
  // The console shows signed for anything signed or complete.
  const templates = context.campaignId ? await sb.from("esign_templates").select("key, name").eq("campaign_id", context.campaignId).eq("provider", "docuseal") : { data: [], error: null };
  if (templates.error) return NextResponse.json({ error: "Could not read this campaign's agreement setup." }, { status: 503 });
  return NextResponse.json({ status: status === "completed" ? "signed" : agreementSendStatus(status), complete: status === "completed", pax,
    claim_id: context.matter.claim.id, agreement_id: main?.id ?? null, templates: templates.data ?? [], case_type: context.matter.claim.claim_type, read_only: !!context.lead.archived_at,
    send_attempt: pending.attempt, pax_send_attempts: paxSendAttempts,
    emergency: emergency.row ? { group: emergency.row.packet_group, status: emergency.row.status, needs_resign: emergencySupersedes(main, emergency.row) } : null,
    agreement: main ? { id: main.id, status: main.status, via: main.via, phone: main.phone, email: main.email, template_key: main.template_key, sent_at: main.created_at, signed_at: main.signed_at, voided_at: main.voided_at, void_reason: main.void_reason } : null });
}
