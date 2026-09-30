import { NextRequest, NextResponse } from "next/server";
import { netflyContext, netflyMatter } from "@/lib/netfly-server";
import { NETFLY_ANSWER_KEY, NETFLY_CAMPAIGN, NETFLY_FIELD_IDS, netflyFlags, validateNetflyCallClose, type NetflyCallClose } from "@/lib/netfly-ontake";
import { parseDob } from "@/lib/mva-call/server";
import { mailColumnsFrom } from "@/lib/us-address";
import { packetShort } from "@/lib/mva-call/esign";
import { normPhone } from "@/lib/comms";
export const runtime = "edge";

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx || !ctx.actor.can("leads.view")) return fail("NETFLY is unavailable to this account.", 403);
  const key = new URL(req.url).searchParams.get("file");
  if (!key) {
    const { data, error } = await ctx.db.from("leads")
      .select("id, lead_no, claimant_name, phone, created_at, claims(id, answers, status)")
      .eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(150);
    if (error) return fail("Could not load NETFLY files.", 503);
    return NextResponse.json({ files: data ?? [] });
  }
  const matter = await netflyMatter(ctx, key);
  if (!matter) return fail("NETFLY file not found.", 404);
  const { data: docs, error } = await ctx.db.from("case_documents")
    .select("id, file_name, storage_path, created_at, uploaded_by_name")
    .eq("firm_id", ctx.campaign.firm_id).eq("lead_id", matter.lead.id).eq("claim_id", matter.claim.id)
    .eq("doc_type", "netfly_signed_retainer").order("created_at", { ascending: false });
  if (error) return fail("Could not check the signed retainer. Refresh before continuing.", 503);
  const safeDocs = await Promise.all((docs ?? []).map(async (doc) => {
    const prefix = `${ctx.campaign.firm_id}/${matter.lead.id}/`;
    if (!doc.storage_path?.startsWith(prefix) || /\.\.|%|\\|\/\//.test(doc.storage_path)) return { id: doc.id, file_name: doc.file_name, created_at: doc.created_at, url: null };
    const { data } = await ctx.db.storage.from("case-docs").createSignedUrl(doc.storage_path, 300);
    return { id: doc.id, file_name: doc.file_name, created_at: doc.created_at, uploaded_by_name: doc.uploaded_by_name, url: data?.signedUrl ?? null };
  }));
  return NextResponse.json({ file: matter.lead, canReview: ctx.actor.can("intake.fill"), claim: { id: matter.claim.id, updated_at: matter.claim.updated_at, status: matter.claim.status },
    answers: (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY] ?? {}, retainer: safeDocs });
}

export async function POST(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx) return fail("NETFLY is unavailable to this account.", 403);
  let body: any;
  try { body = await req.json(); } catch { return fail("Invalid request.", 400); }
  if (body?.op === "create" || body?.op === "start_call") {
    if (!ctx.actor.can("leads.edit")) return fail("This account cannot add files.", 403);
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 160);
    if (name.length < 2) return fail("Enter the client's name.", 400);
    const phone = String(body.phone || "").trim().slice(0, 40);
    const email = String(body.email || "").trim().slice(0, 254);
    const sourceNote = String(body.source_note || "").trim();
    if (sourceNote.length > 20000) return fail("The NETFLY handoff note is too long (20,000 characters maximum).", 400);
    if (body.op === "start_call") {
      if (sourceNote) return fail("Add NETFLY's handoff note on the signed-transfer file.", 400);
      const normalized = normPhone(phone);
      if (normalized.length === 10) {
        const { data: existing, error: existingError } = await ctx.db.from("leads").select("id, lead_no, claimant_name")
          .eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id)
          .eq("phone_norm", normalized).is("archived_at", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (existingError) return fail("Could not check for an existing NETFLY file. Retry before creating another.", 503);
        if (existing) {
          if (String(existing.claimant_name || "").trim().toLowerCase() !== name.toLowerCase())
            return fail("A NETFLY file already uses this phone with a different name. Review that file before starting another.", 409);
          return NextResponse.json({ file: existing, existing: true });
        }
      }
    }
    const parts = name.split(" ");
    const { data: number, error: numberError } = await ctx.db.rpc("mint_lead_no", { p_firm: ctx.campaign.firm_id });
    if (numberError || !number) return fail("Could not assign a lead number.", 503);
    const { data: lead, error: leadError } = await ctx.db.from("leads").insert({
      firm_id: ctx.campaign.firm_id, campaign_id: ctx.campaign.id, campaign: NETFLY_CAMPAIGN,
      case_type: "mva", lead_no: number, claimant_name: name, first_name: parts[0], last_name: parts.slice(1).join(" "),
      phone: phone || null, email: email || null, marketing_source: "NETFLY", stage: "referral_received",
      created_by: ctx.actor.id, assigned_agent: ctx.actor.id, intake_agent_id: ctx.actor.id,
      // Hold all automated acquisition outreach on a secondary intake.
      perm_call: false, perm_text: false, perm_email: false,
    }).select("id, lead_no").single();
    if (leadError || !lead) return fail(`Could not create NETFLY file: ${leadError?.message || "unknown error"}`, 503);
    const prefill = {
      accident_city: String(body.city || "").trim().slice(0, 120), accident_state: String(body.state || "").trim().slice(0, 80),
      accident_month_year: String(body.month_year || "").trim().slice(0, 80),
      transfer_fault: String(body.at_fault || "").trim().slice(0, 30),
      confirmed_name: name, confirmed_email: email, confirmed_phone: phone,
    };
    const { error: claimError } = await ctx.db.from("claims").insert({
      firm_id: ctx.campaign.firm_id, lead_id: lead.id, campaign_id: ctx.campaign.id,
      campaign: NETFLY_CAMPAIGN, claim_type: "mva", status: "new",
      answers: { [NETFLY_ANSWER_KEY]: { version: 1, fields: prefill, review: { status: "in_progress" },
        handoffs: sourceNote ? [{ note: sourceNote, at: new Date().toISOString(), by: ctx.actor.id, by_name: ctx.actor.name, channel: "staff_entered" }] : [] } },
    });
    if (claimError) {
      await ctx.db.from("leads").update({ archived_at: new Date().toISOString(), archived_by: ctx.actor.id }).eq("id", lead.id);
      return fail(`The matter could not be created. The partial lead was archived: ${claimError.message}`, 503);
    }
    return NextResponse.json({ file: lead });
  }
  if (body?.op === "handoff") {
    if (!ctx.actor.can("intake.fill")) return fail("This account cannot record a handoff.", 403);
    const note = String(body.note || "").trim();
    if (note.length < 10 || note.length > 20000) return fail("Paste the NETFLY note (10 to 20,000 characters).", 400);
    const matter = await netflyMatter(ctx, String(body.file || ""));
    if (!matter) return fail("NETFLY file not found.", 404);
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readError } = await ctx.db.from("claims").select("answers, updated_at")
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).single();
      if (readError || !current) return fail("Could not check the latest handoff.", 503);
      const all = current.answers && typeof current.answers === "object" ? current.answers as Record<string, any> : {};
      const netfly = all[NETFLY_ANSWER_KEY] && typeof all[NETFLY_ANSWER_KEY] === "object" ? all[NETFLY_ANSWER_KEY] : {};
      const handoffs: any[] = Array.isArray(netfly.handoffs) ? netfly.handoffs : [];
      if (handoffs.at(-1)?.note === note) return NextResponse.json({ ok: true, already_saved: true });
      if (handoffs.length >= 20) return fail("This handoff has too many revisions. Ask a supervisor to review the file.", 409);
      const next = { ...all, [NETFLY_ANSWER_KEY]: { ...netfly, handoffs: [...handoffs,
        { note, at: new Date().toISOString(), by: ctx.actor.id, by_name: ctx.actor.name, channel: "staff_entered" }],
        review: { ...(netfly.review || {}), status: "in_progress" } } };
      const { data: saved, error: saveError } = await ctx.db.from("claims")
        .update({ answers: next, updated_at: new Date().toISOString() })
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).eq("updated_at", current.updated_at)
        .select("id").maybeSingle();
      if (saveError) return fail(`Handoff was not saved: ${saveError.message}`, 503);
      if (saved) {
        const audit = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
          claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name, category: "intake",
          description: handoffs.length ? "NETFLY handoff correction appended" : "NETFLY handoff note recorded",
          meta: { revision: handoffs.length + 1, length: note.length } });
        if (audit.error) return fail("Handoff saved, but its audit record failed. Refresh and notify a supervisor.", 503);
        return NextResponse.json({ ok: true, revisions: handoffs.length + 1 });
      }
    }
    return fail("This file changed while saving the handoff. Retry.", 409);
  }
  if (body?.op === "verify_handoff") {
    if (!ctx.actor.can("intake.fill")) return fail("This account cannot verify a handoff.", 403);
    const status = String(body.status || "");
    if (!["matches", "changes_recorded"].includes(status)) return fail("Choose whether the NETFLY handoff matches the client's account.", 400);
    const note = String(body.note || "").trim().slice(0, 2000);
    if (status === "changes_recorded" && note.length < 5) return fail("Record what changed before marking the handoff checked.", 400);
    const matter = await netflyMatter(ctx, String(body.file || ""));
    if (!matter) return fail("NETFLY file not found.", 404);
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readError } = await ctx.db.from("claims").select("answers, updated_at")
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).single();
      if (readError || !current) return fail("Could not check the latest handoff.", 503);
      const all = current.answers && typeof current.answers === "object" ? current.answers as Record<string, any> : {};
      const netfly = all[NETFLY_ANSWER_KEY] && typeof all[NETFLY_ANSWER_KEY] === "object" ? all[NETFLY_ANSWER_KEY] : {};
      const handoffs: any[] = Array.isArray(netfly.handoffs) ? netfly.handoffs : [];
      if (!handoffs.length) return fail("Add NETFLY's original handoff note before verifying it.", 400);
      const verification = { status, note, source_revision: handoffs.length, at: new Date().toISOString(), by: ctx.actor.id, by_name: ctx.actor.name };
      const next = { ...all, [NETFLY_ANSWER_KEY]: { ...netfly, handoff_verification: verification } };
      const { data: saved, error: saveError } = await ctx.db.from("claims")
        .update({ answers: next, updated_at: new Date().toISOString() })
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).eq("updated_at", current.updated_at)
        .select("id").maybeSingle();
      if (saveError) return fail(`Handoff verification was not saved: ${saveError.message}`, 503);
      if (saved) {
        const audit = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
          claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name, category: "intake",
          description: `NETFLY handoff checked with client: ${status}`, meta: { source_revision: handoffs.length, note_length: note.length } });
        if (audit.error) return fail("Verification saved, but its audit record failed. Refresh and notify a supervisor.", 503);
        return NextResponse.json({ ok: true, verification });
      }
    }
    return fail("This file changed while checking the handoff. Retry.", 409);
  }
  if (body?.op === "call_close") {
    if (!ctx.actor.can("intake.fill")) return fail("This account cannot record a NETFLY call.", 403);
    const call: NetflyCallClose = {
      assessment: String(body.assessment || "").slice(0, 40) as NetflyCallClose["assessment"],
      assessment_reason: String(body.assessment_reason || "").trim().slice(0, 2000),
      transfer_destination: String(body.transfer_destination || "").trim().slice(0, 160),
      transfer_outcome: String(body.transfer_outcome || "").slice(0, 40) as NetflyCallClose["transfer_outcome"],
      transfer_note: String(body.transfer_note || "").trim().slice(0, 2000),
      client_notified_48_business_hours: body.client_notified_48_business_hours === true,
    };
    const invalid = validateNetflyCallClose(call);
    if (invalid) return fail(invalid, 400);
    const matter = await netflyMatter(ctx, String(body.file || ""));
    if (!matter) return fail("NETFLY file not found.", 404);
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readError } = await ctx.db.from("claims").select("answers, updated_at")
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).single();
      if (readError || !current) return fail("Could not check the latest NETFLY call.", 503);
      const all = current.answers && typeof current.answers === "object" ? current.answers as Record<string, any> : {};
      const netfly = all[NETFLY_ANSWER_KEY] && typeof all[NETFLY_ANSWER_KEY] === "object" ? all[NETFLY_ANSWER_KEY] : {};
      const handoffs = Array.isArray(netfly.handoffs) ? netfly.handoffs : [];
      if (!handoffs.length) return fail("Add NETFLY's handoff note before closing the welcome call.", 400);
      const recorded = { ...call, source_revision: handoffs.length, followup_required: call.transfer_outcome !== "connected",
        at: new Date().toISOString(), by: ctx.actor.id, by_name: ctx.actor.name };
      const next = { ...all, [NETFLY_ANSWER_KEY]: { ...netfly, call_close: recorded } };
      const { data: saved, error: saveError } = await ctx.db.from("claims")
        .update({ answers: next, updated_at: new Date().toISOString() })
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).eq("updated_at", current.updated_at)
        .select("id").maybeSingle();
      if (saveError) return fail(`Call result was not saved: ${saveError.message}`, 503);
      if (saved) {
        const audit = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
          claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name, category: "intake",
          description: "NETFLY assessment and case-manager introduction recorded",
          meta: { assessment: call.assessment, assessment_reason: call.assessment_reason,
            transfer_outcome: call.transfer_outcome, transfer_destination: call.transfer_destination,
            transfer_note: call.transfer_note, client_notified_48_business_hours: call.client_notified_48_business_hours,
            source_revision: handoffs.length } });
        if (audit.error) return fail("Call result saved, but its audit record failed. Refresh and notify a supervisor.", 503);
        return NextResponse.json({ ok: true, call_close: recorded });
      }
    }
    return fail("This file changed while recording the call. Retry.", 409);
  }
  if (body?.op === "answer") {
    if (!ctx.actor.can("intake.fill")) return fail("This account cannot fill an intake.", 403);
    const field = String(body.field || "");
    if (!NETFLY_FIELD_IDS.has(field)) return fail("Unknown NETFLY question.", 400);
    const value = String(body.value ?? "").trim().slice(0, field.includes("notes") || ["incident_story", "passenger_details", "damage"].includes(field) ? 5000 : 1000);
    const matter = await netflyMatter(ctx, String(body.file || ""));
    if (!matter) return fail("NETFLY file not found.", 404);
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readError } = await ctx.db.from("claims").select("answers, updated_at")
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).single();
      if (readError || !current) return fail("Could not check the latest answers.", 503);
      const all = current.answers && typeof current.answers === "object" ? current.answers as Record<string, any> : {};
      const netfly = all[NETFLY_ANSWER_KEY] && typeof all[NETFLY_ANSWER_KEY] === "object" ? all[NETFLY_ANSWER_KEY] : {};
      const fields = { ...(netfly.fields || {}), [field]: value };
      const next = { ...all, [NETFLY_ANSWER_KEY]: { ...netfly, version: 1, fields, review: { ...(netfly.review || {}), flags: netflyFlags(fields) } } };
      const { data: saved, error: saveError } = await ctx.db.from("claims")
        .update({ answers: next, updated_at: new Date().toISOString() })
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).eq("updated_at", current.updated_at)
        .select("id").maybeSingle();
      if (saveError) return fail(`Answer was not saved: ${saveError.message}`, 503);
      if (saved) {
        const leadPatch: Record<string, string> = {};
        if (field === "confirmed_name" && value) {
          const words = value.split(/\s+/).filter(Boolean);
          leadPatch.claimant_name = value;
          leadPatch.first_name = words[0] || "";
          leadPatch.last_name = words.slice(1).join(" ");
        }
        if (field === "confirmed_email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) leadPatch.email = value;
        if (field === "confirmed_phone" && /^\d{10}$/.test(value.replace(/\D/g, ""))) leadPatch.phone = value.replace(/\D/g, "");
        if (field === "dob" && parseDob(value)) leadPatch.dob = parseDob(value)!;
        if (field === "mailing_address" && value) Object.assign(leadPatch, mailColumnsFrom({}, value, true));
        if (Object.keys(leadPatch).length) {
          const { error: leadError } = await ctx.db.from("leads").update(leadPatch)
            .eq("id", matter.lead.id).eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id);
          if (leadError) return fail("Answer saved, but the main contact record did not update. Refresh and notify a supervisor.", 503);
        }
        return NextResponse.json({ ok: true, flags: netflyFlags(fields) });
      }
    }
    return fail("This file changed while you were answering. Retry this answer.", 409);
  }
  if (body?.op === "review") {
    const status = String(body.status || "");
    if (!["ready_for_review", "needs_supervisor", "retainer_reviewed", "correction_needed"].includes(status)) return fail("Invalid review action.", 400);
    // The agent who speaks with the client must be able to inspect and mark
    // the signed PDF reviewed. Formal QA remains a separate downstream step.
    if (!ctx.actor.can("intake.fill")) return fail("This account cannot record that review action.", 403);
    const matter = await netflyMatter(ctx, String(body.file || ""));
    if (!matter) return fail("NETFLY file not found.", 404);
    if (status === "retainer_reviewed" && (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY]?.review?.status === "correction_needed")
      return fail("The original is flagged for correction. Review and complete the corrected agreement instead.", 409);
    let corrected: boolean | null = null;
    if (["ready_for_review", "retainer_reviewed"].includes(status)) {
      const result = await ctx.db.from("esign_submissions").select("id,status,agent_reviewed_at,completed_pdf_path,cert_pdf_path,doc_count,submission_id,firm_id")
        .eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id)
        .eq("lead_id", matter.lead.id).eq("claim_id", matter.claim.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (result.error) return fail("Could not check the corrected agreement. Refresh and retry.", 503);
      if (status === "retainer_reviewed" && result.data) return fail("A corrected agreement is already on this file. Review that signed packet instead.", 409);
      if (result.data) corrected = result.data.status === "completed" && !!result.data.agent_reviewed_at && !(await packetShort(ctx.db, result.data));
    }
    if (status === "ready_for_review") {
      const saved = (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY] || {};
      if ((saved.review?.status === "correction_needed" || corrected !== null) && !corrected)
        return fail("The corrected agreement must be client-signed, agent-reviewed, office-completed, and stored before QA.", 409);
      const handoffs = Array.isArray(saved.handoffs) ? saved.handoffs : [];
      if (!handoffs.length || saved.handoff_verification?.source_revision !== handoffs.length)
        return fail("Check the latest NETFLY handoff with the client before sending this file to review.", 400);
      if (saved.call_close?.source_revision !== handoffs.length)
        return fail("Record your case assessment and case-manager introduction outcome before sending this file to review.", 400);
      const { data: docs, error: docsError } = await ctx.db.from("case_documents").select("id")
        .eq("firm_id", ctx.campaign.firm_id).eq("lead_id", matter.lead.id).eq("claim_id", matter.claim.id)
        .eq("doc_type", "netfly_signed_retainer").order("created_at", { ascending: false }).limit(1);
      if (docsError || !docs?.length) return fail("Upload the original signed PDF before sending this file to review.", 400);
      if (!corrected && saved.review?.retainer_reviewed_document_id !== docs[0].id)
        return fail("Review the latest uploaded signed PDF before sending this file to review.", 400);
    }
    const documentId = String(body.document_id || "");
    if (["retainer_reviewed", "correction_needed"].includes(status)) {
      const { data: doc } = await ctx.db.from("case_documents").select("id").eq("id", documentId)
        .eq("lead_id", matter.lead.id).eq("claim_id", matter.claim.id).eq("doc_type", "netfly_signed_retainer").maybeSingle();
      if (!doc) return fail("Choose this matter's uploaded retainer first.", 400);
    }
    const note = String(body.note || "").trim().slice(0, 1000);
    if (status === "correction_needed" && note.length < 5) return fail("Record what is wrong with the original retainer.", 400);
    const all = matter.claim.answers && typeof matter.claim.answers === "object" ? matter.claim.answers as Record<string, any> : {};
    const old = all[NETFLY_ANSWER_KEY] || {};
    if (status === "correction_needed" && old.review?.retainer_reviewed_document_id !== documentId)
      return fail("Open and mark the signed PDF reviewed before flagging a correction.", 409);
    const review = { ...(old.review || {}), status, note, document_id: documentId || old.review?.document_id || null,
      retainer_reviewed_document_id: status === "retainer_reviewed" ? documentId : status === "correction_needed" ? null : old.review?.retainer_reviewed_document_id || null,
      at: new Date().toISOString(), by: ctx.actor.id, by_name: ctx.actor.name };
    const { data: updated, error } = await ctx.db.from("claims").update({
      answers: { ...all, [NETFLY_ANSWER_KEY]: { ...old, review } }, updated_at: new Date().toISOString(),
    }).eq("id", matter.claim.id).eq("updated_at", matter.claim.updated_at).select("id").maybeSingle();
    if (error || !updated) return fail("Review was not saved. Refresh and retry.", 409);
    const audit = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
      claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name, category: "retainer",
      description: `NETFLY review: ${status}`, meta: { document_id: documentId || null, note } });
    if (audit.error) return fail("Review saved, but audit recording failed. Contact a supervisor before proceeding.", 503);
    return NextResponse.json({ ok: true, review });
  }
  return fail("Unknown NETFLY action.", 400);
}
