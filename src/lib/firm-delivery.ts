// ============================================================================
// Firm delivery. When a matter reaches an unlocks_firm status (or someone
// clicks "Send to firm"), assemble its campaign's chosen artifacts and email
// them to the firm with a mail-merged template. Four toggleable attachments:
//   1. Intake Q&A as PDF        (attach_intake_pdf)
//   2. Intake Q&A as CSV        (attach_intake_csv)
//   3. Signed retainer packet   (attach_retainer)
//   4. Certificate of signature (attach_certificate)
//
// ONE delivery is ONE matter (claim), resolved through resolveMatter: the
// named claim, else the file's only matter, else the single matter on the
// file's campaign. Ambiguity or a failed lookup refuses; nothing guesses a
// sibling (Astra round 7b #57). Everything comes from that claim:
//   - its campaign's delivery setup (master switch, addresses, templates,
//     attachment toggles), read by the CLAIM's campaign_id,
//   - its intake (answers, case type, campaign form),
//   - its signing evidence: the newest completed, not voided, main agreement
//     bound to the matter (matterRowsFilter). A null legacy row counts only
//     for a file's sole matter. On a passenger's own file the agreement is
//     the passenger's.
// The sent-once guard is per matter (claims.firm_sent_at / firm_send_result).
// The file-level fields (leads.firm_sent_at / firm_send_result) are still
// written as an echo for the screens that read them. Manual/force resends
// bypass the guard, never the packet checks. Every attempt is logged with the
// claim it was for.
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";
import { retainerTokens, fillTemplate } from "@/lib/retainer-tokens";
import { loadIntakeBundle, buildIntakePdf, buildIntakeCsvSingle, type IntakeBundle } from "@/lib/intake-render";
import { buildCertificatePdf } from "@/lib/certificate";
import { recordAudit } from "@/lib/audit";
import { downloadSignedDoc, listSubmissionDocs } from "@/lib/signed-docs";
import { establishDocCount, expectedPacketPaths } from "@/lib/mva-call/esign";
import { resolveMatter, matterRowsFilter, rowBelongsToMatter, type MatterClaim } from "@/lib/matter";
import { paxParentId } from "@/lib/linked-files";

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
function errText(e: any): string {
  return String(e?.message ?? e ?? "unknown error");
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

const NOTHING_SENT = "Nothing was emailed.";

export interface DeliverResult {
  ok: boolean;
  error?: string;
  skipped?: string;
  attachments?: string[];
  to?: string;
  /** The matter this attempt was for. Absent when no single matter resolved. */
  claimId?: string;
  /** The file has several matters and none was named. */
  ambiguous?: boolean;
  /** The email went out, but something recorded after it did not save. */
  warning?: string;
}

export interface FirmEmail {
  from: string;
  to: string[];
  cc?: string[];
  reply_to?: string;
  subject: string;
  html: string;
  attachments: { filename: string; content: string }[];
}

/** Seams for tests. Production passes nothing. */
export interface DeliverDeps {
  db?: any;
  sendEmail?: (m: FirmEmail) => Promise<{ ok: true } | { ok: false; error: string }>;
  audit?: (row: any) => Promise<void>;
  loadBundle?: (db: any, leadId: string, claimId: string) => Promise<IntakeBundle | null>;
  now?: () => string;
}

async function sendViaResend(m: FirmEmail): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = (globalThis as any)?.process?.env?.RESEND_API_KEY;
  if (!key) return { ok: false, error: "email not configured (RESEND_API_KEY missing in Cloudflare)" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: m.from, to: m.to, cc: m.cc?.length ? m.cc : undefined, reply_to: m.reply_to,
        subject: m.subject, html: m.html, attachments: m.attachments,
      }),
    });
    if (r.ok) return { ok: true };
    const d = await r.json().catch(() => ({}));
    return { ok: false, error: (d as any)?.message || `email send failed (${r.status})` };
  } catch (e: any) {
    return { ok: false, error: e?.message || "email send error" };
  }
}

type Matter = { claim: MatterClaim; sole: boolean };

export interface MatterSendState {
  /** When this matter went to the firm, or null if it has not. */
  sentAt: string | null;
  /** The last recorded result for this matter ("sent" or "error: ..."). */
  result: string | null;
  /** True when the only record is from before per-matter tracking. */
  legacy: boolean;
}

/**
 * Has THIS matter already gone to the firm? ONE definition, read by the
 * delivery guard and by the Send to firm button.
 *   claims.firm_sent_at is the guard.
 *   Before per-matter tracking the only record was the file-level
 *   leads.firm_sent_at. It still counts for the matter it can be tied to:
 *   the file's only matter, or, on a file with several, a matter whose
 *   campaign has a logged successful delivery from that time (those rows
 *   carry no claim). It never blocks a sibling on another campaign, and a
 *   send under this code never counts for a sibling.
 * A failed read is an error, never "not sent".
 */
export async function matterSendState(
  db: any,
  lead: { id: string; firm_sent_at?: string | null; firm_send_result?: string | null },
  m: Matter,
): Promise<{ ok: true; state: MatterSendState } | { ok: false; error: string }> {
  const { data: row, error } = await db.from("claims").select("firm_sent_at, firm_send_result").eq("id", m.claim.id).maybeSingle();
  if (error) return { ok: false, error: `Could not read whether this matter was already sent: ${error.message}.` };
  const result: string | null = row?.firm_send_result ?? null;
  if (row?.firm_sent_at) return { ok: true, state: { sentAt: row.firm_sent_at, result, legacy: false } };
  if (lead.firm_sent_at) {
    if (m.sole) return { ok: true, state: { sentAt: lead.firm_sent_at, result: result ?? lead.firm_send_result ?? null, legacy: true } };
    if (m.claim.campaign_id) {
      const { data: logs, error: lErr } = await db.from("firm_deliveries").select("created_at")
        .eq("lead_id", lead.id).eq("ok", true).is("claim_id", null).eq("campaign_id", m.claim.campaign_id)
        .order("created_at", { ascending: false }).limit(1);
      if (lErr) return { ok: false, error: `Could not read this file's delivery history: ${lErr.message}.` };
      if (logs?.length) return { ok: true, state: { sentAt: logs[0].created_at ?? lead.firm_sent_at, result: result ?? "sent", legacy: true } };
    }
  }
  return { ok: true, state: { sentAt: null, result, legacy: false } };
}

// Deliver ONE matter to its firm. `force` bypasses the sent-once guard
// (manual resend), never the packet checks.
export async function deliverLeadToFirm(opts: {
  leadId: string;
  /** The matter to send. Without it, the file's single matter or the single matter on its campaign. */
  claimId?: string | null;
  triggeredBy: "auto" | "manual" | "automation";
  actorName?: string | null;
  force?: boolean;
}, deps: DeliverDeps = {}): Promise<DeliverResult> {
  const db = deps.db ?? supabaseAdmin();
  const audit = deps.audit ?? (async (row: any) => { await recordAudit(row); });
  const loadBundle = deps.loadBundle ?? loadIntakeBundle;
  const sendEmail = deps.sendEmail ?? sendViaResend;
  const now = deps.now ?? (() => new Date().toISOString());

  const { data: lead, error: leadErr } = await db.from("leads").select("*").eq("id", opts.leadId).maybeSingle();
  if (leadErr) return { ok: false, error: `Could not read the file: ${leadErr.message}. ${NOTHING_SENT}` };
  if (!lead) return { ok: false, error: `File not found. ${NOTHING_SENT}` };

  // ---- Which matter, exactly. Never a guess. ----
  const res = await resolveMatter(db, opts.leadId, { claimId: opts.claimId ?? null, campaignId: lead.campaign_id ?? null });
  if (!res.ok) return { ok: false, ambiguous: !!res.ambiguous, error: `${res.error} ${NOTHING_SENT}` };
  const claim = res.claim;
  const matter: Matter = { claim, sole: res.sole };
  // The campaign whose setup applies: the claim's own. A legacy claim with no
  // campaign recorded uses the file's only when it is the file's sole matter.
  const campaignId: string | null = claim.campaign_id ?? (matter.sole ? lead.campaign_id ?? null : null);

  // Every refusal after this point is recorded on the matter, the file echo
  // and the delivery log, and says so if any of those writes failed.
  let to = "";
  let cc: string[] = [];
  let subject: string | null = null;
  const attachments: Attachment[] = [];

  async function record(ok: boolean, error: string | null): Promise<string[]> {
    const problems: string[] = [];
    const stamp = now();
    try {
      const { error: e } = await db.from("firm_deliveries").insert({
        lead_id: opts.leadId, claim_id: claim.id, campaign_id: campaignId, firm_id: lead.firm_id ?? null,
        to_email: to || null, cc_email: cc.join(", ") || null, subject,
        attachments: attachments.map((a) => ({ name: a.filename, kind: a.kind })),
        ok, error, triggered_by: opts.triggeredBy, actor_name: opts.actorName ?? null,
      });
      if (e) problems.push(`the delivery log did not save (${e.message})`);
    } catch (e) { problems.push(`the delivery log did not save (${errText(e)})`); }
    try {
      const { data: hit, error: e } = await db.from("claims")
        .update(ok ? { firm_sent_at: stamp, firm_send_result: "sent" } : { firm_send_result: `error: ${error}` })
        .eq("id", claim.id).select("id");
      if (e) problems.push(`this matter's delivery record did not save (${e.message})`);
      else if (!hit?.length) problems.push("this matter's delivery record did not save (the matter was not found)");
    } catch (e) { problems.push(`this matter's delivery record did not save (${errText(e)})`); }
    try {
      const { error: e } = await db.from("leads")
        .update(ok ? { firm_sent_at: stamp, firm_send_result: "sent", stage: "sent_to_firm" } : { firm_send_result: `error: ${error}` })
        .eq("id", opts.leadId);
      if (e) problems.push(`the file's delivery record did not save (${e.message})`);
    } catch (e) { problems.push(`the file's delivery record did not save (${errText(e)})`); }
    return problems;
  }
  async function refuse(msg: string): Promise<DeliverResult> {
    const full = `${msg} ${NOTHING_SENT}`;
    const problems = await record(false, full);
    return {
      ok: false, claimId: claim.id, to: to || undefined,
      error: problems.length ? `${full} Also, ${problems.join("; ")}.` : full,
    };
  }

  // A claim or campaign of another firm never sends this file (tenant rule).
  if (claim.firm_id && lead.firm_id && claim.firm_id !== lead.firm_id) {
    return refuse("This matter is recorded under a different firm than the file.");
  }

  // ---- Guard: this matter already sent, and not forcing. ----
  if (!opts.force) {
    const st = await matterSendState(db, lead, matter);
    if (!st.ok) return { ok: false, claimId: claim.id, error: `${st.error} ${NOTHING_SENT}` };
    if (st.state.sentAt) return { ok: true, claimId: claim.id, skipped: "This matter was already sent to the firm." };
  }

  // ---- The claim's campaign: delivery setup and master switch. ----
  if (!campaignId) {
    // No campaign means no master switch to be on: the auto-trigger stands
    // down the same way it does for a switched-off campaign. A person or an
    // automation that asked for the send gets the reason.
    if (opts.triggeredBy === "auto") return { ok: true, claimId: claim.id, skipped: "Automatic delivery is off: this matter has no campaign." };
    return refuse("This matter has no campaign, so there is no firm delivery setup for it.");
  }
  const { data: cfg, error: cfgErr } = await db.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (cfgErr) return refuse(`Could not read the campaign's delivery setup (${cfgErr.message}).`);
  if (!cfg) return refuse("This matter's campaign no longer exists, so there is no firm delivery setup for it.");
  if (cfg.firm_id && lead.firm_id && cfg.firm_id !== lead.firm_id) {
    return refuse("This matter's campaign belongs to a different firm than the file.");
  }

  // Auto-trigger respects the master switch; manual button ignores it.
  if (opts.triggeredBy === "auto" && cfg.firm_delivery_on !== true) {
    return { ok: true, claimId: claim.id, skipped: "Automatic delivery is off for this matter's campaign." };
  }

  to = String(cfg.firm_email || "").trim();
  cc = String(cfg.firm_cc || "").split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
  const replyTo = String(cfg.firm_reply_to || "").trim() || undefined;
  if (!to) return refuse("This campaign has no firm email set.");

  // Tokens for mail-merge (client + case + campaign), from THIS claim.
  const answers: Record<string, any> = (claim.answers ?? {}) as Record<string, any>;
  const tokens = retainerTokens(lead, answers);
  tokens["campaign.name"] = cfg.name || claim.campaign || lead.campaign || "";
  tokens["firm.name"] = cfg.firm_name || "";
  if (claim.claim_type) tokens["case.type"] = claim.claim_type;

  subject = fillTemplate(String(cfg.firm_subject_tpl || DEFAULT_SUBJECT), tokens);
  const bodyHtml = fillTemplate(String(cfg.firm_body_tpl || DEFAULT_BODY), tokens);

  // ---- Assemble the selected attachments ----
  const nameBase = safeName(lead.claimant_name || lead.lead_no || "claimant");

  // The intake. A configured intake artifact that cannot be built REFUSES
  // the send instead of quietly shipping without it (Astra round 5), and a
  // missing intake is a refusal too, never a lighter packet (round 7b #57).
  const wantPdf = cfg.attach_intake_pdf !== false;
  const wantCsv = cfg.attach_intake_csv === true;
  let intakeFailed: string | null = null;
  if (wantPdf || wantCsv) {
    let bundle: IntakeBundle | null = null;
    try { bundle = await loadBundle(db, opts.leadId, claim.id); }
    catch (e) { intakeFailed = `the intake could not be loaded (${errText(e)})`; }
    if (!intakeFailed && !bundle) intakeFailed = "this matter's intake could not be found";
    else if (bundle && !(bundle.fields ?? []).length) intakeFailed = "no intake questions were found for this matter's case type";
    if (bundle && !intakeFailed && wantPdf) {
      try {
        const bytes = await buildIntakePdf(bundle);
        attachments.push({ filename: `${nameBase}_intake.pdf`, content: toB64(bytes), kind: "intake_pdf" });
      } catch (e) { intakeFailed = `the intake PDF could not be built (${errText(e)})`; }
    }
    if (bundle && !intakeFailed && wantCsv) {
      try {
        const csv = buildIntakeCsvSingle(bundle);
        attachments.push({ filename: `${nameBase}_intake.csv`, content: strToB64(csv), kind: "intake_csv" });
      } catch (e) { intakeFailed = `the intake CSV could not be built (${errText(e)})`; }
    }
  }

  const wantRetainer = cfg.attach_retainer !== false;
  const wantCert = cfg.attach_certificate !== false;

  // The designated agreement (DocuSeal): the newest completed, not voided,
  // main agreement bound to THIS matter. A sibling's agreement, a voided
  // one, or a null legacy row on a file with several matters never stands
  // in (Astra round 7b #57). On a passenger's own file every agreement is
  // the passenger's, so that is the main one there.
  let dsCertMissing = false;
  let dsPacketShort = false;
  if (wantRetainer || wantCert) {
    const passengerFile = paxParentId(lead.external_id) !== null;
    let q = db.from("esign_submissions")
      .select("id, submission_id, template_key, campaign_id, claim_id, pax_index, completed_pdf_path, cert_pdf_path, status, doc_count, voided_at, created_at")
      .eq("lead_id", opts.leadId).eq("status", "completed").is("voided_at", null)
      .or(matterRowsFilter(matter));
    q = passengerFile ? q.not("pax_index", "is", null) : q.is("pax_index", null);
    const { data: dsRows, error: dsErr } = await q.order("created_at", { ascending: false }).limit(1);
    if (dsErr) return refuse(`Could not read this matter's signed agreement (${dsErr.message}).`);
    const d = (dsRows ?? []).find((r: any) => rowBelongsToMatter(r, matter)) ?? null;
    if (d) {
      if (wantRetainer && !d.completed_pdf_path) {
        // A completed signing with no stored primary is an incomplete packet,
        // not a row to skip quietly (Astra round-3 review).
        dsPacketShort = true;
      } else if (wantRetainer && d.completed_pdf_path) {
        try {
          // The whole packet against an ESTABLISHED manifest. An unknown or
          // zero count is "packet not yet verified", never "one PDF": rows
          // from before the doc_count column get their true size from
          // DocuSeal here, and if that cannot be established the send
          // refuses (Astra round 5).
          const firmFolder = String(d.completed_pdf_path).split("/")[0];
          const count = await establishDocCount(db, d);
          if (count == null) {
            dsPacketShort = true;
            console.error(`firm delivery: packet size unknown for ${d.id} and DocuSeal could not confirm it`);
          } else {
            // Exact expected names, in order: a stray -99 never stands in
            // for a missing -2 (Astra round 5).
            const stored = await listSubmissionDocs(db, firmFolder, String(d.submission_id));
            let n = 0;
            for (const path of expectedPacketPaths(firmFolder, String(d.submission_id), count)) {
              if (!stored.includes(path)) {
                dsPacketShort = true;
                console.error(`firm delivery: DocuSeal signed PDF missing at ${path} for ${d.id}`);
                continue;
              }
              const buf = await downloadSignedDoc(db, path);
              if (buf) { n++; attachments.push({ filename: `${nameBase}_retainer_signed${n > 1 ? `_${n}` : ""}.pdf`, content: toB64(buf), kind: "retainer" }); }
              else { dsPacketShort = true; console.error(`firm delivery: DocuSeal signed PDF unreadable at ${path} for ${d.id}`); }
            }
          }
        } catch (e: any) { dsPacketShort = true; console.error(`firm delivery: DocuSeal signed PDF failed for ${d.id}: ${e?.message ?? e}`); }
      }
      if (wantCert && d.cert_pdf_path) {
        try {
          const buf = await downloadSignedDoc(db, d.cert_pdf_path);
          if (buf) attachments.push({ filename: `${nameBase}_signing_certificate.pdf`, content: toB64(buf), kind: "certificate" });
          else dsCertMissing = true;
        } catch (e: any) { dsCertMissing = true; console.error(`firm delivery: DocuSeal certificate failed for ${d.id}: ${e?.message ?? e}`); }
      } else if (wantCert && d.completed_pdf_path && !d.cert_pdf_path) {
        // Completed signing with no stored certificate: the packet is not
        // whole yet (Astra round 3).
        dsCertMissing = true;
      }
    }
  }

  // Legacy signed retainers (SignWell-era signable_documents rows). They
  // carry no claim or campaign of their own, so the same matter rule applies:
  // a row counts for the file's sole matter, or, on a file with several,
  // only when its retainer was explicitly associated with this claim
  // (retainers.claim_id, migration 0108).
  if (wantRetainer || wantCert) {
    const { data: docs, error: sdErr } = await db.from("signable_documents")
      .select("*").eq("lead_id", opts.leadId).eq("status", "signed").order("packet_seq");
    if (sdErr) return refuse(`Could not read this file's older signed retainers (${sdErr.message}).`);
    let legacy: any[] = docs ?? [];
    const owner = new Map<string, string | null>();
    if (legacy.length && !matter.sole) {
      const rids = Array.from(new Set(legacy.map((d: any) => d.retainer_id).filter(Boolean))) as string[];
      if (rids.length) {
        const { data: rets, error: rErr } = await db.from("retainers").select("id, claim_id").in("id", rids);
        if (rErr) return refuse(`Could not read which matter this file's older signed retainers belong to (${rErr.message}).`);
        for (const r of rets ?? []) owner.set(String(r.id), r.claim_id ?? null);
      }
    }
    legacy = legacy.filter((d: any) => rowBelongsToMatter({ claim_id: d.retainer_id ? owner.get(String(d.retainer_id)) ?? null : null, campaign_id: null }, matter));
    for (const d of legacy) {
      // Signed retainer PDF (fetch the completed file bytes).
      if (wantRetainer && (d.completed_pdf_path || d.completed_pdf_url)) {
        try {
          // Our own signed files are read straight from the private bucket.
          // Only an external provider link (SignWell) is fetched over HTTP.
          let buf: Uint8Array | null = null;
          if (d.completed_pdf_path) {
            buf = await downloadSignedDoc(db, d.completed_pdf_path);
          } else if (/^https?:\/\//.test(d.completed_pdf_url)) {
            const r = await fetch(d.completed_pdf_url);
            if (r.ok) buf = new Uint8Array(await r.arrayBuffer());
            else console.error(`firm delivery: signed PDF fetch ${r.status} for signable ${d.id}`);
          }
          if (buf) {
            const label = safeName(d.title || "retainer");
            attachments.push({ filename: `${nameBase}_${label}_signed.pdf`, content: toB64(buf), kind: "retainer" });
          } else {
            console.error(`firm delivery: signed PDF missing for signable ${d.id}`);
          }
        } catch (e: any) {
          console.error(`firm delivery: signed PDF failed for signable ${d.id}: ${e?.message ?? e}`);
        }
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

  // A delivery that is configured to carry the signed retainer must actually
  // carry one. Force bypasses the already-sent guard, never this: a "signed
  // file" email with no signed retainer in it does not go out (Astra, Sep 27).
  if (wantRetainer && !attachments.some((a) => a.kind === "retainer")) {
    return refuse("No signed agreement is stored for this matter yet.");
  }
  if (wantRetainer && dsPacketShort) {
    return refuse("The signed packet is not complete in storage yet (a required PDF is missing). Open the file's agreement screen to recover it, then send again.");
  }
  if (intakeFailed) {
    return refuse(`The intake this campaign attaches is not ready: ${intakeFailed}.`);
  }
  if (wantCert && dsCertMissing) {
    return refuse("The signing certificate has not stored yet. Open the file's agreement screen to recover it, then send again.");
  }

  // ---- Send ----
  const from = (globalThis as any)?.process?.env?.EMAIL_FROM || "ClaimReach <noreply@claimreach.com>";
  let sendOk = false; let sendErr: string | undefined;
  try {
    const r = await sendEmail({
      from, to: [to], cc: cc.length ? cc : undefined, reply_to: replyTo,
      subject, html: bodyHtml,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
    });
    if (r.ok) sendOk = true; else sendErr = r.error;
  } catch (e) { sendErr = errText(e); }

  // ---- Log + guard + audit ----
  const problems = await record(sendOk, sendOk ? null : (sendErr || "unknown"));
  const campName = cfg.name || claim.campaign || "";
  try {
    await audit({
      firm_id: lead.firm_id ?? null, lead_id: opts.leadId, claim_id: claim.id, actor_name: opts.actorName ?? "System",
      category: "system",
      description: sendOk
        ? `Sent to firm (${to})${campName ? ` for ${campName}` : ""} with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}.`
        : `Firm send failed${campName ? ` for ${campName}` : ""}: ${sendErr}.`,
      meta: { to, cc, attachments: attachments.map((a) => a.kind), triggered_by: opts.triggeredBy, claim_id: claim.id, campaign_id: campaignId },
    });
  } catch (e) { problems.push(`the activity log entry did not save (${errText(e)})`); }

  if (!sendOk) {
    const msg = `The email to the firm did not go out: ${sendErr || "unknown error"}.`;
    return { ok: false, claimId: claim.id, to, error: problems.length ? `${msg} Also, ${problems.join("; ")}.` : msg };
  }
  const out: DeliverResult = { ok: true, claimId: claim.id, attachments: attachments.map((a) => a.filename), to };
  if (problems.length) out.warning = `Sent, but ${problems.join("; ")}. Check the file before sending again; it may send again automatically.`;
  return out;
}
