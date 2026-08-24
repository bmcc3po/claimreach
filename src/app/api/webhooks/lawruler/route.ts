import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { mapInbound, canonicalToLeadColumns, firstNonEmpty } from "@/lib/webhooks";
import { isLorReadyStatus, isLorStatus, lrAttachmentPlan, mergeLorIngest, type LorStatus } from "@/lib/m6";
import { recordInboundBrandHistory } from "@/lib/property-ops";
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
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  const fields: Record<string, any> = {};
  const files: Attachment[] = [];

  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") {
        fields[k] = v;
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

  const text = await req.text();
  try {
    const j = JSON.parse(text);
    return { fields: j && typeof j === "object" ? j : {}, files: [], rawNote: "json" };
  } catch {
    return { fields: {}, files: [], rawNote: `unparsed:${ct || "none"}` };
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
  const admin = supabaseAdmin();
  const { fields, files, rawNote } = await parseBody(req);

  // Log the envelope BEFORE doing anything else. If this route explodes we
  // still want to see exactly what LawRuler sent, including attachment shape.
  const manifest = files.map((f) => ({ name: f.name, type: f.contentType, bytes: f.bytes.byteLength }));
  const envelope = {
    content_type: rawNote,
    field_keys: Object.keys(fields),
    fields,
    attachments: manifest,
  };
  const logId = await log(admin, null, "received", 200, envelope, null);

  if (!secretOk(req)) {
    await log(admin, null, "failed", 401, envelope, "bad or missing x-lr-secret");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vendorId = clean(fields.leadid) || clean(fields.external_id) || clean(fields.id);
  if (!vendorId) {
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
    lawruler_url: clean(fields.leadlink),
    lawruler_created_at: toDate(fields.leadcreated),
    phone_alt: clean(fields.phone_alt),
    ec_name: clean(fields.ec_name),
    ec_relationship: clean(fields.ec_relationship),
    ec_phone: clean(fields.ec_phone),
    ec_email: clean(fields.ec_email),
    ec_message_script: clean(fields.ec_message_script),
    gender: firstNonEmpty(fields.gender, fields.claimant_gender),
    incident_start: toDateOnly(firstNonEmpty(fields.incident_start, fields.incidentstart)),
    incident_end: toDateOnly(firstNonEmpty(fields.incident_end, fields.incidentend)),
    property_name: firstNonEmpty(fields.property_name, fields.propertyname),
    property_street: firstNonEmpty(fields.property_street, fields.property_address, fields.propertystreet),
    property_city: firstNonEmpty(fields.property_city, fields.propertycity),
    property_state: firstNonEmpty(fields.property_state, fields.propertystate),
    property_zip: firstNonEmpty(fields.property_zip, fields.propertyzip),
  });
  const ecPerm = toBool(fields.ec_permission_to_discuss);
  if (ecPerm !== null) (base as any).ec_permission_to_discuss = ecPerm;

  // never write generated columns
  delete (base as any).full_name;
  delete (base as any).phone_norm;

  // ---- upsert by vendor lead id -------------------------------------------
  const { data: existing } = await admin
    .from("leads").select("id, lead_no, case_description")
    .eq("firm_id", firmId).eq("external_id", vendorId).maybeSingle();

  let leadId: string;
  let leadNo: string | null = null;
  let created = false;

  const narrative = clean(fields.description);

  if (existing) {
    leadId = existing.id;
    leadNo = existing.lead_no;
    // The narrative belongs in leads.case_description: that is what the Case
    // Details panel renders and what retainer autofill reads. On a REFIRE we
    // only fill it when it is still empty, so a human edit made in ClaimReach
    // is never clobbered by LawRuler resending the original intake text.
    const upd: any = { ...base };
    if (narrative && !clean(existing.case_description)) upd.case_description = narrative;
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
      // leads has no `status` column. `stage` is the pipeline and it already
      // defaults to 'referral_received'. Naming a phantom column made Postgres
      // reject the entire insert, which is why every fire failed.
      retention_started_at: new Date().toISOString(),
      ...base,
    }).select("id, lead_no").single();
    if (error) {
      await log(admin, firmId, "failed", 500, envelope, `insert: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    leadId = lead.id;
    leadNo = lead.lead_no;
    created = true;

    await admin.from("claims").insert({
      firm_id: firmId,
      lead_id: leadId,
      claim_type: base.case_type ?? "motel_trafficking",
      campaign,
      status: "new",
    });

    if (narrative) {
      await admin.from("lead_notes").insert({
        firm_id: firmId, lead_id: leadId, body: narrative, source: "lawruler",
      });
    }
  }

  // ---- contact web --------------------------------------------------------
  await upsertPoints(admin, firmId, leadId, fields, base);

  // ---- LOR (ingest-ready; webhook stays off until Phase C) ----------------
  await upsertLor(admin, firmId, leadId, fields);

  // LLC / owner already on the LawRuler fire — keep them if we can attach
  // to a real building. Do not invent a place. Hunt can still look later.
  try {
    await recordInboundBrandHistory(firmId, {
      id: leadId, external_id: vendorId, lawruler_ref_no: vendorId,
    }, fields, {
      name: base.property_name, city: base.property_city, state: base.property_state,
      incidentStart: base.incident_start, incidentEnd: base.incident_end,
    });
  } catch {
    /* sidecar only — the lead already saved */
  }

  // ---- attachments --------------------------------------------------------
  // PDF = Secondary interview (SSN/DOB). CSV = thin contact summary — skip.
  // Filename leadid must match this fire's vendor id or we skip (never park
  // a file on the wrong lead). Accept + log; never echo file bytes back.
  const stored: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const plan = lrAttachmentPlan(f.name, vendorId);
    if (plan.action === "skip") {
      skipped.push({ name: f.name, reason: plan.reason });
      await log(admin, firmId, "received", 200, {
        file: f.name, reason: plan.reason,
        filename_leadid: plan.vendorLeadId, vendor_lead_id: vendorId,
      }, `attachment skipped: ${plan.reason}`);
      continue;
    }
    const safe = plan.kind === "secondary_interview"
      ? "secondary_interview.pdf"
      : f.name.replace(/[^\w.\-]/g, "_").slice(0, 120);
    const path = `${firmId}/${leadId}/${Date.now()}_${i}_${safe}`;
    const up = await admin.storage.from("case-docs").upload(path, f.bytes, {
      contentType: plan.kind === "secondary_interview"
        ? "application/pdf"
        : (f.contentType || "application/octet-stream"),
      upsert: false,
    });
    if (!up.error) {
      await admin.from("case_documents").insert({
        firm_id: firmId, lead_id: leadId,
        doc_type: plan.docType,
        file_name: plan.fileName, storage_path: path,
        uploaded_by_name: "LawRuler",
      });
      stored.push(plan.fileName);
    } else {
      await log(admin, firmId, "failed", 500, { file: f.name }, `storage: ${up.error.message}`);
    }
  }

  // Record the raw LawRuler status so nothing is lost even if it does not map
  // onto a ClaimReach status. Mapping happens downstream, not here.
  const lrStatus = clean(fields.status);
  if (lrStatus) {
    await admin.from("lead_activity").insert({
      firm_id: firmId, lead_id: leadId, kind: "system",
      body: `LawRuler status: ${lrStatus}`,
      meta: { source: "lawruler", status: lrStatus, vendor_lead_id: vendorId },
    });
  }

  await log(admin, firmId, created ? "received" : "received", 200,
    { vendor_lead_id: vendorId, lead_no: leadNo, created, attachments: stored, skipped }, null);

  return NextResponse.json({
    ok: true, lead_id: leadId, lead_no: leadNo,
    created, updated: !created,
    attachments_stored: stored.length,
    attachments_skipped: skipped.length,
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
    .upsert(rows, { onConflict: "lead_id,kind,value", ignoreDuplicates: false });
  if (error) {
    await log(admin, firmId, "failed", 500, { rows: rows.length }, `contact_points: ${error.message}`);
  }
}

async function upsertLor(
  admin: any, firmId: string, leadId: string,
  fields: Record<string, any>,
) {
  const { data: existing } = await admin
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
    await log(admin, firmId, "failed", 500, { lead_id: leadId }, `lead_lor: ${error.message}`);
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
