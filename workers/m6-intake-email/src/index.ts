import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import PostalMime from "postal-mime";
import {
  authenticateIntakeEmail,
  classifyLrAttachment,
  INTAKE_TO_DEFAULT,
  isM6LeadShape,
  lrAttachmentPlan,
  M6_CAMPAIGN,
  pickSecondaryInterviewPdf,
  redactIntakeSubject,
  SECONDARY_INTERVIEW_DOC_TYPE,
  SECONDARY_INTERVIEW_TITLE,
  TMP_SLUG,
} from "../../../src/lib/lawruler-email";

export interface Env {
  INTAKE_TO: string;
  LAWRULER_EMAIL_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type EmailMessage = {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream<Uint8Array> | ArrayBuffer;
  setReject(reason: string): void;
};

const BUCKET = "case-docs";

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const fromHeader = message.headers.get("from") || "";
    const subject = message.headers.get("subject") || "";
    const envelope = {
      from: fromHeader || message.from,
      envelope_from: message.from,
      to: message.to,
      subject: redactIntakeSubject(subject),
    };

    const auth = authenticateIntakeEmail({
      from: fromHeader || message.from,
      envelopeFrom: message.from,
      to: message.to,
      subject,
      tokenCsv: env.LAWRULER_EMAIL_TOKEN || "",
      intakeTo: env.INTAKE_TO || INTAKE_TO_DEFAULT,
    });

    if (!auth.ok) {
      message.setReject("unauthorized");
      await log(clientOrNull(env), null, "failed", 401, envelope, auth.reason);
      return;
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("m6-intake-email: supabase secrets missing");
      await log(null, null, "failed", 500, envelope, "supabase unconfigured");
      return;
    }

    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      const parsed = await PostalMime.parse(await rawBytes(message.raw));
      const attachments = parsed.attachments ?? [];
      const filenames = attachments.map((a) => a.filename || "").filter(Boolean);

      for (const name of filenames) {
        if (classifyLrAttachment(name).kind === "intake_csv") {
          await log(admin, null, "received", 200, {
            ...envelope, file: name, reason: "csv_thin",
          }, "attachment skipped: csv_thin");
        }
      }

      const pdfPick = pickSecondaryInterviewPdf(filenames);
      if (!pdfPick) {
        await log(admin, null, "failed", 200, {
          ...envelope, files: filenames, reason: "no_pdf",
        }, "no IntakeForm.pdf");
        return;
      }

      const plan = lrAttachmentPlan(pdfPick.filename, pdfPick.vendorLeadId);
      if (plan.action !== "store") {
        await log(admin, null, "failed", 200, {
          ...envelope, file: pdfPick.filename, reason: plan.reason,
          vendor_lead_id: pdfPick.vendorLeadId,
        }, `attachment skipped: ${plan.reason}`);
        return;
      }

      const pdf = attachments.find((a) => a.filename === pdfPick.filename);
      const bytes = pdf?.content;
      if (!bytes || bytes.byteLength < 8) {
        await log(admin, null, "failed", 200, {
          ...envelope, file: pdfPick.filename, reason: "empty_pdf",
          vendor_lead_id: pdfPick.vendorLeadId,
        }, "empty pdf");
        return;
      }

      const firmId = await resolveFirmId(admin);
      if (!firmId) {
        await log(admin, null, "failed", 500, envelope, "cannot resolve firm");
        return;
      }

      const lead = await matchM6Lead(admin, firmId, pdfPick.vendorLeadId);
      if (!lead) {
        await log(admin, firmId, "failed", 200, {
          ...envelope,
          file: pdfPick.filename,
          vendor_lead_id: pdfPick.vendorLeadId,
          reason: "unmatched",
        }, "unmatched leadid");
        return;
      }

      const path = `${firmId}/${lead.id}/${Date.now()}_secondary_interview.pdf`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upErr) {
        await log(admin, firmId, "failed", 500, {
          ...envelope, lead_id: lead.id, vendor_lead_id: pdfPick.vendorLeadId,
        }, `storage: ${upErr.message}`);
        return;
      }

      const { data: existing } = await admin.from("case_documents")
        .select("id, storage_path")
        .eq("lead_id", lead.id)
        .eq("firm_id", firmId)
        .eq("doc_type", SECONDARY_INTERVIEW_DOC_TYPE)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error: updErr } = await admin.from("case_documents").update({
          storage_path: path,
          file_name: SECONDARY_INTERVIEW_TITLE,
          uploaded_by_name: "LawRuler",
        }).eq("id", existing.id).eq("firm_id", firmId);
        if (updErr) {
          await log(admin, firmId, "failed", 500, {
            ...envelope, lead_id: lead.id, vendor_lead_id: pdfPick.vendorLeadId,
          }, `update: ${updErr.message}`);
          return;
        }
      } else {
        const { error: insErr } = await admin.from("case_documents").insert({
          firm_id: firmId,
          lead_id: lead.id,
          doc_type: SECONDARY_INTERVIEW_DOC_TYPE,
          file_name: SECONDARY_INTERVIEW_TITLE,
          storage_path: path,
          uploaded_by_name: "LawRuler",
        });
        if (insErr) {
          await log(admin, firmId, "failed", 500, {
            ...envelope, lead_id: lead.id, vendor_lead_id: pdfPick.vendorLeadId,
          }, `insert: ${insErr.message}`);
          return;
        }
      }

      await log(admin, firmId, "received", 200, {
        ...envelope,
        lead_id: lead.id,
        vendor_lead_id: pdfPick.vendorLeadId,
        file: pdfPick.filename,
        replaced: !!existing?.id,
      }, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "email ingest error";
      console.error("m6-intake-email", msg);
      await log(admin, null, "failed", 500, envelope, msg);
    }
  },
};

function clientOrNull(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rawBytes(raw: ReadableStream<Uint8Array> | ArrayBuffer): Promise<ArrayBuffer> {
  if (raw instanceof ArrayBuffer) return raw;
  return await new Response(raw).arrayBuffer();
}

async function resolveFirmId(admin: SupabaseClient): Promise<string | null> {
  const { data: rset } = await admin
    .from("retention_settings")
    .select("firm_id")
    .eq("campaign", M6_CAMPAIGN)
    .maybeSingle();
  if (rset?.firm_id) return rset.firm_id;
  const { data: firm } = await admin.from("firms").select("id").eq("slug", TMP_SLUG).maybeSingle();
  return firm?.id ?? null;
}

async function matchM6Lead(
  admin: SupabaseClient,
  firmId: string,
  vendorId: string,
): Promise<{ id: string } | null> {
  if (!/^\d+$/.test(vendorId)) return null;
  const { data, error } = await admin.from("leads")
    .select("id, firm_id, campaign, case_type, archived_at, external_id, lawruler_ref_no")
    .eq("firm_id", firmId)
    .or(`external_id.eq.${vendorId},lawruler_ref_no.eq.${vendorId}`)
    .is("archived_at", null);
  if (error || !data?.length) return null;
  const hits = data.filter((row) => isM6LeadShape(row));
  if (hits.length !== 1) return null;
  return { id: hits[0].id };
}

async function log(
  admin: SupabaseClient | null,
  firmId: string | null,
  status: string,
  http: number,
  payload: Record<string, unknown>,
  error: string | null,
): Promise<void> {
  if (!admin) {
    console.log("m6-intake-email", status, error, payload);
    return;
  }
  try {
    await admin.from("webhook_events").insert({
      firm_id: firmId,
      direction: "inbound",
      event_type: "lawruler.email",
      status,
      http_status: http,
      payload,
      error,
    });
  } catch (e) {
    console.error("m6-intake-email log", e instanceof Error ? e.message : "log failed");
  }
}
