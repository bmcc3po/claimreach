// ============================================================================
// Firm delivery. When a file reaches an unlocks_firm status (or the owner clicks
// "Send to firm now"), assemble the campaign's chosen artifacts and email them
// to the firm with a mail-merged template. Four toggleable attachments:
//   1. Intake Q&A as PDF        (attach_intake_pdf)
//   2. Intake Q&A as CSV        (attach_intake_csv)
//   3. Signed retainer packet   (attach_retainer)
//   4. Certificate of signature (attach_certificate)
// A per-lead guard (firm_sent_at) stops the auto-trigger from double-sending;
// manual/force resends bypass the guard. Every attempt is logged.
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";
import { retainerTokens, fillTemplate } from "@/lib/retainer-tokens";
import { loadIntakeBundle, buildIntakePdf, buildIntakeCsvSingle } from "@/lib/intake-render";
import { buildCertificatePdf } from "@/lib/certificate";
import { recordAudit } from "@/lib/audit";

interface Attachment { filename: string; content: string; kind: string; } // content = base64

function toB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}
function strToB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return toB64(bytes);
}
function safeName(s: string): string {
  return String(s || "file").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "file";
}

const DEFAULT_SUBJECT = "New signed file: {{contact.full_name}} ({{case.lead_no}})";
const DEFAULT_BODY =
  "<p>Hello,</p>" +
  "<p>Please find attached a new signed file for your review.</p>" +
  "<p><strong>Client:</strong> {{contact.full_name}}<br>" +
  "<strong>File number:</strong> {{case.lead_no}}<br>" +
  "<strong>Campaign:</strong> {{campaign.name}}<br>" +
  "<strong>Case type:</strong> {{case.type}}</p>" +
  "<p>Attached documents are listed in this email. Reply here with any questions.</p>" +
  "<p>Innovative Intake</p>";

export interface DeliverResult { ok: boolean; error?: string; skipped?: string; attachments?: string[]; to?: string; }

// Deliver one lead to its firm. `force` bypasses the sent-once guard (manual resend).
export async function deliverLeadToFirm(opts: {
  leadId: string;
  triggeredBy: "auto" | "manual" | "automation";
  actorName?: string | null;
  force?: boolean;
}): Promise<DeliverResult> {
  const admin = supabaseAdmin();
  const sb = admin; // renderers accept any client; admin is fine for system send

  // Load lead + campaign config.
  const { data: lead } = await admin.from("leads").select("*").eq("id", opts.leadId).maybeSingle();
  if (!lead) return { ok: false, error: "lead not found" };

  // Guard: already sent and not forcing.
  if (lead.firm_sent_at && !opts.force) return { ok: true, skipped: "already sent" };

  const campaignId = lead.campaign_id;
  let cfg: any = null;
  if (campaignId) {
    const { data: c } = await admin.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
    cfg = c;
  }
  if (!cfg) return { ok: false, error: "no campaign on this lead; cannot resolve firm delivery config" };

  // Auto-trigger respects the master switch; manual button ignores it.
  if (opts.triggeredBy === "auto" && cfg.firm_delivery_on !== true) return { ok: true, skipped: "auto delivery off for campaign" };

  const to = String(cfg.firm_email || "").trim();
  if (!to) return { ok: false, error: "campaign has no firm email set" };
  const cc = String(cfg.firm_cc || "").split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
  const replyTo = String(cfg.firm_reply_to || "").trim() || undefined;

  // Tokens for mail-merge (client + case + campaign).
  let answers: Record<string, any> = {};
  try {
    const { data: claim } = await admin.from("claims").select("answers").eq("lead_id", opts.leadId).limit(1).maybeSingle();
    answers = claim?.answers ?? {};
  } catch {}
  const tokens = retainerTokens(lead, answers);
  tokens["campaign.name"] = cfg.name || lead.campaign || "";
  tokens["firm.name"] = cfg.firm_name || "";

  const subject = fillTemplate(String(cfg.firm_subject_tpl || DEFAULT_SUBJECT), tokens);
  const bodyHtml = fillTemplate(String(cfg.firm_body_tpl || DEFAULT_BODY), tokens);

  // ---- Assemble the selected attachments ----
  const attachments: Attachment[] = [];
  const nameBase = safeName(lead.claimant_name || lead.lead_no || "claimant");

  const bundle = await loadIntakeBundle(sb, opts.leadId);

  if (cfg.attach_intake_pdf !== false && bundle) {
    try {
      const bytes = await buildIntakePdf(bundle);
      attachments.push({ filename: `${nameBase}_intake.pdf`, content: toB64(bytes), kind: "intake_pdf" });
    } catch (e: any) { /* skip a failed artifact rather than blocking the whole send */ }
  }
  if (cfg.attach_intake_csv === true && bundle) {
    try {
      const csv = buildIntakeCsvSingle(bundle);
      attachments.push({ filename: `${nameBase}_intake.csv`, content: strToB64(csv), kind: "intake_csv" });
    } catch {}
  }

  // Signed retainer packet + certificate share the same signable_documents rows.
  const wantRetainer = cfg.attach_retainer !== false;
  const wantCert = cfg.attach_certificate !== false;
  if (wantRetainer || wantCert) {
    const { data: docs } = await admin.from("signable_documents")
      .select("*").eq("lead_id", opts.leadId).eq("status", "signed").order("packet_seq");
    for (const d of docs ?? []) {
      // Signed retainer PDF (fetch the completed file bytes).
      if (wantRetainer && d.completed_pdf_url) {
        try {
          const r = await fetch(d.completed_pdf_url);
          if (r.ok) {
            const buf = new Uint8Array(await r.arrayBuffer());
            const label = safeName(d.title || "retainer");
            attachments.push({ filename: `${nameBase}_${label}_signed.pdf`, content: toB64(buf), kind: "retainer" });
          }
        } catch {}
      }
      // Certificate of signature (generate from the audit fields on the row).
      if (wantCert) {
        try {
          const cert = await buildCertificatePdf({
            envelopeId: d.envelope_id || d.id,
            title: d.title || "Signed Document",
            signerName: d.signed_name || d.signer_name || lead.claimant_name || "Client",
            signerEmail: d.signer_email || lead.email || null,
            signerIp: d.signed_ip || null,
            senderIp: d.sender_ip || null,
            sentAt: d.sent_at || null,
            viewedAt: d.viewed_at || null,
            consentAt: d.consent_at || null,
            signedAt: d.signed_at || null,
            docHash: d.doc_hash || null,
            signatureType: d.signature_type || null,
          });
          const label = safeName(d.title || "certificate");
          attachments.push({ filename: `${nameBase}_${label}_certificate.pdf`, content: toB64(cert), kind: "certificate" });
        } catch {}
      }
    }
  }

  // ---- Send via Resend (with attachments) ----
  const key = (globalThis as any)?.process?.env?.RESEND_API_KEY;
  const from = (globalThis as any)?.process?.env?.EMAIL_FROM || "ClaimReach <noreply@claimreach.com>";
  let sendOk = false; let sendErr: string | undefined;

  if (!key) {
    sendErr = "email not configured (RESEND_API_KEY missing in Cloudflare)";
  } else {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: [to], cc: cc.length ? cc : undefined, reply_to: replyTo,
          subject, html: bodyHtml,
          attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
        }),
      });
      if (r.ok) sendOk = true;
      else { const d = await r.json().catch(() => ({})); sendErr = (d as any)?.message || `email send failed (${r.status})`; }
    } catch (e: any) { sendErr = e?.message || "email send error"; }
  }

  // ---- Log + guard + audit ----
  await admin.from("firm_deliveries").insert({
    lead_id: opts.leadId, campaign_id: campaignId, firm_id: lead.firm_id ?? null,
    to_email: to, cc_email: cc.join(", ") || null, subject,
    attachments: attachments.map((a) => ({ name: a.filename, kind: a.kind })),
    ok: sendOk, error: sendErr ?? null, triggered_by: opts.triggeredBy, actor_name: opts.actorName ?? null,
  });

  if (sendOk) {
    await admin.from("leads").update({ firm_sent_at: new Date().toISOString(), firm_send_result: "sent" }).eq("id", opts.leadId);
  } else {
    await admin.from("leads").update({ firm_send_result: `error: ${sendErr || "unknown"}` }).eq("id", opts.leadId);
  }

  try {
    await recordAudit({
      firm_id: lead.firm_id ?? null, lead_id: opts.leadId, actor_name: opts.actorName ?? "System",
      category: "system",
      description: sendOk
        ? `Sent to firm (${to}) with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}.`
        : `Firm send failed: ${sendErr}.`,
      meta: { to, cc, attachments: attachments.map((a) => a.kind), triggered_by: opts.triggeredBy },
    });
  } catch {}

  if (!sendOk) return { ok: false, error: sendErr, to };
  return { ok: true, attachments: attachments.map((a) => a.filename), to };
}
