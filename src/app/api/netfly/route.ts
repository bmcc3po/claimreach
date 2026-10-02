import { NextRequest, NextResponse } from "next/server";
import { netflyContext, netflyMatter } from "@/lib/netfly-server";
import { NETFLY_ANSWER_KEY, NETFLY_CAMPAIGN, NETFLY_FIELD_IDS, NETFLY_UNAVAILABLE_IDS, activeNetflyCall, netflyFlags, validateNetflyCallClose, type NetflyCallClose } from "@/lib/netfly-ontake";
import { parseDob } from "@/lib/mva-call/server";
import { mailColumnsFrom } from "@/lib/us-address";
import { packetShort } from "@/lib/mva-call/esign";
import { saveNetflyHandoff } from "@/lib/netfly-handoff-save";
import { normPhone } from "@/lib/comms";
export const runtime = "edge";

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx || !ctx.actor.can("leads.view")) return fail("NETFLY is unavailable to this account.", 403);
  const key = new URL(req.url).searchParams.get("file");
  if (!key) {
    const { data, error } = await ctx.db.from("leads")
      .select("id, lead_no, claimant_name, phone, created_at")
      .eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(150);
    if (error) return fail("Could not load NETFLY files.", 503);
    const ids = (data ?? []).map(row => row.id);
    const claims = ids.length ? await ctx.db.from("claims").select("id, lead_id, answers, status")
      .eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).in("lead_id", ids) : { data: [], error: null };
    if (claims.error) return fail("Could not load NETFLY matters. Refresh the queue.", 503);
    const claimsByLead = new Map<string, typeof claims.data>();
    for (const claim of claims.data ?? []) claimsByLead.set(claim.lead_id, [...(claimsByLead.get(claim.lead_id) ?? []), claim]);
    const documents = ids.length ? await ctx.db.from("case_documents").select("lead_id, claim_id")
      .eq("firm_id", ctx.campaign.firm_id).eq("doc_type", "netfly_signed_retainer").in("lead_id", ids) : { data: [], error: null };
    if (documents.error) return fail("Could not check NETFLY signed PDFs. Refresh the queue.", 503);
    const documentKeys = new Set((documents.data ?? []).map(doc => `${doc.lead_id}:${doc.claim_id}`));
    if ([...claimsByLead.values()].some(rows => rows.length !== 1)) return fail("A NETFLY file has ambiguous matters. Supervisor review needed.", 409);
    return NextResponse.json({ files: (data ?? []).map(row => {
      const claim = claimsByLead.get(row.id)?.[0];
      const saved = (claim?.answers as any)?.[NETFLY_ANSWER_KEY];
      const missing_source = [
        ...(!Array.isArray(saved?.handoffs) || !saved.handoffs.length ? ["handoff_note"] : []),
        ...(!documentKeys.has(`${row.id}:${claim?.id}`) ? ["signed_retainer_pdf"] : []),
      ];
      return { ...row, claims: claim ? [claim] : [], missing_source, live_call: activeNetflyCall(saved?.live_call) };
    }) });
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
  let original_email_url: string | null = null;
  const originalId = (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY]?.email_import?.original_document_id;
  if (originalId) {
    const original = await ctx.db.from("case_documents").select("storage_path").eq("id", originalId)
      .eq("firm_id", ctx.campaign.firm_id).eq("lead_id", matter.lead.id).eq("claim_id", matter.claim.id).maybeSingle();
    const path = original.data?.storage_path;
    if (path?.startsWith(`${ctx.campaign.firm_id}/${matter.lead.id}/${matter.claim.id}/netfly-email/`) && !/\.\.|%|\\|\/\//.test(path)) {
      const signed = await ctx.db.storage.from("case-docs").createSignedUrl(path, 300);
      original_email_url = signed.data?.signedUrl || null;
    }
  }
  return NextResponse.json({ file: matter.lead, original_email_url, actor_id: ctx.actor.id, live_call: activeNetflyCall((matter.claim.answers as any)?.[NETFLY_ANSWER_KEY]?.live_call),
    canReview: ctx.actor.can("intake.fill"), claim: { id: matter.claim.id, updated_at: matter.claim.updated_at, status: matter.claim.status },
    answers: (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY] ?? {}, retainer: safeDocs });
}

export async function POST(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx) return fail("NETFLY is unavailable to this account.", 403);
  let body: any;
  try { body = await req.json(); } catch { return fail("Invalid request.", 400); }
  if (body?.op === "call_presence") {
    if (!ctx.actor.can("intake.fill")) return fail("This account cannot mark a NETFLY call.", 403);
    const action = String(body.action || "");
    if (!["start", "refresh", "end"].includes(action)) return fail("Choose a call-presence action.", 400);
    const matter = await netflyMatter(ctx, String(body.file || ""));
    if (!matter) return fail("NETFLY file not found.", 404);
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error } = await ctx.db.from("claims").select("answers, updated_at")
        .eq("id", matter.claim.id).eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).single();
      if (error || !current) return fail("Could not check who is on this call.", 503);
      const all = current.answers && typeof current.answers === "object" ? current.answers as Record<string, any> : {};
      const saved = all[NETFLY_ANSWER_KEY] && typeof all[NETFLY_ANSWER_KEY] === "object" ? all[NETFLY_ANSWER_KEY] : {};
      const active = activeNetflyCall(saved.live_call);
      if (active && active.by !== ctx.actor.id && action !== "end") return fail(`${active.by_name} is already marked on the phone with this client.`, 409);
      if (action === "end" && active?.by !== ctx.actor.id) return fail("Only the agent who started this call can clear its indicator.", 409);
      if (action === "refresh" && active?.by !== ctx.actor.id) return fail("This call indicator expired. Start it again if you are still speaking with the client.", 409);
      const live_call = action === "end" ? null : { by: ctx.actor.id, by_name: ctx.actor.name,
        expires_at: new Date(Date.now() + 90_000).toISOString() };
      const { data: updated, error: saveError } = await ctx.db.from("claims")
        .update({ answers: { ...all, [NETFLY_ANSWER_KEY]: { ...saved, live_call } }, updated_at: new Date().toISOString() })
        .eq("id", matter.claim.id).eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id)
        .eq("updated_at", current.updated_at).select("id").maybeSingle();
      if (saveError) return fail("Call indicator did not save. Retry.", 503);
      if (updated) return NextResponse.json({ ok: true, live_call });
    }
    return fail("Another agent updated this call. Refresh and retry.", 409);
  }
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
    const selected = Array.isArray(body.apply_fields) ? body.apply_fields.filter((id: unknown): id is string => typeof id === "string" && NETFLY_FIELD_IDS.has(id)).slice(0, 50) : [];
    try {
      const result = await saveNetflyHandoff(ctx.db, { firmId: ctx.campaign.firm_id, campaignId: ctx.campaign.id,
        claimId: matter.claim.id, leadId: matter.lead.id }, note, selected,
        { by: ctx.actor.id, by_name: ctx.actor.name || "Staff", channel: "staff_entered" });
      const audit = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
        claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name, category: "intake",
        description: "NETFLY email saved and selected blank fields filled", meta: { length: note.length, applied: result.applied, skipped: result.skipped } });
      if (audit.error) return fail("Email saved, but its audit record failed. Refresh and notify a supervisor.", 503);
      return NextResponse.json({ ok: true, applied: result.applied, skipped: result.skipped, revisions: result.revisions });
    } catch (error: any) { return fail(error.message || "Email import failed. Your text is still available to retry.", 503); }
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
      const sourceFieldRevision = Array.isArray(netfly.source_field_revisions) ? netfly.source_field_revisions.length : 0;
      const verification = { status, note, source_revision: handoffs.length, source_field_revision: sourceFieldRevision, at: new Date().toISOString(), by: ctx.actor.id, by_name: ctx.actor.name };
      const next = { ...all, [NETFLY_ANSWER_KEY]: { ...netfly, handoff_verification: verification } };
      const { data: saved, error: saveError } = await ctx.db.from("claims")
        .update({ answers: next, updated_at: new Date().toISOString() })
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).eq("updated_at", current.updated_at)
        .select("id").maybeSingle();
      if (saveError) return fail(`Handoff verification was not saved: ${saveError.message}`, 503);
      if (saved) {
        const audit = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
          claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name, category: "intake",
          description: `NETFLY handoff checked with client: ${status}`, meta: { source_revision: handoffs.length, source_field_revision: sourceFieldRevision, note_length: note.length } });
        if (audit.error) return fail("Verification saved, but its audit record failed. Refresh and notify a supervisor.", 503);
        return NextResponse.json({ ok: true, verification });
      }
    }
    return fail("This file changed while checking the handoff. Retry.", 409);
  }
  if (body?.op === "call_close") {
    if (!ctx.actor.can("intake.fill")) return fail("This account cannot record a NETFLY call.", 403);
    const call: NetflyCallClose = {
      closeout_version: body.closeout_version === 2 ? 2 : undefined,
      completion: String(body.completion || "").slice(0, 40) as NetflyCallClose["completion"],
      disposition: String(body.disposition || "").slice(0, 40) as NetflyCallClose["disposition"],
      dq_reason_key: String(body.dq_reason_key || "").slice(0, 80),
      assessment_reason: String(body.assessment_reason || "").trim().slice(0, 2000),
      transfer_destination: String(body.transfer_destination || "").trim().slice(0, 160),
      transfer_outcome: String(body.transfer_outcome || "").slice(0, 40) as NetflyCallClose["transfer_outcome"],
      transfer_note: String(body.transfer_note || "").trim().slice(0, 2000),
      client_notified_48_business_hours: body.client_notified_48_business_hours === true,
      callback_promised_24_48_hours: body.callback_promised_24_48_hours === true,
    };
    if (call.disposition !== "appears_dq") call.dq_reason_key = "";
    if (call.closeout_version === 2 || call.disposition !== "appears_qualified") {
      call.transfer_destination = "";
      call.transfer_outcome = "not_attempted";
      call.transfer_note = "";
      call.client_notified_48_business_hours = false;
    }
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
      const sourceFieldRevision = Array.isArray(netfly.source_field_revisions) ? netfly.source_field_revisions.length : 0;
      const recordedAt = new Date();
      const recorded = { ...call, source_revision: handoffs.length, source_field_revision: sourceFieldRevision,
        followup_required: call.closeout_version === 2 || call.completion === "incomplete" || call.disposition !== "appears_qualified" || call.transfer_outcome !== "connected",
        callback_window_starts_at: call.closeout_version === 2 ? new Date(recordedAt.getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
        callback_due_at: call.closeout_version === 2 ? new Date(recordedAt.getTime() + 48 * 60 * 60 * 1000).toISOString() : null,
        at: recordedAt.toISOString(), by: ctx.actor.id, by_name: ctx.actor.name };
      const live = activeNetflyCall(netfly.live_call);
      const next = { ...all, [NETFLY_ANSWER_KEY]: { ...netfly, call_close: recorded,
        live_call: live?.by === ctx.actor.id ? null : netfly.live_call || null } };
      const { data: saved, error: saveError } = await ctx.db.from("claims")
        .update({ answers: next, updated_at: new Date().toISOString() })
        .eq("id", matter.claim.id).eq("campaign_id", ctx.campaign.id).eq("updated_at", current.updated_at)
        .select("id").maybeSingle();
      if (saveError) return fail(`Call result was not saved: ${saveError.message}`, 503);
      if (saved) {
        const audit = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
          claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name, category: "intake",
          description: "NETFLY ontake completion and call outcome recorded",
          meta: { completion: call.completion, disposition: call.disposition, dq_reason_key: call.dq_reason_key,
            assessment_reason: call.assessment_reason,
            transfer_outcome: call.transfer_outcome, transfer_destination: call.transfer_destination,
            transfer_note: call.transfer_note, client_notified_48_business_hours: call.client_notified_48_business_hours,
            closeout_version: call.closeout_version, callback_promised_24_48_hours: call.callback_promised_24_48_hours,
            callback_due_at: recorded.callback_due_at,
            source_revision: handoffs.length, source_field_revision: sourceFieldRevision } });
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
      const fields = { ...(netfly.fields || {}), [field]: value, ...(value && NETFLY_UNAVAILABLE_IDS.has(field) ? { [`${field}_unavailable`]: "" } : {}) };
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
      const sourceFieldRevision = Array.isArray(saved.source_field_revisions) ? saved.source_field_revisions.length : 0;
      if (!handoffs.length || saved.handoff_verification?.source_revision !== handoffs.length ||
          (saved.handoff_verification?.source_field_revision ?? 0) !== sourceFieldRevision)
        return fail("Check the latest NETFLY handoff with the client before sending this file to review.", 400);
      if (saved.call_close?.source_revision !== handoffs.length ||
          (saved.call_close?.source_field_revision ?? 0) !== sourceFieldRevision)
        return fail("Record ontake completion and the call outcome before sending this file to review.", 400);
      if (validateNetflyCallClose(saved.call_close as NetflyCallClose))
        return fail("Update the NETFLY call closeout with completion and outcome before review.", 400);
      if (saved.call_close?.completion !== "complete" || saved.call_close?.disposition === "callback_to_finish")
        return fail("This ontake is not complete. Keep it open for the callback instead of sending it to review.", 400);
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
