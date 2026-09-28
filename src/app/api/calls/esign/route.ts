import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, LEAD_CALL_COLS, firmSpoken } from "@/lib/mva-call/server";
import { stateCodeOf } from "@/lib/mva-call/state";
import { createSubmission, agreementKey, docusealConfigured, MISSING_DOCUSEAL, plainDocuSeal, templateProblem } from "@/lib/docuseal";
import { syncSubmission, packetsFor, templateFor } from "@/lib/mva-call/esign";
import { sendJustCallSms, toE164 } from "@/lib/justcall-send";
import { normPhone } from "@/lib/comms";
import { setClaimStatusForLeads } from "@/lib/claim-status";
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
  const today = TODAY_RE.test(String(b?.today || "")) ? String(b.today) : null;
  const doi = TODAY_RE.test(String(b?.doi || "")) ? String(b.doi) : null;
  if (!leadId || !signer) return NextResponse.json({ error: "Add the signer's full name." }, { status: 400 });
  if (!today) return NextResponse.json({ error: "Your phone's date looks off. Refresh and try again." }, { status: 400 });
  if (!doi) return NextResponse.json({ error: "Add the date of the wreck. It prints on the agreement." }, { status: 400 });
  if (via === "Email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Add her email to send it by email." }, { status: 400 });

  const { data: lead } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const phone = toE164(String(b?.phone || lead.phone || ""));
  if (via === "Text" && !phone) return NextResponse.json({ error: "Add her cell number to text it." }, { status: 400 });
  if (via === "Text" && lead.perm_text === false) return NextResponse.json({ error: "She asked not to be texted. Send it by email." }, { status: 409 });

  const key = agreementKey(stateCodeOf(b?.city));
  if (!key) return NextResponse.json({ error: "Add the city and state on Story so we know which agreement to send." }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: firm } = await admin.from("firms").select("name, slug").eq("id", lead.firm_id).maybeSingle();
  // The template for this agreement, made new first if the packet changed.
  const packets = packetsFor(firm?.slug, lead.case_type);
  const packet = packets ? (packets as any)[key] : null;
  let tpl: { template_id: string } | null = null;
  if (packet) {
    const t = await templateFor(admin, { firmId: lead.firm_id, campaignId: lead.campaign_id, key, packet, origin: new URL(req.url).origin, actorId: me.id });
    if (!t.ok) return t.missing ? NextResponse.json({ error: t.error }, { status: 409 }) : failed(lead, me, t.error, { stage: "template", key });
    tpl = { template_id: t.templateId };
  } else {
    const { data } = await admin.from("esign_templates").select("template_id")
      .eq("campaign_id", lead.campaign_id).eq("provider", "docuseal").eq("key", key).maybeSingle();
    tpl = data;
  }
  if (!tpl) return NextResponse.json({ error: "E-sign is not set up for this campaign yet. An admin sets it up once from Calls." }, { status: 409 });

  // A passenger is their own file.
  let fileLeadId = lead.id;
  if (paxIndex != null) {
    const ext = `${lead.id}:pax:${paxIndex}`;
    const { data: existing } = await admin.from("leads").select("id").eq("firm_id", lead.firm_id).eq("external_id", ext).maybeSingle();
    if (existing) fileLeadId = existing.id;
    else {
      const parts = injured.split(/\s+/).filter(Boolean);
      const { data: leadNo } = await sb.rpc("mint_lead_no", { p_firm: lead.firm_id });
      const ins: Record<string, any> = {
        firm_id: lead.firm_id, campaign_id: lead.campaign_id, campaign: lead.campaign, case_type: lead.case_type,
        claimant_name: injured, first_name: parts[0] || null, last_name: parts.slice(1).join(" ") || null,
        phone: lead.phone, external_id: ext, source_key: "passenger", origin: "call",
        created_by: me.id, assigned_agent: me.id, intake_agent_id: me.id,
        caller_is_self: signer === injured, caller_first: signer.split(/\s+/)[0] || null,
      };
      if (leadNo) ins.lead_no = leadNo;
      const { data: pl, error } = await sb.from("leads").insert(ins).select("id").single();
      if (error) return NextResponse.json({ error: `Could not open the passenger's file: ${error.message}` }, { status: 500 });
      await sb.from("claims").insert({ firm_id: lead.firm_id, lead_id: pl.id, claim_type: lead.case_type, campaign: lead.campaign, campaign_id: lead.campaign_id, status: "new", is_this_file: true, created_by: me.id });
      fileLeadId = pl.id;
    }
  }

  const { data: auth } = await sb.auth.getUser();
  const submit = (templateId: string) => createSubmission({
    templateId,
    client: {
      name: signer, email: email || null, phone,
      values: { "Client Name": signer, "Injured Party Name": injured, "Signing Date": today, "Accident Date": doi },
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
    provider: "docuseal", template_key: key, template_id: String(tpl.template_id),
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
        lead_id: lead.id, firm_id: lead.firm_id, channel: "sms", direction: "outbound", phone_raw: phone, phone_norm: normPhone(phone),
        agent_name: me.name, body, provider: "justcall", send_status: "sent", occurred_at: new Date().toISOString(), purpose: "esign",
      });
    }
  }

  const nowIso = new Date().toISOString();
  await admin.from("leads").update({ esign_sent_at: nowIso }).eq("id", fileLeadId);
  const st = await setClaimStatusForLeads({ leadIds: [fileLeadId], status: "esign_sent", actorId: me.id, actorName: me.name ?? "Agent" });
  if (!st.ok) console.error("esign_sent status failed", st.error);
  await recordAudit({
    firm_id: lead.firm_id, lead_id: fileLeadId, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
    description: `Sent the ${key === "OTHER" ? "AL/GA" : key} agreement by ${via.toLowerCase()} to ${signer}.`,
    meta: { esign_id: row.id, submission_id: client.submission_id, via },
  });

  if (textError) return NextResponse.json({ ok: true, status: "sent", warning: `The agreement is ready, but the text did not go out: ${textError}. Use Resend in the text sheet.` });
  return NextResponse.json({ ok: true, status: "sent" });
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

  const { data: main } = await sb.from("esign_submissions").select("*")
    .eq("lead_id", leadId).is("pax_index", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let status = main?.status || "ready";
  if (main && (["sent", "opened", "signed"].includes(main.status)
    || (main.status === "completed" && (!main.completed_pdf_path || !main.cert_pdf_path)))) {
    status = await syncSubmission(admin, main, { origin: url.origin });
  }

  const pax: Record<string, string> = {};
  if (callId) {
    const { data: rows } = await sb.from("esign_submissions").select("*").eq("call_id", callId).not("pax_index", "is", null)
      .order("created_at", { ascending: false }).limit(6);
    for (const r of rows ?? []) {
      if (pax[String(r.pax_index)]) continue;
      pax[String(r.pax_index)] = ["sent", "opened"].includes(r.status) ? await syncSubmission(admin, r, { origin: url.origin }) : r.status;
    }
  }
  // The console shows signed for anything signed or complete.
  return NextResponse.json({ status: status === "completed" ? "signed" : status, complete: status === "completed", pax });
}
