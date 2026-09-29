import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, firmSpoken } from "@/lib/mva-call/server";
import { stateCodeOf } from "@/lib/mva-call/state";
import { createSubmission, agreementKey, docusealConfigured, MISSING_DOCUSEAL, plainDocuSeal, templateProblem } from "@/lib/docuseal";
import { syncSubmission, packetsFor, templateFor } from "@/lib/mva-call/esign";
import { sendJustCallSms, toE164 } from "@/lib/justcall-send";
import { normPhone } from "@/lib/comms";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { sameName, paxParentId } from "@/lib/linked-files";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided, getMatterEmergency, emergencySupersedes } from "@/lib/mva-call/signing-matter";
import { recordAudit } from "@/lib/audit";

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
  } catch (e: any) {
    const msg = String(e?.message || e || "unknown error").slice(0, 300);
    console.error("esign send crashed", msg);
    await recordAudit({ category: "retainer", description: `Agreement send failed: ${msg}`, meta: { stage: "crash", stack: String(e?.stack || "").slice(0, 1500) } });
    return NextResponse.json({ error: `The agreement did not send. ${msg}` }, { status: 500 });
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
  const today = TODAY_RE.test(String(b?.today || "")) ? String(b.today) : new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date());
  const doi = TODAY_RE.test(String(b?.doi || "")) ? String(b.doi) : null;
  if (!leadId || !signer) return NextResponse.json({ error: "Add the signer's full name." }, { status: 400 });
  if (!today) return NextResponse.json({ error: "Your phone's date looks off. Refresh and try again." }, { status: 400 });
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

  let key: string | null = isMva ? agreementKey(stateCodeOf(b?.city)) : String(b?.template_key || "").trim();
  if (isMva && !key) return NextResponse.json({ error: "Add the city and state on Story so we know which agreement to send." }, { status: 400 });
  if (!isMva) {
    const configured = await sb.from("esign_templates").select("key").eq("campaign_id", context.campaignId).eq("provider", "docuseal");
    if (configured.error) return NextResponse.json({ error: "Could not read this campaign's DocuSeal templates." }, { status: 503 });
    const keys = (configured.data ?? []).map((t: any) => String(t.key));
    if (!key) key = keys.includes("DEFAULT") ? "DEFAULT" : keys.length === 1 ? keys[0] : null;
    if (!key || !keys.includes(key)) return NextResponse.json({ error: keys.length ? "Choose a DocuSeal agreement configured for this campaign." : "No DocuSeal agreement is configured for this campaign. Add its Client and Intake template in campaign setup." }, { status: 409 });
  }
  if (!key) return NextResponse.json({ error: "Choose an agreement template." }, { status: 400 });
  // Nevada sends the TIERED contract by default. The non-tiered one goes out
  // only with a typed reason saying who approved it (Brett, Sep 28: "brett
  // approved friend/fam") — recorded on the file, refused without it.
  let nvReason = "";
  if (key === "NV" && b?.nv_variant === "flat") {
    nvReason = String(b?.nv_reason || "").trim().slice(0, 300);
    if (!nvReason) {
      return NextResponse.json({ error: "The non-tiered Nevada agreement only sends with a reason saying who approved it. Add the reason, or send the standard tiered agreement." }, { status: 400 });
    }
    key = "NV_FLAT";
  }
  const admin = supabaseAdmin();
  const { data: campaign, error: campaignError } = await sb.from("campaigns").select("id, firm_id").eq("id", context.campaignId).maybeSingle();
  if (campaignError) return NextResponse.json({ error: `Could not read the campaign: ${campaignError.message}` }, { status: 500 });
  if (!campaign || (campaign.firm_id && campaign.firm_id !== lead.firm_id)) return NextResponse.json({ error: "This matter's campaign is not available for its firm." }, { status: 409 });
  const { data: firm } = await admin.from("firms").select("name, slug").eq("id", lead.firm_id).maybeSingle();

  // A passenger is their own file.
  let fileLeadId = lead.id;
  if (paxIndex != null) {
    const ext = `${lead.id}:pax:${paxKey}`;
    const { data: existing, error: existingError } = await sb.from("leads").select("id, claimant_name, archived_at").eq("firm_id", lead.firm_id).eq("external_id", ext).maybeSingle();
    if (existingError) return NextResponse.json({ error: `Could not read the passenger's file: ${existingError.message}` }, { status: 500 });
    if (existing?.archived_at) return NextResponse.json({ error: "The passenger's existing file is archived. Restore it before sending another agreement." }, { status: 409 });
    if (existing && !sameName(existing.claimant_name, injured)) {
      // The passenger list changed under an old position: never attach one
      // person's agreement to another person's file (Astra round 6).
      return NextResponse.json({ error: `That passenger spot already belongs to ${existing.claimant_name || "someone else"}. Remove this passenger on the Car step and add them again.` }, { status: 409 });
    }
    if (existing) fileLeadId = existing.id;
    else {
      const parts = injured.split(/\s+/).filter(Boolean);
      const { data: leadNo } = await sb.rpc("mint_lead_no", { p_firm: lead.firm_id });
      const ins: Record<string, any> = {
        firm_id: lead.firm_id, campaign_id: lead.campaign_id, campaign: lead.campaign, case_type: lead.case_type,
        claimant_name: injured, first_name: parts[0] || null, last_name: parts.slice(1).join(" ") || null,
        // The passenger's file carries THEIR number (the one this send goes
        // to), never the caller's — a minor's file keeps the guardian's.
        phone: phone || null, email: email || null, external_id: ext, source_key: "passenger", origin: "call",
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
      const { data: pl, error } = await sb.from("leads").insert(ins).select("id").single();
      if (error) return NextResponse.json({ error: `Could not open the passenger's file: ${error.message}` }, { status: 500 });
      const { error: cErr } = await sb.from("claims").insert({ firm_id: lead.firm_id, lead_id: pl.id, claim_type: lead.case_type, campaign: lead.campaign, campaign_id: lead.campaign_id, status: "new", is_this_file: true, created_by: me.id });
      if (cErr) {
        // Never leave a claimless passenger file behind (Astra round 6).
        await admin.from("leads").update({ archived_at: new Date().toISOString(), archived_by: me.id, archive_reason: "claim failed at birth" }).eq("id", pl.id);
        return NextResponse.json({ error: `Could not open the passenger's file: ${cErr.message}. Nothing was sent.` }, { status: 500 });
      }
      fileLeadId = pl.id;
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
  if (!emergencyResign && current.row && !agreementIsVoided(current.row) && ["sending", "sent", "opened", "signed", "completed"].includes(current.row.status)) {
    return NextResponse.json({ error: "This matter already has a live agreement. Resend its link or void it before sending a replacement.", agreement_id: current.row.id }, { status: 409 });
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

  const { data: auth } = await sb.auth.getUser();
  const submit = (templateId: string) => createSubmission({
    templateId,
    client: {
      name: signer, email: email || null, phone,
      values: { "Client Name": signer, "Injured Party Name": injured, "Signing Date": today, ...(isMva && doi ? { "Accident Date": doi } : {}) },
    },
    intake: { email: auth?.user?.email || "intake@claimreach.com", name: me.name || "Intake" },
    emailClient: via === "Email",
    externalId: fileLeadId,
  });
  let res = await submit(tpl.template_id);
  // The stored template is gone or empty in DocuSeal (a new key, or an old bad
  // one): make it new from the packet and try once more.
  if (!res.ok && packet && templateProblem(res.error, res.status)) {
    const first = res.error;
    const t = await templateFor(admin, { firmId: lead.firm_id, campaignId: lead.campaign_id, key, packet, origin: new URL(req.url).origin, actorId: me.id, force: true });
    if (!t.ok) return failed(lead, me, t.error, { stage: "template_retry", key, first });
    tpl = { template_id: t.templateId };
    res = await submit(tpl.template_id);
  }
  if (!res.ok) return failed(lead, me, plainDocuSeal(res.error, res.status, "send"), { stage: "docuseal", status: res.status ?? null, docuseal: res.error, template_id: tpl.template_id, key });
  // DocuSeal answers with the list of signers. Read it either way it comes back.
  const list: any[] = Array.isArray(res.data) ? res.data : Array.isArray((res.data as any)?.submitters) ? (res.data as any).submitters : [];
  const client = list.find((s) => s.role === "Client");
  const intake = list.find((s) => s.role === "Intake");
  if (!client) return failed(lead, me, "DocuSeal answered without a signer. Try again.", { stage: "no_signer", answer: JSON.stringify(res.data ?? null).slice(0, 1500) });

  const { data: row, error: rowErr } = await admin.from("esign_submissions").insert({
    firm_id: lead.firm_id, lead_id: fileLeadId, call_id: b?.call_id || null, campaign_id: lead.campaign_id,
    provider: "docuseal", template_key: key, template_id: String(tpl.template_id), claim_id: signClaimId,
    submission_id: String(client.submission_id ?? ""), client_submitter_id: String(client.id), intake_submitter_id: intake ? String(intake.id) : null,
    signer_name: signer, injured_name: injured, phone, email: email || null, via, pax_index: paxIndex,
    status: "sent", sign_url: client.embed_src || null, sent_by: me.id,
  }).select("id").single();
  if (rowErr) return failed(lead, me, `The agreement went to DocuSeal but did not save here: ${rowErr.message}.`, { stage: "save", submission_id: client.submission_id }, 500);

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
    description: `Sent the ${key === "OTHER" ? "AL/GA" : key === "NV" ? "Nevada tiered" : key === "NV_FLAT" ? "Nevada NON-TIERED" : key} agreement by ${via.toLowerCase()} to ${signer}.${nvReason ? ` Non-tiered approved: ${nvReason}.` : ""}`,
    meta: { esign_id: row.id, submission_id: client.submission_id, via, ...(emergencyResign ? { emergency_resign_group: emergency.row.packet_group } : {}), ...(nvReason ? { nv_variant: "flat", nv_reason: nvReason } : {}) },
  });

  const identity = { claim_id: signClaimId, agreement_id: row.id, lead_id: fileLeadId };
  if (textError) return NextResponse.json({ ok: true, status: "sent", ...identity, warning: `The agreement is ready, but the text did not go out: ${textError}. Use Resend in the text sheet.` });
  return NextResponse.json({ ok: true, status: "sent", ...identity });
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
  return NextResponse.json({ status: status === "completed" ? "signed" : status, complete: status === "completed", pax,
    claim_id: context.matter.claim.id, agreement_id: main?.id ?? null, templates: templates.data ?? [], case_type: context.matter.claim.claim_type, read_only: !!context.lead.archived_at,
    emergency: emergency.row ? { group: emergency.row.packet_group, status: emergency.row.status, needs_resign: emergencySupersedes(main, emergency.row) } : null,
    agreement: main ? { id: main.id, status: main.status, via: main.via, template_key: main.template_key, sent_at: main.created_at, signed_at: main.signed_at, voided_at: main.voided_at, void_reason: main.void_reason } : null });
}
