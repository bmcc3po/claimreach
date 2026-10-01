import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import PostalMime from "postal-mime";
import { NETFLY_ANSWER_KEY, NETFLY_CAMPAIGN } from "../../../src/lib/netfly-ontake";
import { NETFLY_EMAIL_TO, netflyEmailFingerprint, netflyHtmlToText, parseNetflySigningEmail, validNetflyRetainerPdf, validateNetflyEmailEnvelope } from "../../../src/lib/netfly-email";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
type EmailMessage = {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream<Uint8Array> | ArrayBuffer;
  rawSize?: number;
  setReject(reason: string): void;
};

const MAX_RAW_BYTES = 12 * 1024 * 1024;
const BUCKET = "case-docs";

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    let db: SupabaseClient | null = null;
    let firmId: string | null = null;
    let digest = "";
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("NETFLY inbox storage is unconfigured");
      db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const envelopeError = validateNetflyEmailEnvelope({
        from: message.from, headerFrom: message.headers.get("from") || "",
        to: message.to, subject: message.headers.get("subject") || "",
      }, NETFLY_EMAIL_TO);
      if (envelopeError) throw new Error(envelopeError);
      if (message.rawSize && message.rawSize > MAX_RAW_BYTES) throw new Error("NETFLY email exceeds the 12 MiB limit");
      const raw = message.raw instanceof ArrayBuffer ? message.raw : await new Response(message.raw).arrayBuffer();
      if (raw.byteLength > MAX_RAW_BYTES) throw new Error("NETFLY email exceeds the 12 MiB limit");
      digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const parsed = await PostalMime.parse(raw);
      const intake = parseNetflySigningEmail(parsed.text || netflyHtmlToText(parsed.html || ""));
      if (!intake) throw new Error("NETFLY email is missing the complete labeled accident note");
      const pdfs = (parsed.attachments || []).filter((a) => /\.pdf$/i.test(a.filename || ""));
      if (pdfs.length !== 1) throw new Error("NETFLY email must contain exactly one signed-retainer PDF");
      const pdf = pdfs[0];
      if (typeof pdf.content === "string") throw new Error("NETFLY signed-retainer PDF was not decoded as binary");
      const bytes = new Uint8Array(pdf.content);
      if (!validNetflyRetainerPdf(pdf.filename || "", bytes)) throw new Error("NETFLY signed-retainer PDF is incomplete or too large");
      digest = await netflyEmailFingerprint(intake.note, bytes);

      const firm = await db.from("firms").select("id").eq("slug", "tmp").limit(2);
      if (firm.error || firm.data?.length !== 1) throw new Error("TMP firm is unavailable or ambiguous");
      firmId = firm.data[0].id;
      const campaign = await db.from("campaigns").select("id,firm_id,case_type,path,active,esign_required")
        .eq("firm_id", firmId).eq("name", NETFLY_CAMPAIGN).limit(2);
      if (campaign.error || campaign.data?.length !== 1 || campaign.data[0].case_type !== "mva" ||
          campaign.data[0].path !== "secondary" || campaign.data[0].active !== true || campaign.data[0].esign_required !== false)
        throw new Error("NETFLY secondary campaign is unavailable or incorrectly configured");
      const campaignId = campaign.data[0].id;
      const sourceId = `netfly-email:${digest}`;
      const existing = await db.from("leads").select("id,lead_no,claimant_name,campaign_id")
        .eq("firm_id", firmId).eq("campaign_id", campaignId).eq("external_id", sourceId).limit(2);
      if (existing.error || (existing.data?.length || 0) > 1) throw new Error("Could not safely check NETFLY email duplicates");
      let lead = existing.data?.[0];
      if (!lead) {
        const number = await db.rpc("mint_lead_no", { p_firm: firmId });
        if (number.error || !number.data) throw new Error("Could not assign a NETFLY file number");
        const parts = intake.name.split(/\s+/);
        const inserted = await db.from("leads").insert({
          firm_id: firmId, campaign_id: campaignId, campaign: NETFLY_CAMPAIGN,
          case_type: "mva", lead_no: number.data, external_id: sourceId,
          claimant_name: intake.name, first_name: parts[0], last_name: parts.slice(1).join(" "),
          phone: intake.phone || null, email: intake.email || null,
          marketing_source: "NETFLY", stage: "referral_received",
          perm_call: false, perm_text: false, perm_email: false,
        }).select("id,lead_no,claimant_name,campaign_id").single();
        if (inserted.error?.code === "23505") {
          const concurrent = await db.from("leads").select("id,lead_no,claimant_name,campaign_id")
            .eq("firm_id", firmId).eq("campaign_id", campaignId).eq("external_id", sourceId).single();
          if (concurrent.error || !concurrent.data) throw new Error("NETFLY duplicate could not be reconciled");
          lead = concurrent.data;
        } else if (inserted.error || !inserted.data) throw new Error("Could not create NETFLY email file");
        else lead = inserted.data;
      }
      if (!lead || lead.claimant_name?.trim() !== intake.name) throw new Error("NETFLY email identity disagrees with existing file");

      const claims = await db.from("claims").select("id,answers")
        .eq("firm_id", firmId).eq("campaign_id", campaignId).eq("lead_id", lead.id).limit(2);
      if (claims.error || (claims.data?.length || 0) > 1) throw new Error("NETFLY email matter is ambiguous");
      let claim = claims.data?.[0];
      if (!claim) {
        const created = await db.from("claims").insert({
          firm_id: firmId, lead_id: lead.id, campaign_id: campaignId,
          campaign: NETFLY_CAMPAIGN, claim_type: "mva", status: "new",
          answers: { [NETFLY_ANSWER_KEY]: { version: 1, fields: {}, review: { status: "in_progress" },
            handoffs: [{ note: intake.note, at: new Date().toISOString(), by_name: "NETFLY email", channel: "email", source_id: sourceId }] } },
        }).select("id,answers").single();
        if (created.error?.code === "23505") {
          const concurrent = await db.from("claims").select("id,answers")
            .eq("firm_id", firmId).eq("campaign_id", campaignId).eq("lead_id", lead.id).limit(2);
          if (concurrent.error || concurrent.data?.length !== 1) throw new Error("NETFLY matter duplicate could not be reconciled");
          claim = concurrent.data[0];
        } else if (created.error || !created.data) throw new Error("NETFLY lead exists, but matter creation failed");
        else claim = created.data;
      }
      const handoff = claim?.answers?.[NETFLY_ANSWER_KEY]?.handoffs?.[0];
      if (handoff?.source_id !== sourceId || handoff?.note !== intake.note) throw new Error("Existing NETFLY handoff differs from the email");

      const path = `${firmId}/${lead.id}/netfly-email-${digest}.pdf`;
      const prior = await db.from("case_documents").select("id,storage_path")
        .eq("firm_id", firmId).eq("lead_id", lead.id).eq("claim_id", claim.id)
        .eq("doc_type", "netfly_signed_retainer").eq("storage_path", path).limit(2);
      if (prior.error || (prior.data?.length || 0) > 1) throw new Error("Could not safely check the NETFLY signed PDF");
      if (!prior.data?.length) {
        const stored = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (stored.error) throw new Error("NETFLY signed PDF could not be stored");
        const document = await db.from("case_documents").insert({
          firm_id: firmId, lead_id: lead.id, claim_id: claim.id, doc_type: "netfly_signed_retainer",
          file_name: pdf.filename.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120),
          storage_path: path, uploaded_by_name: "NETFLY email",
        }).select("id").single();
        if (document.error && document.error.code !== "23505") throw new Error("NETFLY PDF stored, but its file record failed");
      }
      const document = await db.from("case_documents").select("id")
        .eq("firm_id", firmId).eq("lead_id", lead.id).eq("claim_id", claim.id)
        .eq("doc_type", "netfly_signed_retainer").eq("storage_path", path).limit(2);
      if (document.error || document.data?.length !== 1) throw new Error("NETFLY signed PDF has no unambiguous file record");
      const priorAudit = await db.from("audit_log").select("id")
        .eq("firm_id", firmId).eq("lead_id", lead.id).eq("claim_id", claim.id)
        .eq("description", "NETFLY signed transfer imported from email; review required")
        .contains("meta", { source_id: sourceId }).limit(1);
      if (priorAudit.error) throw new Error("NETFLY import audit could not be checked");
      if (!priorAudit.data?.length) {
        const audit = await db.from("audit_log").insert({
          firm_id: firmId, lead_id: lead.id, claim_id: claim.id, actor_name: "NETFLY email", category: "retainer",
          description: "NETFLY signed transfer imported from email; review required",
          meta: { source_id: sourceId, document_id: document.data[0].id, contact_missing: !intake.phone },
        });
        if (audit.error && audit.error.code !== "23505") throw new Error("NETFLY PDF saved, but audit recording failed");
      }
      await event(db, firmId, "received", 200, digest, lead.id, null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "NETFLY email import failed";
      await event(db, firmId, "failed", 503, digest, null, reason);
      message.setReject("NETFLY signed transfer was not accepted; resend or contact ClaimReach support");
    }
  },
};

async function event(db: SupabaseClient | null, firmId: string | null, status: string, http: number, digest: string, leadId: string | null, error: string | null) {
  if (!db) { console.error("netfly-email", status, error); return; }
  const result = await db.from("webhook_events").insert({ firm_id: firmId, direction: "inbound", event_type: "netfly.email",
    status, http_status: http, payload: { email_sha256: digest || null, lead_id: leadId }, error });
  if (result.error) console.error("netfly-email event failed", result.error.message);
}
