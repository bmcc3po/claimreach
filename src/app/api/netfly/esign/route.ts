import { NextRequest, NextResponse } from "next/server";
import { netflyContext, netflyMatter } from "@/lib/netfly-server";
import { NETFLY_ANSWER_KEY, NETFLY_RETAINER_TYPE } from "@/lib/netfly-ontake";
import { agreementChoice } from "@/lib/mva-call/agreement-choice";
import { TMP_MVA_PACKETS } from "@/lib/esign-packets/tmp-mva";
import { templateFor, syncSubmission, ssnForForm, packetShort } from "@/lib/mva-call/esign";
import { createSubmission, docusealConfigured, plainDocuSeal, completeIntake } from "@/lib/docuseal";
import { bindSendAttempt, finalizeSendAttempt, holdSendAttempt, markSendPending, rejectSendAttempt, reserveSendAttempt } from "@/lib/mva-call/send-attempt";
import { ensureClientSignedSnapshot } from "@/lib/mva-call/client-signed";
import { parseDob, dobForForm } from "@/lib/mva-call/server";
import { readIdentityForSigning, saveIdentity, normalizeIdentityValue } from "@/lib/mva-call/identity";
import { SIGNED_BUCKET } from "@/lib/signed-docs";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "edge";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const nameOk = (v: string) => /^[\p{L}\p{M}.'’ -]{3,120}$/u.test(v) && v.trim().split(/\s+/).length >= 2;
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isoDate = (v: string) => parseDob(v) === v;

async function scoped(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx || !ctx.actor.can("intake.fill")) return null;
  const key = req.method === "GET" ? new URL(req.url).searchParams.get("file") : null;
  return { ctx, key };
}

async function latest(ctx: NonNullable<Awaited<ReturnType<typeof netflyContext>>>, leadId: string, claimId: string) {
  const { data, error } = await ctx.db.from("esign_submissions").select("*")
    .eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id)
    .eq("lead_id", leadId).eq("claim_id", claimId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Could not check this file's corrected agreement.");
  return data;
}

async function signedUrl(ctx: NonNullable<Awaited<ReturnType<typeof netflyContext>>>, path: string | null) {
  if (!path || !path.startsWith(`${ctx.campaign.firm_id}/`) || /\.\.|%|\\|\/\//.test(path)) return null;
  const { data } = await ctx.db.storage.from(SIGNED_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

async function correctionOriginal(ctx: NonNullable<Awaited<ReturnType<typeof netflyContext>>>, matter: Matter) {
  const saved = (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY] || {};
  const { data: original, error } = await ctx.db.from("case_documents").select("id")
    .eq("firm_id", ctx.campaign.firm_id).eq("lead_id", matter.lead.id).eq("claim_id", matter.claim.id)
    .eq("doc_type", NETFLY_RETAINER_TYPE).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !original) return { ok: false as const, error: "Upload the original signed retainer first." };
  if (saved.review?.status !== "correction_needed" || saved.review?.document_id !== original.id || String(saved.review?.note || "").trim().length < 5)
    return { ok: false as const, error: "Review the signed original and record its correction before preparing a new link." };
  return { ok: true as const, original, saved };
}

export async function GET(req: NextRequest) {
  const scope = await scoped(req);
  if (!scope) return fail("NETFLY signing is unavailable to this account.", 403);
  const { ctx } = scope;
  const matter = await netflyMatter(ctx, String(scope.key || ""));
  if (!matter) return fail("NETFLY file not found.", 404);
  let row;
  try { row = await latest(ctx, matter.lead.id, matter.claim.id); }
  catch { return fail("Could not check the corrected agreement.", 503); }
  if (!row) return NextResponse.json({ agreement: null });
  let status, refreshed;
  try {
    status = await syncSubmission(ctx.db, row, { origin: new URL(req.url).origin });
    refreshed = await latest(ctx, matter.lead.id, matter.claim.id);
  } catch { return fail("Could not verify the corrected agreement status. Refresh and try again.", 503); }
  const current = refreshed ?? row;
  const clientCopy = current.status === "signed" ? await ensureClientSignedSnapshot(ctx.db, current) : null;
  const snapshot = clientCopy?.ok ? clientCopy.path : null;
  return NextResponse.json({ agreement: { id: current.id, status, template_key: current.template_key,
    signer_name: current.signer_name, email: current.email, sent_at: current.sent_at,
    signed_at: current.signed_at, agent_reviewed_at: current.agent_reviewed_at,
    completed_at: current.completed_at, sign_url: current.status === "sent" || current.status === "opened" ? current.sign_url : null,
    client_pdf_url: await signedUrl(ctx, snapshot), final_pdf_url: await signedUrl(ctx, current.completed_pdf_path),
    packet_ready: current.status === "completed" && !(await packetShort(ctx.db, current)) } });
}

type Matter = NonNullable<Awaited<ReturnType<typeof netflyMatter>>>;
async function correctionValues(ctx: NonNullable<Awaited<ReturnType<typeof netflyContext>>>, matter: Matter, body: Record<string, any>) {
  const saved = (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY] || {};
  const name = String(body.name || saved.fields?.confirmed_name || matter.lead.claimant_name || "").trim();
  const state = String(body.state || saved.fields?.accident_state || "").trim();
  const city = String(body.city || saved.fields?.accident_city || "").trim();
  const date = String(body.accident_date || saved.fields?.accident_date || "").trim();
  const variant = String(body.nv_variant || "tiered");
  const choice = agreementChoice(`${city}, ${state}`, variant, Object.keys(TMP_MVA_PACKETS));
  if (!nameOk(name) || name.toLocaleLowerCase() !== String(matter.lead.claimant_name || "").trim().toLocaleLowerCase())
    return { ok: false as const, error: "Verify and save the client's corrected full name on this file first.", status: 400 };
  if (!choice.available || !choice.key) return { ok: false as const, error: choice.error || "Confirm the accident state and contract.", status: 400 };
  if (!isoDate(date)) return { ok: false as const, error: "Confirm the exact accident date before previewing a correction.", status: 400 };
  const reason = String(body.nv_reason || "").trim().slice(0, 300);
  if (choice.requiresReason && reason.length < 5) return { ok: false as const, error: "Record who approved the Nevada non-tiered agreement.", status: 400 };
  const [y, m, d] = date.split("-");
  return { ok: true as const, name, choice, reason, doi: `${m}/${d}/${y}`, today: new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date()) };
}

export async function POST(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx || !ctx.actor.can("intake.fill")) return fail("NETFLY signing is unavailable to this account.", 403);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("Invalid request.");
  const matter = await netflyMatter(ctx, String(body.file || ""));
  if (!matter) return fail("NETFLY file not found.", 404);
  if (body.op === "preview") {
    const correction = await correctionOriginal(ctx, matter);
    if (!correction.ok) return fail(correction.error, 409);
    if (await latest(ctx, matter.lead.id, matter.claim.id)) return fail("A corrected agreement already exists on this file.", 409);
    const values = await correctionValues(ctx, matter, body);
    if (!values.ok) return fail(values.error, values.status);
    const { stampPreview } = await import("@/lib/mva-call/preview");
    const packet = TMP_MVA_PACKETS[values.choice.key!];
    const src = await fetch(new URL(packet.path, req.url));
    if (!src.ok) return fail("Could not load the approved TMP packet.", 502);
    const out = await stampPreview(new Uint8Array(await src.arrayBuffer()), packet, values.choice.key!,
      { signer: values.name, injured: values.name, today: values.today, doi: values.doi });
    return new Response(out as unknown as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": "inline; filename=netfly-correction-preview.pdf", "cache-control": "no-store" } });
  }
  if (body.op === "review") return review(ctx, matter, body);
  if (body.op === "complete") return complete(ctx, matter, body, req);
  if (body.op !== "send") return fail("Unknown NETFLY agreement action.");
  if (!docusealConfigured()) return fail("DocuSeal is not configured.", 503);
  if (body.confirm !== true) return fail("Confirm the exact recipient and corrected contract before sending.");
  const correction = await correctionOriginal(ctx, matter);
  if (!correction.ok) return fail(correction.error, 409);
  const { saved, original } = correction;
  const values = await correctionValues(ctx, matter, body);
  if (!values.ok) return fail(values.error, values.status);
  const recipient = String(body.email || "").trim().toLowerCase();
  if (!emailOk(recipient) || recipient !== String(matter.lead.email || "").trim().toLowerCase())
    return fail("Verify and save the client's corrected email on the file before sending.");
  const existing = await latest(ctx, matter.lead.id, matter.claim.id);
  if (existing) return fail("A corrected link already exists on this NETFLY file. Open its status; do not send another.", 409);
  const reserved = await reserveSendAttempt(ctx.db, { claimId: matter.claim.id, actorId: ctx.actor.id, paxKey: null, paxIndex: null });
  if (!reserved.ok) return fail(reserved.error, reserved.status);
  let release = true;
  const attempt = reserved.attempt;
  try {
    const packet = TMP_MVA_PACKETS[values.choice.key!];
    const template = await templateFor(ctx.db, { firmId: ctx.campaign.firm_id, campaignId: ctx.campaign.id,
      key: values.choice.key!, packet, origin: new URL(req.url).origin, actorId: ctx.actor.id, create: true });
    if (!template.ok) return fail(template.error, 503);
    const identity = await readIdentityForSigning(ctx.db, { leadId: matter.lead.id, claimId: matter.claim.id, firmId: ctx.campaign.firm_id });
    if (!identity.ok) return fail(identity.error, identity.status);
    const dob = parseDob(saved.fields?.dob);
    const ssn = ssnForForm(identity.identity?.ssn);
    const bound = await bindSendAttempt(ctx.db, attempt.id, { leadId: matter.lead.id, claimId: matter.claim.id,
      expectedId: null, expectedStatus: null, templateKey: values.choice.key!, templateId: template.templateId,
      via: "Email", sendContext: { signer_name: values.name, injured_name: values.name, email: recipient, phone: matter.lead.phone || null } });
    if (!bound.ok) return fail(bound.error, bound.status);
    const pending = await markSendPending(ctx.db, attempt.id);
    if (!pending.ok) { release = false; return fail(pending.error, pending.status); }
    release = false;
    const session = await (await supabaseServer()).auth.getUser();
    const response = await createSubmission({ templateId: template.templateId,
      client: { name: values.name, email: recipient, phone: matter.lead.phone,
        values: { "Client Name": values.name, "Injured Party Name": values.name, "Accident Date": values.doi, "Signing Date": values.today } },
      intake: { email: session?.data?.user?.email || "intake@claimreach.com", name: ctx.actor.name || "Intake",
        values: { ...(dob ? { "Patient DOB": dobForForm(dob) } : {}), ...(ssn ? { "Patient SSN": ssn.printed } : {}) } },
      emailClient: true, externalId: attempt.id });
    if (!response.ok) {
      if (response.definitiveRejection) await rejectSendAttempt(ctx.db, attempt.id, true);
      else await holdSendAttempt(ctx.db, attempt.id, "provider_create_unconfirmed");
      return fail(response.definitiveRejection ? plainDocuSeal(response.error, response.status, "send") : "DocuSeal did not confirm the send. Do not retry; an owner must reconcile this file.", 502);
    }
    const list: any[] = Array.isArray(response.data) ? response.data : Array.isArray((response.data as any)?.submitters) ? (response.data as any).submitters : [];
    const client = list.find((s) => s.role === "Client");
    const intake = list.find((s) => s.role === "Intake");
    if (!client?.id || !client.submission_id || !intake?.id || !client.embed_src) {
      await holdSendAttempt(ctx.db, attempt.id, "provider_response_incomplete");
      return fail("DocuSeal returned an incomplete response. An owner must reconcile this send before another.", 503);
    }
    const finalized = await finalizeSendAttempt(ctx.db, attempt.id, { firm_id: ctx.campaign.firm_id,
      lead_id: matter.lead.id, campaign_id: ctx.campaign.id, claim_id: matter.claim.id, provider: "docuseal",
      template_key: values.choice.key!, template_id: template.templateId, submission_id: String(client.submission_id),
      client_submitter_id: String(client.id), intake_submitter_id: String(intake.id), signer_name: values.name,
      injured_name: values.name, email: recipient, phone: matter.lead.phone || null, via: "Email",
      status: "sent", sign_url: client.embed_src, sent_by: ctx.actor.id });
    if (!finalized.ok) {
      await holdSendAttempt(ctx.db, attempt.id, "local_finalize_unconfirmed");
      return fail("DocuSeal created the link, but ClaimReach could not confirm its file record. An owner must reconcile it; do not resend.", 503);
    }
    const { error: auditError } = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
      claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name || "Agent", category: "retainer",
      description: `Emergency NETFLY corrected ${values.choice.key} agreement sent to ${recipient}; original PDF remains on file.`,
      meta: { agreement_id: finalized.id, original_document_id: original.id,
        correction_reason: saved.review.note, approval_reason: values.reason || null, channel: "Email" } });
    if (auditError) return fail("The corrected link was sent and saved, but its audit entry failed. Do not send another; ask a supervisor to reconcile the record.", 503);
    return NextResponse.json({ ok: true, agreement_id: finalized.id, status: "sent" });
  } catch {
    if (!release) await holdSendAttempt(ctx.db, attempt.id, "provider_create_unconfirmed");
    return fail("The corrected send could not be confirmed. Do not retry; an owner must reconcile this file.", 503);
  } finally {
    if (release) await rejectSendAttempt(ctx.db, attempt.id);
  }
}

async function review(ctx: NonNullable<Awaited<ReturnType<typeof netflyContext>>>, matter: Matter, body: any) {
  const row = await latest(ctx, matter.lead.id, matter.claim.id);
  if (!row || row.id !== body.agreement_id || row.status !== "signed" || !row.signed_at || row.voided_at)
    return fail("Wait for the client to sign the current corrected agreement before reviewing it.", 409);
  if (row.agent_reviewed_at) return NextResponse.json({ ok: true, already: true });
  const snapshot = await ensureClientSignedSnapshot(ctx.db, row);
  if (!snapshot.ok) return fail(`The signed PDF is not available yet: ${snapshot.error}`, 503);
  const at = new Date().toISOString();
  const { data, error } = await ctx.db.from("esign_submissions").update({ agent_reviewed_at: at, agent_reviewed_by: ctx.actor.id, updated_at: at })
    .eq("id", row.id).eq("claim_id", matter.claim.id).eq("status", "signed").is("agent_reviewed_at", null).select("id").maybeSingle();
  if (error || !data) return fail("Agreement changed during review. Refresh and retry.", 409);
  const { error: auditError } = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
    claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name || "Agent", category: "retainer",
    description: "Reviewed the client-signed NETFLY correction PDF.", meta: { agreement_id: row.id, snapshot: snapshot.path } });
  if (auditError) return fail("Review saved, but its audit entry failed. Ask a supervisor to reconcile the record.", 503);
  return NextResponse.json({ ok: true, reviewed_at: at });
}

async function complete(ctx: NonNullable<Awaited<ReturnType<typeof netflyContext>>>, matter: Matter, body: any, req: NextRequest) {
  const row = await latest(ctx, matter.lead.id, matter.claim.id);
  if (!row || row.id !== body.agreement_id || row.status !== "signed" || !row.agent_reviewed_at || !row.intake_submitter_id)
    return fail("Review the client-signed corrected PDF before completing the office signer.", 409);
  const dob = parseDob(body.dob || (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY]?.fields?.dob);
  const digits = normalizeIdentityValue(body.ssn, String(body.ssn || "").replace(/\D/g, "").length === 4 ? "last4" : "full");
  if (!dob || !digits) return fail("Enter the client's date of birth and SSN (all 9 digits or last 4) for the HIPAA pages.");
  const identityScope = { leadId: matter.lead.id, claimId: matter.claim.id, firmId: ctx.campaign.firm_id };
  const current = await readIdentityForSigning(ctx.db, identityScope);
  if (!current.ok) return fail(current.error, current.status);
  if (current.identity && digits !== current.identity.ssn && digits !== current.identity.ssn.slice(-4))
    return fail("The entered SSN differs from the saved identity. Review the file before completing.", 409);
  if (ctx.campaign.ssn_require_full === true && (current.identity?.ssn || digits).length !== 9)
    return fail("This campaign requires the full 9-digit Social Security number for the HIPAA pages.");
  if (!current.identity) {
    const kept = await saveIdentity(ctx.db, identityScope, { ssn: digits,
      mode: digits.length === 4 ? "last4" : "full", expectedVersion: 0, actorId: ctx.actor.id });
    if (!kept.ok) return fail(kept.error, kept.status);
  }
  const ssn = ssnForForm(current.identity?.ssn || digits)!;
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date());
  const done = await completeIntake(row.intake_submitter_id, { "Patient DOB": dobForForm(dob), "Patient SSN": ssn.printed, "Firm Date": date });
  if (!done.ok) return fail("DocuSeal did not confirm office completion. Refresh status before retrying.", 502);
  const { error } = await ctx.db.from("leads").update({ dob, ssn_last4: ssn.last4 })
    .eq("id", matter.lead.id).eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id);
  if (error) return fail("The office signer completed, but the file did not update. Contact an owner.", 503);
  const { error: auditError } = await ctx.db.from("audit_log").insert({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id,
    claim_id: matter.claim.id, actor: ctx.actor.id, actor_name: ctx.actor.name || "Agent", category: "retainer",
    description: "Completed the NETFLY corrected agreement's office signer fields.", meta: { agreement_id: row.id } });
  if (auditError) return fail("Office signer completed, but its audit entry failed. Ask a supervisor to reconcile the record.", 503);
  const status = await syncSubmission(ctx.db, row, { actorName: ctx.actor.name || "Agent", origin: new URL(req.url).origin });
  return NextResponse.json({ ok: true, status });
}
