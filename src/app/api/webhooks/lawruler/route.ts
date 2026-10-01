import { NextRequest, NextResponse } from "next/server";
import { mailColumnsFrom } from "@/lib/us-address";
import { supabaseAdmin } from "@/lib/supabase-server";
import { mapInbound, canonicalToLeadColumns, firstNonEmpty } from "@/lib/webhooks";
import { isLorReadyStatus, isLorStatus, mergeLorIngest, type LorStatus } from "@/lib/m6";
import { normalizeLead, loadCampaigns, chooseCampaign, ingestLead, redactForLog } from "@/lib/lead-ingest";
import { mapLawRulerStatus, shouldApplyLr } from "@/lib/lawruler-status";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { LR_MAX_BODY_BYTES, recordLawRulerSource, resolveLawRulerMatter, storeLawRulerOriginals, validateLawRulerOriginal } from "@/lib/lawruler-documents";
import { hasRemoteLawRulerOriginal, syncLawRulerMva } from "@/lib/lawruler-mva-sync";
import { syncLawRulerNetfly, validateNetflyLawRulerPayload } from "@/lib/lawruler-netfly";
import { NETFLY_CAMPAIGN, NETFLY_RETAINER_TYPE } from "@/lib/netfly-ontake";
export const runtime = "edge";

// ---------------------------------------------------------------------------
// LawRuler inbound webhook.
//
// Shape is dictated by what LawRuler can actually send, which is a static
// header and a form-data body. It cannot compute an HMAC, so this route
// authenticates on a shared secret instead of a signature.
//
//   POST https://claimreach.com/api/webhooks/lawruler
//   Header: x-lr-secret: <LAWRULER_WEBHOOK_SECRET>
//   Body:   multipart/form-data
//
// Everything past parsing and auth reuses the same mapInbound /
// canonicalToLeadColumns path as /api/hooks/in/[key_id]. One definition of
// "ingest a lead", two front doors.
//
// The hook fires on STATUS CHANGE, so the same leadid arrives many times over
// the life of a file. Repeats are UPDATES, not duplicates. Existing values are
// never overwritten with blanks.
// ---------------------------------------------------------------------------

type Attachment = { name: string; contentType: string; bytes: ArrayBuffer };

// m6 retention fields. Deliberately handled here rather than added to the
// shared DEFAULT_INBOUND map, so nothing else that consumes that map changes.
const EC_KEYS = [
  "ec_name", "ec_relationship", "ec_phone", "ec_email",
  "ec_permission_to_discuss", "ec_message_script",
] as const;

const SOCIAL_KEYS: Record<string, string> = {
  social_facebook: "facebook",
  social_instagram: "instagram",
  social_other: "other",
};

function secretOk(req: NextRequest): boolean {
  const want = process.env.LAWRULER_WEBHOOK_SECRET || "";
  if (!want) return false; // fail closed: no secret configured means no ingest
  const got = req.headers.get("x-lr-secret") || "";
  if (!got) return false;
  // comma-separated list so a secret can be rotated with no downtime
  const accepted = want.split(",").map((s) => s.trim()).filter(Boolean);
  let ok = false;
  for (const a of accepted) {
    if (a.length !== got.length) continue;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ got.charCodeAt(i);
    if (diff === 0) ok = true;
  }
  return ok;
}

// Accepts multipart/form-data (what LawRuler sends), urlencoded, or JSON.
async function parseBody(req: NextRequest): Promise<{ fields: Record<string, any>; files: Attachment[]; rawNote: string }> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > LR_MAX_BODY_BYTES) throw new Error("LawRuler request exceeds 20 MiB.");
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > LR_MAX_BODY_BYTES) { await reader.cancel(); throw new Error("LawRuler request exceeds 20 MiB."); }
      chunks.push(part.value);
    }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body = new Request(req.url, { method: "POST", headers: req.headers, body: bytes.buffer });
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  const fields: Record<string, any> = {};
  const files: Attachment[] = [];

  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const fd = await body.formData();
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") {
        // Preserve a repeated checkbox field rather than silently keeping its
        // last value. The PRESIGN mapper accepts explicit arrays.
        fields[k] = Object.prototype.hasOwnProperty.call(fields, k) ? [...(Array.isArray(fields[k]) ? fields[k] : [fields[k]]), v] : v;
      } else {
        const f = v as File;
        files.push({
          name: f.name || `${k}.bin`,
          contentType: f.type || "application/octet-stream",
          bytes: await f.arrayBuffer(),
        });
      }
    }
    return { fields, files, rawNote: ct.split(";")[0] };
  }

  const text = await body.text();
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("Expected an object.");
    return { fields: j, files: [], rawNote: "json" };
  } catch {
    throw new Error("The LawRuler body must be JSON or form data.");
  }
}

function clean(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return null;
  // LawRuler's Test button posts the mapping tokens themselves
  // ("{{default23}}-Date of Birth"), not sample data. Treat any unresolved
  // placeholder as empty so a Test exercises the real path instead of dying
  // on its own scaffolding.
  if (s.includes("{{") && s.includes("}}")) return null;
  return s;
}
function toBool(v: any): boolean | null {
  const s = clean(v);
  if (s == null) return null;
  return ["1", "true", "yes", "y"].includes(s.toLowerCase());
}
function toDate(v: any): string | null {
  const s = clean(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
// Date-only column (leads.dob). An unparseable value becomes null rather than
// aborting the insert: Postgres rejects the WHOLE row over one bad field, so a
// typo in an optional date would otherwise cost us the entire case.
function toDateOnly(v: any): string | null {
  const s = clean(v);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (us) {
    const mm = us[1].padStart(2, "0");
    const dd = us[2].padStart(2, "0");
    return `${us[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
// Drop keys whose value is null/undefined so an update never blanks a field
// that LawRuler happened not to send on this particular fire.
function compact<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== "") out[k] = v;
  return out;
}

export async function POST(req: NextRequest) {
  // Authentication and bounded parsing precede privileged logging or ingestion.
  if (!secretOk(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let parsed: Awaited<ReturnType<typeof parseBody>>;
  try { parsed = await parseBody(req); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 }); }
  const { fields, files, rawNote } = parsed;
  const recoveryMode = String(fields.recovery_mode ?? "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(fields, "recovery_mode") && recoveryMode !== "historical") return NextResponse.json({ error: "The supported recovery_mode is historical. Omit it for an ordinary live webhook.", saved: false }, { status: 400 });
  const historical = recoveryMode === "historical";
  const innoMva = String(normalizeLead(fields).caseType || '').trim().toLowerCase() === 'inno mva';
  const netflyInbound = String(normalizeLead(fields).caseType || '').trim().toLowerCase() === NETFLY_CAMPAIGN.toLowerCase();
  const explicitCampaign = clean(fields.campaign);
  if ((netflyInbound && explicitCampaign && explicitCampaign.toLowerCase() !== NETFLY_CAMPAIGN.toLowerCase()) ||
      (explicitCampaign?.toLowerCase() === NETFLY_CAMPAIGN.toLowerCase() && !netflyInbound))
    return NextResponse.json({ error: "NETFLY requires matching CaseType and campaign values of NETFLY ONTAKE.", saved: false }, { status: 422 });
  // Original URLs need an approved host/transport contract. Never fetch a URL
  // from an incoming payload with service credentials or call it recovered.
  if (!innoMva && hasRemoteLawRulerOriginal(fields)) return NextResponse.json({ error: "Remote original URLs are not imported. Supply PDF/CSV multipart originals with matching LawRuler identity; an allowlisted URL transport must be configured separately.", saved: false, attachments_complete: false }, { status: 422 });
  const admin = supabaseAdmin();
  const manifest = files.map(f => ({ name: f.name, type: f.contentType, bytes: f.bytes.byteLength }));
  const redact = (value: any, depth = 0): any => {
    if (depth > 6) return "[nested content omitted]";
    if (typeof value === "string") return value.slice(0, 8000);
    if (Array.isArray(value)) return value.slice(0, 50).map(x => redact(x, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(redactForLog(value)).map(([k, v]) => [k, redact(v, depth + 1)]));
    return value;
  };
  // Medical PRESIGN answers belong on the protected matter, not duplicated in
  // generic webhook logs. Retain the body keys for operational diagnostics.
  const envelope = { content_type: rawNote, field_keys: Object.keys(fields), fields: innoMva || netflyInbound ? { LeadID: normalizeLead(fields).leadId, CaseType: innoMva ? 'INNO MVA' : NETFLY_CAMPAIGN, Status: normalizeLead(fields).status } : redact(fields), attachments: manifest };
  const logId = await log(admin, null, "received", 200, envelope, null);

  // LawRuler's Test button sends each mapped field as its own placeholder
  // ("{{default95}}-Lead ID"), never a real lead. Fixed text in a hook (the
  // Motel 6 hook's campaign=motel6) still comes through as typed, so the test
  // is spotted by the lead ID being a placeholder, or by every value being one.
  // Answer OK so the Test shows the hook is wired, and save nothing.
  const isToken = (v: unknown) => { const t = String(v ?? ""); return t.includes("{{") && t.includes("}}"); };
  const idKey = Object.keys(fields).find((k) => /^(lead_?id|lawruler_?lead_?id)$/i.test(k));
  const vals = Object.values(fields).map((v) => String(v ?? "").trim()).filter(Boolean);
  if ((idKey && isToken(fields[idKey])) || (vals.length >= 3 && vals.every(isToken))) {
    await log(admin, null, "received", 200, { test: true, field_keys: Object.keys(fields) }, null);
    return NextResponse.json({ ok: true, test: true, saved: false, fields: Object.keys(fields) });
  }

  // ---- App campaigns (MVA and anything else the App works) ----------------
  // A hook that names its case type ("INNO MVA", "TMP MVA") goes through the
  // shared ingest and shows up in the App. Keys match however LawRuler spells
  // them (LeadID, FirstName, CaseType). The Motel 6 hook (campaign=motel6)
  // keeps its own path below, unchanged.
  if ((clean(fields.campaign) || "").toLowerCase() !== "motel6") {
    const norm = normalizeLead(fields);
    const camps = await loadCampaigns(admin);
    const camp = chooseCampaign(norm.caseType, camps);
    if (camp) {
      if (camp.name === NETFLY_CAMPAIGN && !netflyInbound) return NextResponse.json({ error: "NETFLY requires the exact CaseType NETFLY ONTAKE; an MVA fallback cannot create a secondary intake.", saved: false }, { status: 422 });
      if (netflyInbound) {
        const configured = await admin.from("campaigns").select("id,firm_id,case_type,path,active,esign_required,firms(slug)").eq("id", camp.id).single();
        if (configured.error || !configured.data || configured.data.case_type !== "mva" || configured.data.path !== "secondary" || configured.data.esign_required !== false || configured.data.active !== true || (configured.data.firms as any)?.slug !== "tmp")
          return NextResponse.json({ error: "NETFLY secondary campaign is not safely configured.", saved: false }, { status: 503 });
      }
      if (!norm.leadId || !/^\d{1,30}$/.test(norm.leadId)) return NextResponse.json({ error: "Supply the numeric LawRuler LeadID." }, { status: 400 });
      if (!camps.some(c => c.active && c.name.toLowerCase() === (norm.caseType || "").trim().toLowerCase()) && camps.filter(c => c.active && c.firm_id === camp.firm_id && c.case_type === camp.case_type).length > 1) return NextResponse.json({ error: "More than one campaign matches this case type. Supply its exact campaign name." }, { status: 409 });
      // Do not allow the ingest helper's first-match behavior to choose between
      // duplicate source identities, or overwrite contact data before ambiguity is known.
      const targets = await admin.from("leads").select("id").eq("firm_id", camp.firm_id).or(`lawruler_ref_no.eq.${norm.leadId},external_id.eq.${norm.leadId}`).limit(2);
      if (targets.error || (targets.data || []).length > 1) return NextResponse.json({ error: "Cannot uniquely match this LawRuler lead. Review duplicate source identities." }, { status: 409 });
      let digits = (norm.phone || "").replace(/\D/g, ""); if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
      if (!targets.data?.length && digits.length === 10) {
        const phoneMatches = await admin.from("leads").select("id").eq("firm_id", camp.firm_id).eq("campaign_id", camp.id).eq("phone_norm", digits).is("archived_at", null).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(1);
        if (phoneMatches.error || phoneMatches.data?.length) return NextResponse.json({ error: "This phone may match a different source identity. Verify and link its LawRuler ID before importing; a phone alone cannot bind originals." }, { status: 409 });
      }
      if (targets.data?.[0]) {
        const existingMatter = await resolveLawRulerMatter(admin, { firmId: camp.firm_id, leadId: targets.data[0].id, campaignId: camp.id, campaignName: camp.name, caseType: camp.case_type, claimId: clean(fields.claim_id) });
        if (!existingMatter.ok) return NextResponse.json({ error: existingMatter.error, saved: false }, { status: existingMatter.status });
      }
      if (netflyInbound) {
        if (!targets.data?.length && !(norm.name || [norm.first, norm.last].filter(Boolean).join(" ")).trim())
          return NextResponse.json({ error: "Map the NETFLY client's name before posting.", saved: false }, { status: 422 });
        // NETFLY supplies the callback number during the live transfer. The
        // stable LawRuler LeadID binds the note and signed PDF until then.
        const invalid = validateNetflyLawRulerPayload(fields, files, !targets.data?.length);
        if (invalid) return NextResponse.json({ error: invalid, saved: false, attachments_complete: false }, { status: 422 });
      }
      // An externally worked/signed record is recovery, even on its first
      // arrival here. It must not publish a new-lead acquisition event.
      const externalUpdate = netflyInbound || (innoMva && !/^new lead(?: \(default\))?$/i.test(norm.status || ''));
      const r = await ingestLead(admin, { lead: norm, campaign: camp, via: "lawruler", historical: historical || externalUpdate, holdOutreach: netflyInbound });
      await log(admin, camp.firm_id, r.ok ? "received" : "failed", r.ok ? 200 : (r.status || 500),
        { vendor_lead_id: norm.leadId, lead_no: r.lead_no ?? null, created: !!r.created, campaign: camp.name }, r.error ?? null);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 500 });
      const matter = await resolveLawRulerMatter(admin, { firmId: camp.firm_id, leadId: r.lead_id!, campaignId: camp.id, campaignName: camp.name, caseType: camp.case_type, claimId: clean(fields.claim_id) });
      if (!matter.ok) return NextResponse.json({ error: matter.error, lead_saved: true, lead_id: r.lead_id, attachments_complete: false }, { status: matter.status });
      const scope = { firmId: camp.firm_id, leadId: r.lead_id!, claimId: matter.claim.id, vendorId: norm.leadId!, caseType: camp.case_type };
      if (netflyInbound) {
        try {
          const held = await admin.from("leads").update({ perm_call: false, perm_text: false, perm_email: false, marketing_source: "NETFLY" })
            .eq("id", r.lead_id!).eq("firm_id", camp.firm_id).eq("campaign_id", camp.id);
          if (held.error) throw new Error(`NETFLY communications hold failed: ${held.error.message}`);
          const sync = await syncLawRulerNetfly(admin, scope, fields, files);
          const prior = await admin.from("case_documents").select("id").eq("firm_id", camp.firm_id).eq("lead_id", r.lead_id!)
            .eq("claim_id", matter.claim.id).eq("doc_type", NETFLY_RETAINER_TYPE).limit(1);
          if (prior.error) throw new Error(`NETFLY signed PDF could not be checked: ${prior.error.message}`);
          const missing_source = [
            ...(!sync.handoff_revisions ? ["handoff_note"] : []),
            ...(!prior.data?.length ? ["signed_retainer_pdf"] : []),
          ];
          return NextResponse.json({ ok: true, lead_saved: true, lead_id: r.lead_id, claim_id: matter.claim.id,
            lead_no: r.lead_no, created: r.created, updated: !r.created, campaign: NETFLY_CAMPAIGN,
            ...sync, partial: missing_source.length > 0, missing_source,
            attachments_complete: missing_source.length === 0,
            status_reconciliation: missing_source.length ? "partial_needs_source" : "signed_original_needs_review",
            communications_triggered: false, log_id: logId });
        } catch (error) {
          const message = error instanceof Error ? error.message : "NETFLY source sync failed.";
          await log(admin, camp.firm_id, "failed", 500, { lead_id: r.lead_id, claim_id: matter.claim.id }, message);
          return NextResponse.json({ error: message, lead_saved: true, lead_id: r.lead_id,
            claim_id: matter.claim.id, attachments_complete: false, retry_required: true }, { status: 500 });
        }
      }
      if (innoMva && camp.name.trim().toLowerCase() === 'inno mva' && camp.case_type === 'mva') {
        try {
          const sync = await syncLawRulerMva(admin, { ...scope, campaignId: camp.id }, fields, files, historical);
          const retry = !!r.error || sync.retry_required;
          return NextResponse.json({ ok: !retry, lead_saved: true, lead_id: r.lead_id, claim_id: matter.claim.id, lead_no: r.lead_no,
            created: r.created, updated: !r.created, campaign: camp.name, ...sync,
            status_reconciliation: sync.reconciliation.outcome, ...(historical ? { recovery_mode: 'historical' } : {}),
            log_id: logId, ...(r.error ? { error: r.error } : {}) }, { status: retry ? 500 : 200 });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'LawRuler sync failed.';
          await log(admin, camp.firm_id, 'failed', 500, { lead_id: r.lead_id, claim_id: matter.claim.id }, message);
          return NextResponse.json({ error: message, lead_saved: true, lead_id: r.lead_id, claim_id: matter.claim.id, retry_required: true }, { status: 500 });
        }
      }
      try { files.forEach(file => validateLawRulerOriginal(file, scope, fields)); }
      catch (error) { return NextResponse.json({ error: String((error as Error).message), lead_saved: true, attachments_complete: false }, { status: 422 }); }
      try {
        await recordLawRulerSource(admin, scope, fields);
        const originals = await storeLawRulerOriginals(admin, scope, files, fields);
        return NextResponse.json({ ok: !r.error, lead_id: r.lead_id, claim_id: matter.claim.id, lead_no: r.lead_no, created: r.created, updated: !r.created, campaign: camp.name, originals, attachments_complete: true, status_reconciliation: "review_required", ...(historical ? { recovery_mode: "historical", communications_triggered: false } : {}), log_id: logId, ...(r.error ? { error: r.error } : {}) }, { status: r.error ? 500 : 200 });
      } catch (error) {
        await log(admin, camp.firm_id, "failed", 500, { lead_id: r.lead_id, claim_id: matter.claim.id }, String((error as Error).message));
        return NextResponse.json({ error: String((error as Error).message), lead_saved: true, lead_id: r.lead_id, claim_id: matter.claim.id, attachments_complete: false }, { status: 500 });
      }
    }
  }

  // Only a hook that names its campaign (the Motel 6 hook sends
  // campaign=motel6) takes the path below. Anything else is a case type
  // ClaimReach does not run: refuse it, so a hook set to "all case types" can
  // never turn another campaign's leads into TMP Motel 6 files.
  if ((clean(fields.campaign) || "").toLowerCase() !== "motel6") {
    const ct = clean(fields.CaseType) || clean(fields.casetype) || clean(fields.case_type) || "(none)";
    await log(admin, null, "failed", 422, envelope, `case type not run in ClaimReach: ${ct}`);
    return NextResponse.json({ error: `ClaimReach does not run the case type "${ct}". Nothing was saved. Send only INNO MVA leads to this hook.` }, { status: 422 });
  }

  const vendorId = clean(fields.leadid) || clean(fields.external_id) || clean(fields.id);
  if (!vendorId || !/^\d{1,30}$/.test(vendorId)) {
    await log(admin, null, "failed", 400, envelope, "missing leadid");
    return NextResponse.json({ error: "missing leadid" }, { status: 400 });
  }

  // ---- resolve the firm from the campaign, falling back to TMP -------------
  const campaign = clean(fields.campaign) || "motel6";
  let firmId: string | null = null;
  const { data: rset } = await admin.from("retention_settings").select("firm_id").eq("campaign", campaign).maybeSingle();
  firmId = rset?.firm_id ?? null;
  if (!firmId) {
    const { data: firm } = await admin.from("firms").select("id").eq("slug", "tmp").maybeSingle();
    firmId = firm?.id ?? null;
  }
  if (!firmId) {
    await log(admin, null, "failed", 500, envelope, "cannot resolve firm");
    return NextResponse.json({ error: "cannot resolve firm" }, { status: 500 });
  }

  // ---- shared mapping path ------------------------------------------------
  const { data: fm } = await admin.from("field_mappings").select("map, transforms").eq("firm_id", firmId).eq("direction", "inbound").maybeSingle();
  const cols = canonicalToLeadColumns(mapInbound(fields, fm ?? undefined));

  const base = compact({
    first_name: firstNonEmpty(cols.first_name, fields.first_name, fields.firstname),
    last_name: firstNonEmpty(cols.last_name, fields.last_name, fields.lastname),
    claimant_name: clean(cols.claimant_name),
    phone: clean(cols.phone),
    email: clean(cols.email),
    dob: toDateOnly(cols.dob),
    mail_addr1: clean(cols.mail_addr1),
    mail_addr2: clean(cols.mail_addr2),
    mail_city: clean(cols.mail_city),
    mail_state: clean(cols.mail_state),
    mail_zip: firstNonEmpty(cols.mail_zip, fields.zip, fields.postal, fields.postal_code, fields.zipcode, fields.mail_zip),
    handling_attorney: clean(cols.handling_attorney),
    marketing_source: clean(cols.marketing_source),
    case_type: clean(cols.case_type),
    campaign,
    source_system: clean(fields.source_system) || "lawruler",
    lawruler_url: firstNonEmpty(fields.leadlink, cols.lawruler_url),
    lawruler_created_at: toDate(fields.leadcreated),
    // Writable standard fields (Astra round 7b): a value sent under our
    // standard name lands in its column on this path too.
    preferred_language: clean(cols.preferred_language),
    client_time_zone: clean(cols.client_time_zone),
    phone_alt: firstNonEmpty(fields.phone_alt, cols.phone_alt),
    home_phone: firstNonEmpty(cols.home_phone, fields.home_phone, fields.homephone),
    work_phone: firstNonEmpty(cols.work_phone, fields.work_phone, fields.workphone),
    dl_number: firstNonEmpty(cols.dl_number, fields.dl_number, fields.drivers_license),
    incident_city: firstNonEmpty(cols.incident_city, fields.incident_city, fields.accident_city),
    incident_state: firstNonEmpty(cols.incident_state, fields.incident_state, fields.accident_state),
    ec_name: firstNonEmpty(cols.ec_name, fields.ec_name),
    ec_relationship: firstNonEmpty(cols.ec_relationship, fields.ec_relationship),
    ec_phone: firstNonEmpty(cols.ec_phone, fields.ec_phone),
    ec_email: clean(fields.ec_email),
    ec_message_script: clean(fields.ec_message_script),
    gender: firstNonEmpty(cols.gender, fields.gender, fields.claimant_gender),
    incident_start: toDateOnly(firstNonEmpty(fields.incident_start, fields.incidentstart, cols.incident_start)),
    incident_end: toDateOnly(firstNonEmpty(fields.incident_end, fields.incidentend)),
    property_name: firstNonEmpty(fields.property_name, fields.propertyname),
    property_street: firstNonEmpty(fields.property_street, fields.property_address, fields.propertystreet),
    property_city: firstNonEmpty(fields.property_city, fields.propertycity),
    property_state: firstNonEmpty(fields.property_state, fields.propertystate),
    property_zip: firstNonEmpty(fields.property_zip, fields.propertyzip),
  });
  const ecPerm = toBool(fields.ec_permission_to_discuss);
  if (ecPerm !== null) (base as any).ec_permission_to_discuss = ecPerm;
  // LawRuler sends the whole mailing address on the street line; split it so
  // city, state and ZIP are on the file (Brett, Sep 28). Blanks only.
  {
    const b: any = base;
    const cols = mailColumnsFrom(b, b.mail_addr1);
    if (cols) Object.assign(b, cols);
  }

  // never write generated columns
  delete (base as any).full_name;
  delete (base as any).phone_norm;

  // ---- upsert by vendor lead id -------------------------------------------
  const { data: existingData, error: existingError } = await admin
    .from("leads").select(["id", "lead_no", "case_description", "case_summary", ...Object.keys(base)].join(", "))
    .eq("firm_id", firmId).or(`lawruler_ref_no.eq.${vendorId},external_id.eq.${vendorId}`).maybeSingle();

  if (existingError) return NextResponse.json({ error: `Cannot safely match the LawRuler lead: ${existingError.message}` }, { status: 409 });
  const existing = existingData as unknown as ({ id: string; lead_no: string | null; [key: string]: any } | null);
  if (existing) {
    const existingMatter = await resolveLawRulerMatter(admin, { firmId, leadId: existing.id, campaignName: campaign, caseType: "motel_trafficking", claimId: clean(fields.claim_id) });
    if (!existingMatter.ok) return NextResponse.json({ error: existingMatter.error, saved: false }, { status: existingMatter.status });
  }

  let leadId: string;
  let leadNo: string | null = null;
  let created = false;

  const narrative = clean(fields.description);
  // A case summary sent under the standard name is filled like the
  // narrative: set when empty, never over a summary someone wrote here.
  const summary = clean(cols.case_summary);

  if (existing) {
    leadId = existing.id;
    leadNo = existing.lead_no;
    // The narrative belongs in leads.case_description: that is what the Case
    // Details panel renders and what retainer autofill reads. On a REFIRE we
    // only fill it when it is still empty, so a human edit made in ClaimReach
    // is never clobbered by LawRuler resending the original intake text.
    const upd: any = {};
    // A historical resend is source evidence, not authority to replace an
    // agent's corrected name, phone, address or case details. False/zero count
    // as filled values. Read every candidate column above before deciding.
    for (const [key, value] of Object.entries(base)) {
      if (existing[key] == null || (typeof existing[key] === "string" && !existing[key].trim())) upd[key] = value;
      else (base as any)[key] = existing[key];
    }
    if (narrative && !clean(existing.case_description)) upd.case_description = narrative;
    if (summary && !clean(existing.case_summary)) upd.case_summary = summary;
    const { error } = await admin.from("leads").update(upd).eq("id", leadId);
    if (error) {
      await log(admin, firmId, "failed", 500, envelope, `update: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { data: lead, error } = await admin.from("leads").insert({
      firm_id: firmId,
      external_id: vendorId,
      lawruler_ref_no: vendorId,
      case_description: narrative,
      ...(summary ? { case_summary: summary } : {}),
      // leads has no `status` column. `stage` is the pipeline and it already
      // defaults to 'referral_received'. Naming a phantom column made Postgres
      // reject the entire insert, which is why every fire failed.
      ...(historical ? {} : { retention_started_at: new Date().toISOString() }),
      ...base,
    }).select("id, lead_no").single();
    if (error) {
      await log(admin, firmId, "failed", 500, envelope, `insert: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    leadId = lead.id;
    leadNo = lead.lead_no;
    created = true;

    const { error: claimError } = await admin.from("claims").insert({
      firm_id: firmId,
      lead_id: leadId,
      claim_type: base.case_type ?? "motel_trafficking",
      campaign,
      status: "new",
    });

    if (claimError) return NextResponse.json({ error: `Lead saved, claim failed: ${claimError.message}`, lead_saved: true, lead_id: leadId }, { status: 500 });

    if (narrative) {
      await admin.from("lead_notes").insert({
        firm_id: firmId, lead_id: leadId, body: narrative, source: "lawruler",
      });
    }
  }

  try {
    await upsertPoints(admin, firmId, leadId, { ...fields, ...base }, base);
    if (!historical) await upsertLor(admin, firmId, leadId, fields);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Related import fields failed.", lead_saved: true, lead_id: leadId, attachments_complete: false }, { status: 500 });
  }

  // Every campaign files originals through the same exact-matter path.
  const matter = await resolveLawRulerMatter(admin, { firmId, leadId, campaignName: campaign, caseType: "motel_trafficking", claimId: clean(fields.claim_id) });
  if (!matter.ok) return NextResponse.json({ error: matter.error, lead_saved: true, lead_id: leadId, attachments_complete: false }, { status: matter.status });
  const scope = { firmId, leadId, claimId: matter.claim.id, vendorId, caseType: "motel_trafficking" };
  try { files.forEach(file => validateLawRulerOriginal(file, scope, fields)); }
  catch (error) { return NextResponse.json({ error: String((error as Error).message), lead_saved: true, attachments_complete: false }, { status: 422 }); }
  let stored: Awaited<ReturnType<typeof storeLawRulerOriginals>>;
  try {
    await recordLawRulerSource(admin, scope, fields);
    stored = await storeLawRulerOriginals(admin, scope, files, fields);
    // Keep Brett's existing secondary mappings, but never widen to siblings.
    const mapped = mapLawRulerStatus(clean(fields.status));
    if (!historical && mapped && shouldApplyLr(matter.claim.status, mapped)) {
      const changed = await setClaimStatusForLeads({ leadIds: [leadId], claimIds: [matter.claim.id], expectedStatus: matter.claim.status, status: mapped.status, dqReasonKey: mapped.dqReasonKey ?? null, dqNote: mapped.dqNote ?? null, actorName: "LawRuler" });
      if (!changed.ok) throw new Error(changed.error || "Status reconciliation failed.");
    }
  } catch (error) {
    await log(admin, firmId, "failed", 500, { lead_id: leadId, claim_id: matter.claim.id }, String((error as Error).message));
    return NextResponse.json({ error: String((error as Error).message), lead_saved: true, lead_id: leadId, claim_id: matter.claim.id, attachments_complete: false }, { status: 500 });
  }

  await log(admin, firmId, created ? "received" : "received", 200,
    { vendor_lead_id: vendorId, lead_no: leadNo, created, attachments: stored }, null);

  return NextResponse.json({
    ok: true, lead_id: leadId, lead_no: leadNo,
    created, updated: !created,
    attachments_stored: stored.length,
    attachments_complete: true, claim_id: matter.claim.id, originals: stored,
    ...(historical ? { recovery_mode: "historical", status_reconciliation: "review_required", communications_triggered: false } : {}),
    log_id: logId,
  });
}

// Append to the contact web. Never overwrite: a number we already know stays,
// a new one is added alongside it. Dead numbers are evidence for a skip trace.
async function upsertPoints(
  admin: any, firmId: string, leadId: string,
  fields: Record<string, any>, base: Record<string, any>,
) {
  const rows: any[] = [];
  const push = (kind: string, value: any, label: string, extra: any = {}) => {
    const v = clean(value);
    if (!v) return;
    rows.push({
      firm_id: firmId, lead_id: leadId, kind, value: v, label,
      source_system: "lawruler",
      // Every column named by ANY row in a multi-row insert is sent for EVERY
      // row. A key omitted here arrives as an explicit null rather than
      // falling back to the column default, and is_primary is not-null, so one
      // unflagged row rejects the whole batch. Always name it.
      is_primary: false,
      status: "good",
      ...extra,
    });
  };

  push("mobile", base.phone, "primary mobile", { is_primary: true });
  push("mobile", fields.phone_alt, "second number");
  push("email", base.email, "primary email", { is_primary: true });

  const addr = [clean(base.mail_addr1), clean(base.mail_city), clean(base.mail_state), clean(base.mail_zip)]
    .filter(Boolean).join(", ");
  if (addr) push("address", addr, "mailing address", { is_primary: true });

  for (const [key, platform] of Object.entries(SOCIAL_KEYS)) {
    push("social", fields[key], platform, { platform });
  }

  const ecName = clean(fields.ec_name);
  if (ecName) {
    push("person", clean(fields.ec_phone) || ecName, "emergency contact", {
      person_name: ecName,
      relationship: clean(fields.ec_relationship),
      permission_to_discuss: toBool(fields.ec_permission_to_discuss),
      contact_script: clean(fields.ec_message_script),
    });
  }

  if (rows.length === 0) return;
  // unique on (lead_id, kind, value): a resend touches the existing row
  // instead of creating a second copy of the same number.
  const { error } = await admin.from("contact_points")
    .upsert(rows, { onConflict: "lead_id,kind,value", ignoreDuplicates: true });
  if (error) {
    throw new Error(`Contact points failed: ${error.message}`);
  }
}

async function upsertLor(
  admin: any, firmId: string, leadId: string,
  fields: Record<string, any>,
) {
  const { data: existing, error: existingError } = await admin
    .from("lead_lor")
    .select("status, flagged_today")
    .eq("lead_id", leadId)
    .maybeSingle();

  const explicit = clean(fields.lor_status);
  const fromStatus = isLorReadyStatus(clean(fields.status));
  const incomingStatus: LorStatus | null = isLorStatus(explicit)
    ? explicit
    : (fromStatus ? "ready" : null);
  const incomingFlag = toBool(fields.lor_today) ?? toBool(fields.lor_flagged_today);

  if (!incomingStatus && incomingFlag == null && !clean(fields.lor_sent_on) && !clean(fields.lor_sent_to)) {
    return;
  }
  if (existingError) throw new Error(`Could not read LOR state: ${existingError.message}`);

  const merged = mergeLorIngest(existing, {
    status: incomingStatus,
    flagged_today: incomingFlag ?? (incomingStatus === "ready" ? true : null),
  });

  const { error } = await admin.from("lead_lor").upsert({
    lead_id: leadId,
    firm_id: firmId,
    status: merged.status,
    flagged_today: merged.flagged_today,
    ...compact({
      sent_on: toDateOnly(fields.lor_sent_on) || toDateOnly(fields.lor_sent_date),
      sent_to: clean(fields.lor_sent_to),
    }),
  }, { onConflict: "lead_id" });
  if (error) {
    throw new Error(`LOR state failed: ${error.message}`);
  }
}

async function log(
  admin: any, firm_id: string | null, status: string,
  http: number, payload: any, error: string | null,
): Promise<string | null> {
  try {
    const { data } = await admin.from("webhook_events").insert({
      firm_id, direction: "inbound", event_type: "lawruler.lead",
      status, http_status: http, payload, error,
    }).select("id").maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}
