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
//   - its signing evidence: the newest main agreement must be completed and
//     not voided, bound to the matter (matterRowsFilter). A null legacy row counts only
//     for a file's sole matter. On a passenger's own file the agreement is
//     the passenger's.
// The sent-once guard is per matter (claims.firm_sent_at / firm_send_result).
// The file-level fields (leads.firm_sent_at / firm_send_result) are still
// written as an echo for the screens that read them. Manual/force resends
// bypass the guard, never the packet checks. Every attempt is logged with the
// claim it was for.
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";
import { isSignedDeclined } from './signed-decline';
import { retainerTokens, fillTemplate } from "@/lib/retainer-tokens";
import { loadIntakeBundle, buildIntakePdfAttachment, buildIntakeCsvSingle, buildIntakeEmailHtml, hasIntakeQuestions, type IntakeBundle } from "@/lib/intake-render";
import { buildCertificatePdf } from "@/lib/certificate";
import { recordAudit } from "@/lib/audit";
import { downloadSignedDoc, listSubmissionDocs, signedDocPath } from "@/lib/signed-docs";
import { establishDocCount, expectedPacketPaths } from "@/lib/mva-call/esign";
import { resolveMatter, matterRowsFilter, rowBelongsToMatter, type MatterClaim } from "@/lib/matter";
import { attorneyHold } from './attorney-hold';
import { getMatterAgreement, agreementIsVoided, getMatterEmergency, emergencySupersedes } from "@/lib/mva-call/signing-matter";
import { signingReleaseGate } from "@/lib/mva-call/replacement";
import { beginFirmDispatch, finishFirmDispatch } from "@/lib/firm-delivery-dispatch";
import { sameName, paxParentId } from "@/lib/linked-files";
import { importedOriginals, verifiedImportedPdfs } from "@/lib/imported-packet";
import { netflyPacketReview, netflyPacketBytes } from "@/lib/netfly-packet";
import { readRehearsal, rehearsalRecipientAllowed } from '@/lib/mva-call/rehearsal';
import { ownerConfirmedDelivery } from '@/lib/owner-file-confirmation';

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
  recoveryRequired?: boolean;
  attemptKey?: string;
}

export interface FirmEmail {
  from: string;
  to: string[];
  cc?: string[];
  reply_to?: string;
  subject: string;
  html: string;
  attachments: { filename: string; content: string }[];
  idempotencyKey?: string;
}

/** Seams for tests. Production passes nothing. */
export interface DeliverDeps {
  db?: any;
  sendEmail?: (m: FirmEmail) => Promise<{ ok: true } | { ok: false; error: string; uncertain?: boolean }>;
  audit?: (row: any) => Promise<void>;
  loadBundle?: (db: any, leadId: string, claimId: string) => Promise<IntakeBundle | null>;
  now?: () => string;
  buildCertificate?: typeof buildCertificatePdf;
}

async function sendViaResend(m: FirmEmail): Promise<{ ok: true } | { ok: false; error: string; uncertain?: boolean }> {
  const key = (globalThis as any)?.process?.env?.RESEND_API_KEY;
  if (!key) return { ok: false, error: "email not configured (RESEND_API_KEY missing in Cloudflare)" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}) },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        from: m.from, to: m.to, cc: m.cc?.length ? m.cc : undefined, reply_to: m.reply_to,
        subject: m.subject, html: m.html, attachments: m.attachments,
      }),
    });
    if (r.ok) return { ok: true };
    const d = await r.json().catch(() => ({}));
    return { ok: false, uncertain: r.status >= 500 || r.status === 408, error: (d as any)?.message || `email send failed (${r.status})` };
  } catch (e: any) {
    return { ok: false, uncertain: true, error: e?.message || "email send error" };
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
  expectedTo?: string;
  expectedCc?: string[];
  /** Final agent handoff: copy the active owner and refuse an owner-only firm address. */
  includeOwner?: boolean;
  additionalRecipients?: string[];
  /** Only the authenticated imported-packet review route may request this path. */
  importedPacket?: boolean;
  /** Authenticated NETFLY final review; snapshot includes answers, originals and recipients. */
  netflySnapshot?: string;
}, deps: DeliverDeps = {}): Promise<DeliverResult> {
  const db = deps.db ?? supabaseAdmin();
  const audit = deps.audit ?? (async (row: any) => { await recordAudit(row); });
  const loadBundle = deps.loadBundle ?? loadIntakeBundle;
  const sendEmail = deps.sendEmail ?? sendViaResend;
  const now = deps.now ?? (() => new Date().toISOString());
  const makeCertificate = deps.buildCertificate ?? buildCertificatePdf;

  const { data: lead, error: leadErr } = await db.from("leads").select("*").eq("id", opts.leadId).maybeSingle();
  if (leadErr) return { ok: false, error: `Could not read the file: ${leadErr.message}. ${NOTHING_SENT}` };
  if (!lead) return { ok: false, error: `File not found. ${NOTHING_SENT}` };
  if (lead.archived_at) return { ok: false, error: `This file is archived. Restore it before delivery. ${NOTHING_SENT}` };

  // ---- Which matter, exactly. Never a guess. ----
  const res = await resolveMatter(db, opts.leadId, { claimId: opts.claimId ?? null, campaignId: lead.campaign_id ?? null });
  if (!res.ok) return { ok: false, ambiguous: !!res.ambiguous, error: `${res.error} ${NOTHING_SENT}` };
  const claim = res.claim;
  if (isSignedDeclined(claim)) return { ok: false, claimId: claim.id, error: 'This signed file was declined. Use its drop-letter request; do not send a new intake packet.' };
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
  let dispatchKey: string | null = null;

  async function record(ok: boolean, error: string | null): Promise<string[]> {
    const problems: string[] = [];
    const stamp = now();
    try {
      const { error: e } = await db.from("firm_deliveries").insert({
        lead_id: opts.leadId, claim_id: claim.id, campaign_id: campaignId, firm_id: lead.firm_id ?? null,
        to_email: to || null, cc_email: cc.join(", ") || null, subject,
        attachments: attachments.map((a) => ({ name: a.filename, kind: a.kind })),
        ok, error, triggered_by: opts.triggeredBy, actor_name: opts.actorName ?? null,
        dispatch_key: dispatchKey,
      });
      if (e) problems.push(`the delivery log did not save (${e.message})`);
    } catch (e) { problems.push(`the delivery log did not save (${errText(e)})`); }
    try {
      const { data: hit, error: e } = await db.from("claims")
        .update(ok ? { firm_sent_at: stamp, firm_send_result: "sent" } : { firm_send_result: `error: ${error}` })
        .eq("id", claim.id).select("id");
      if (e) problems.push(`this matter's delivery record did not save (${e.message})`);
      else if (!hit?.length) problems.push("this matter's delivery record did not save (the matter was not found)");
      // A decline that raced an already-running email must not be reopened.
      if (ok && claim.claim_type === 'mva' && (claim.status === 'signed_approved' || !!opts.netflySnapshot)) {
        const moved = await db.from('claims').update({ status: 'delivered' }).eq('id', claim.id)
          .eq('status', claim.status).select('id');
        if (moved.error || !moved.data?.length) problems.push('the workflow changed during delivery; its newer decision was preserved');
      }
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
    if (st.state.sentAt || ownerConfirmedDelivery(st.state.result)) return { ok: true, claimId: claim.id, skipped: "This matter was already sent to the firm." };
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

  // A completed signature is not QA approval. Every MVA firm handoff,
  // including a manual resend, must be tied to this matter's latest recorded
  // QA approval. A generic status edit or an earlier approval followed by WIP
  // must not release a packet to the firm.
  let netflyPacket: Awaited<ReturnType<typeof netflyPacketReview>> | null = null;
  const attorneyHoldError = async (): Promise<string | null> => {
    if (claim.claim_type !== 'mva') return null;
    try {
      return await attorneyHold(db,lead.firm_id,claim.id,campaignId)
        ? 'Waiting on attorney. The owner must release this hold in Payroll & billing before sending to the firm. Nothing was emailed.' : null;
    } catch(e) { return errText(e); }
  };
  const holdError = await attorneyHoldError();
  if (holdError) return {ok:false,claimId:claim.id,error:holdError};
  if (opts.netflySnapshot) {
    if (opts.triggeredBy !== "manual" || !opts.includeOwner || opts.importedPacket || opts.force) return refuse("Use the NETFLY final review to send this packet.");
    try { netflyPacket = await netflyPacketReview(db, lead, claim, cfg); }
    catch (error) { return refuse(errText(error)); }
    if (netflyPacket.snapshot !== opts.netflySnapshot) return refuse("The file or recipients changed. Refresh the final review before sending.");
    if (netflyPacket.errors.length) return refuse(netflyPacket.errors.join(" "));
  }
  if (!netflyPacket && String(claim.claim_type || cfg.case_type || lead.case_type || "").trim().toLowerCase() === "mva") {
    if (!["signed_approved", "delivered", "retained"].includes(String(claim.status || ""))) {
      return refuse("This MVA matter has not passed signed-file QA. Review and approve it before firm handoff.");
    }
    const { data: latestQa, error: qaErr } = await db.from("qa_reviews")
      .select("decision").eq("claim_id", claim.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (qaErr) return refuse(`Could not verify this matter's QA approval (${qaErr.message}).`);
    if (latestQa?.decision !== "approve") return refuse("This MVA matter has no current QA approval. Review it before firm handoff.");
  }

  to = String(cfg.firm_email || "").trim();
  cc = String(cfg.firm_cc || "").split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
  if (opts.triggeredBy === "manual" && opts.expectedTo !== undefined) {
    const expectedCc = (opts.expectedCc || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean).sort();
    if (opts.expectedTo.trim().toLowerCase() !== to.toLowerCase()
      || expectedCc.join(",") !== cc.map((s) => s.toLowerCase()).sort().join(",")) {
      return refuse("The firm's recipient changed after this screen loaded. Refresh and confirm the current address before sending.");
    }
  }
  const replyTo = String(cfg.firm_reply_to || "").trim() || undefined;
  if (!to) return refuse("This campaign has no firm email set.");
  if (opts.includeOwner) {
    if (opts.triggeredBy !== "manual" || cfg.name !== "INNO MVA" && !netflyPacket) return refuse("Owner-copy handoff is only available for a confirmed intake send.");
    const { data: owners, error: ownerErr } = await db.from("app_users").select("email").eq("role", "owner").eq("active", true);
    if (ownerErr || !owners?.length) return refuse("Could not verify Brett's delivery address. Nothing was emailed.");
    const ownerEmails = (owners as { email?: string }[]).map((owner) => String(owner.email || "").trim().toLowerCase()).filter(Boolean);
    if (!ownerEmails.includes("bmc@innovativeintake.com")) return refuse("Brett's active owner account was not found. Nothing was emailed.");
    if (ownerEmails.includes(to.toLowerCase())) return refuse("The configured firm address is Brett's address. Set the Turnbull delivery email before sending to both recipients.");
    const extras = opts.additionalRecipients ?? [];
    if (extras.length > 3 || extras.some((address) => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(address.trim()))) return refuse("Up to three valid additional email addresses may be added to this handoff.");
    cc = [...new Set([...cc, "bmc@innovativeintake.com", ...extras.map((address) => address.trim().toLowerCase())])]
      .filter((address) => address.toLowerCase() !== to.toLowerCase());
  }

  // Tokens for mail-merge (client + case + campaign), from THIS claim.
  // Synthetic signing exercises use the normal packet/review/delivery checks,
  // but cannot email an unapproved destination or trigger an automatic send.
  let testDelivery = false;
  if (lead.source_key === 'test_lead') {
    let rehearsal;
    try { rehearsal = await readRehearsal(db, lead, claim.campaign_id || null); }
    catch (e) { return refuse(errText(e)); }
    if (!rehearsal || opts.triggeredBy !== 'manual' || [to, ...cc].some(address => !rehearsalRecipientAllowed(rehearsal, 'Email', address)))
      return refuse('This nonbinding rehearsal can only be manually delivered to the owner-approved test emails.');
    testDelivery = true;
  }
  const answers: Record<string, any> = (claim.answers ?? {}) as Record<string, any>;
  const tokens = retainerTokens(lead, answers);
  tokens["campaign.name"] = cfg.name || claim.campaign || lead.campaign || "";
  tokens["firm.name"] = cfg.firm_name || "";
  if (claim.claim_type) tokens["case.type"] = claim.claim_type;

  subject = fillTemplate(String(cfg.firm_subject_tpl || DEFAULT_SUBJECT), tokens);
  let bodyHtml = fillTemplate(String(cfg.firm_body_tpl || DEFAULT_BODY), tokens);
  if (cfg.name === 'INNO MVA') {
    bodyHtml += '<p><a href="https://claimreach.com/firm-review-login">Open the ClaimReach firm inbox</a> to view the intake and signed packet, mark received, or record the firm’s decision. Sign in with your assigned firm account.</p>';
  }
  if (testDelivery) {
    subject = `[NONBINDING TEST] ${subject}`;
    bodyHtml = '<p><strong>SOFTWARE REHEARSAL ONLY. No client representation or medical authorization. All enclosed signing pages are nonbinding test documents.</strong></p>' + bodyHtml;
  }

  // ---- Assemble the selected attachments ----
  const nameBase = safeName(lead.claimant_name || lead.lead_no || "claimant");

  // The body and both artifacts use this one matter's resolved question set.
  // A missing intake refuses the send, rather than shipping a partial packet.
  // INNO MVA is a two-part packet: intake PDF plus every signed retainer
  // document (including the HIPAA/HITECH pages). Campaign toggles cannot
  // silently turn the final handoff into an intake-only email.
  const requirePrimary = String(claim.claim_type || cfg.case_type || lead.case_type || "").trim().toLowerCase() === "mva";
  const wantPdf = requirePrimary || cfg.attach_intake_pdf !== false;
  const wantCsv = cfg.attach_intake_csv === true;
  let intakeFailed: string | null = null;
  let bundle: IntakeBundle | null = null;
  try { bundle = await loadBundle(db, opts.leadId, claim.id); }
  catch (e) { intakeFailed = `the intake could not be loaded (${errText(e)})`; }
  if (!intakeFailed && !bundle) intakeFailed = "this matter's intake could not be found";
  else if (bundle && !hasIntakeQuestions(bundle)) intakeFailed = "no intake questions were found for this matter's case type";
  if (bundle && !intakeFailed) {
    bodyHtml += buildIntakeEmailHtml(bundle);
    if (wantPdf) {
      try {
        attachments.push({ ...await buildIntakePdfAttachment(bundle), kind: "intake_pdf" });
      } catch (e) { intakeFailed = `the intake PDF could not be built (${errText(e)})`; }
    }
    if (!intakeFailed && wantCsv) {
      try {
        const csv = buildIntakeCsvSingle(bundle);
        attachments.push({ filename: `${nameBase}_intake.csv`, content: strToB64(csv), kind: "intake_csv" });
      } catch (e) { intakeFailed = `the intake CSV could not be built (${errText(e)})`; }
    }
  }

  const wantRetainer = requirePrimary || cfg.attach_retainer !== false;
  const wantCert = !opts.importedPacket && !netflyPacket && cfg.attach_certificate !== false;
  // MVA delivery follows agent review of a primary-signed matter. Attachment
  // choices control the email contents, never whether the matter is ready.
  const checkPacket = requirePrimary || wantRetainer;
  const checkCertificate = !opts.importedPacket && !netflyPacket && (requirePrimary || wantCert);

  // An active provisional emergency supersedes older primary evidence for
  // every campaign, including campaigns that intentionally omit attachments.
  const selected = await getMatterAgreement(db, lead, res);
  if (!selected.ok) return refuse(selected.error);
  const d = selected.row;
  if (requirePrimary) {
    let historyQuery = db.from("esign_submissions")
      .select("id, status, created_at, voided_at, replacement_requested_at, replacement_of, agent_reviewed_at, pax_index")
      .eq("lead_id", lead.id).or(matterRowsFilter(res)).order("created_at", { ascending: false });
    if (!paxParentId(lead.external_id)) historyQuery = historyQuery.is("pax_index", null);
    const { data: history, error: historyError } = await historyQuery;
    if (historyError) return refuse(`Could not check agreement corrections before delivery (${historyError.message}).`);
    const releaseProblem = signingReleaseGate(history ?? []);
    if (releaseProblem) return refuse(releaseProblem);
  }
  const emergency = await getMatterEmergency(db, lead, res);
  if (!emergency.ok) return refuse(emergency.error);
  if (emergencySupersedes(d, emergency.row)) return refuse("This matter has a newer provisional emergency agreement. Complete the DocuSeal re-sign, or use an explicitly approved provisional delivery workflow before sending it to the firm.");
  if (opts.importedPacket) {
    if (cfg.name !== "INNO MVA" || !requirePrimary || !["signed_approved", "delivered", "retained"].includes(String(claim.status || ""))) return refuse("Imported packet handoff is unavailable for this matter.");
    if (d) return refuse("This matter has a ClaimReach agreement. Use the normal completed-agreement handoff.");
    try {
      const originalRows = await importedOriginals(db, String(lead.firm_id || ""), lead.id, claim.id);
      const verified = await verifiedImportedPdfs(db, originalRows);
      const { data: review, error: reviewError } = await db.from("lead_activity").select("meta")
        .eq("firm_id", lead.firm_id).eq("lead_id", lead.id).eq("meta->>source", "claimreach").eq("meta->>event", "imported_packet_review")
        .eq("meta->>claim_id", claim.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (reviewError || !review?.meta || Object.keys(review.meta.document_hashes || {}).length !== verified.length
        || verified.some(({ original }) => review.meta.document_hashes[original.id] !== original.hash)
        || ["confirmed_intake", "confirmed_signature", "confirmed_hipaa_hitech", "confirmed_criteria"].some((key) => review.meta[key] !== true)) return refuse("The exact imported originals have not passed a recorded signed-packet review.");
      let number = 0;
      for (const { original, bytes } of verified) {
        number++;
        attachments.push({ filename: `${nameBase}_lawruler_original_${number}_${safeName(original.name)}.pdf`, content: toB64(bytes), kind: original.kind === "retainer" ? "retainer" : "supporting_pdf" });
      }
    } catch (e) { return refuse(`The imported packet could not be verified (${errText(e)}).`); }
  }
  if (netflyPacket && !d) {
    try {
      for (const [index, pdf] of (await netflyPacketBytes(db, netflyPacket.documents)).entries())
        attachments.push({ filename: `${nameBase}_NETFLY_signed_${index + 1}.pdf`, content: toB64(pdf.bytes), kind: "retainer" });
    } catch (error) { return refuse(errText(error)); }
  }
  if (requirePrimary && !d && !opts.importedPacket && !netflyPacket) return refuse("No signed agreement is stored for this matter yet. MVA delivery requires its current completed DocuSeal packet and signing certificate.");

  // The designated agreement (DocuSeal): the newest main agreement bound to
  // THIS matter, including voided/incomplete rows. A sibling's agreement, a voided
  // one, or a null legacy row on a file with several matters never stands
  // in (Astra round 7b #57). On a passenger's own file every agreement is
  // the passenger's, so that is the main one there.
  let dsCertMissing = false;
  let dsPacketShort = false;
  let selectedDocuSeal = false;
  if (requirePrimary || wantRetainer || wantCert) {
    if (d) {
      selectedDocuSeal = true;
      if (agreementIsVoided(d)) return refuse("This matter's current agreement was voided. A new agreement must be signed before delivery.");
      if (d.status !== "completed") return refuse("This matter's current agreement is not complete yet. Finish it before delivery.");
      // A corrected contact name cannot silently relabel immutable evidence.
      // For a guardian-signed packet, compare the injured person, not guardian.
      const agreementPerson = d.injured_name || d.signer_name;
      if (agreementPerson && lead.claimant_name && !sameName(agreementPerson, lead.claimant_name)) return refuse(`This agreement names ${agreementPerson}, but the file now names ${lead.claimant_name}. Review the mismatch and void/re-sign the corrected agreement before delivery. The original stays in history.`);
      if (requirePrimary && ((d.completed_pdf_path && d.completed_pdf_path !== signedDocPath(lead.firm_id, `ds-${d.submission_id}`, "signed")) || (d.cert_pdf_path && d.cert_pdf_path !== signedDocPath(lead.firm_id, `ds-${d.submission_id}`, "cert")))) return refuse("This matter's signed packet has an incorrect storage association. Recover its own agreement and certificate before delivery.");
      if (checkPacket && !d.completed_pdf_path) {
        // A completed signing with no stored primary is an incomplete packet,
        // not a row to skip quietly (Astra round-3 review).
        dsPacketShort = true;
      } else if (checkPacket && d.completed_pdf_path) {
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
              if (buf?.length) { n++; if (wantRetainer) attachments.push({ filename: `${nameBase}_retainer_signed${n > 1 ? `_${n}` : ""}.pdf`, content: toB64(buf), kind: "retainer" }); }
              else { dsPacketShort = true; console.error(`firm delivery: DocuSeal signed PDF unreadable at ${path} for ${d.id}`); }
            }
          }
        } catch (e: any) { dsPacketShort = true; console.error(`firm delivery: DocuSeal signed PDF failed for ${d.id}: ${e?.message ?? e}`); }
      }
      if (checkCertificate && d.cert_pdf_path) {
        try {
          const buf = await downloadSignedDoc(db, d.cert_pdf_path);
          if (buf?.length) { if (wantCert) attachments.push({ filename: `${nameBase}_signing_certificate.pdf`, content: toB64(buf), kind: "certificate" }); }
          else dsCertMissing = true;
        } catch (e: any) { dsCertMissing = true; console.error(`firm delivery: DocuSeal certificate failed for ${d.id}: ${e?.message ?? e}`); }
      } else if (checkCertificate && !d.cert_pdf_path) {
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
  if ((wantRetainer || wantCert) && !selectedDocuSeal && !opts.importedPacket && !netflyPacket) {
    const { data: docs, error: sdErr } = await db.from("signable_documents")
      .select("*").eq("lead_id", opts.leadId).order("created_at", { ascending: false }).order("packet_seq");
    if (sdErr) return refuse(`Could not read this file's older signed retainers (${sdErr.message}).`);
    let legacy: any[] = docs ?? [];
    const owner = new Map<string, string | null>();
    if (legacy.length) {
      const rids = Array.from(new Set(legacy.map((d: any) => d.retainer_id).filter(Boolean))) as string[];
      if (rids.length) {
        const { data: rets, error: rErr } = await db.from("retainers").select("id, claim_id").eq("lead_id", lead.id).in("id", rids);
        if (rErr) return refuse(`Could not read which matter this file's older signed retainers belong to (${rErr.message}).`);
        for (const r of rets ?? []) owner.set(String(r.id), r.claim_id ?? null);
      }
    }
    legacy = legacy.filter((d: any) => (!d.firm_id || d.firm_id === lead.firm_id)
      && (!d.retainer_id || owner.has(String(d.retainer_id)))
      && rowBelongsToMatter({ claim_id: d.retainer_id ? owner.get(String(d.retainer_id)) ?? null : null, campaign_id: null }, matter));
    // One designated packet, including its UNSIGNED members. Filtering signed
    // rows first turned a half-signed packet into an apparently complete one.
    const groupOf = (d: any) => d.packet_group || d.retainer_id || d.id;
    if (legacy.length) {
      const newest = legacy.slice().sort((a: any, b: any) => String(b.created_at || b.sent_at || b.signed_at || "").localeCompare(String(a.created_at || a.sent_at || a.signed_at || "")))[0];
      legacy = legacy.filter((d: any) => groupOf(d) === groupOf(newest));
      const wholeGroup = (docs ?? []).filter((d: any) => groupOf(d) === groupOf(newest));
      if (wholeGroup.length !== legacy.length) return refuse("Some documents in this agreement packet are not associated with the selected matter. Correct the whole packet's association before delivery.");
      if (legacy.some((d: any) => d.audit?.emergency)) return refuse("This is a provisional emergency agreement. Complete the DocuSeal re-sign, or use an explicitly approved provisional delivery workflow before sending it to the firm.");
      if (legacy.some((d: any) => d.status !== "signed")) return refuse("The emergency/legacy agreement packet is not fully signed. Finish every document before delivery.");
    }
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
            else return refuse(`The signed PDF for ${d.title || "an agreement document"} could not be downloaded (${r.status}).`);
          }
          if (buf) {
            const label = safeName(d.title || "retainer");
            attachments.push({ filename: `${nameBase}_${label}_signed.pdf`, content: toB64(buf), kind: "retainer" });
          } else {
            return refuse(`The signed PDF for ${d.title || "an agreement document"} is missing. The whole packet is required.`);
          }
        } catch (e: any) {
          return refuse(`The signed PDF for ${d.title || "an agreement document"} could not be read (${errText(e)}).`);
        }
      } else if (wantRetainer) {
        return refuse(`No signed PDF is stored for ${d.title || "an agreement document"}. The whole packet is required.`);
      }
      // Certificate of signature (generate from the audit fields on the row).
      if (wantCert) {
        try {
          const cert = await makeCertificate({
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
        } catch (e) { return refuse(`The signing certificate for ${d.title || "an agreement document"} could not be built (${errText(e)}).`); }
      }
    }
  }

  // A delivery that is configured to carry the signed retainer must actually
  // carry one. Force bypasses the already-sent guard, never this: a "signed
  // file" email with no signed retainer in it does not go out (Astra, Sep 27).
  if (wantRetainer && !attachments.some((a) => a.kind === "retainer")) {
    return refuse("No signed agreement is stored for this matter yet.");
  }
  if (checkPacket && dsPacketShort) {
    return refuse("The signed packet is not complete in storage yet (a required PDF is missing). Open the file's agreement screen to recover it, then send again.");
  }
  if (intakeFailed) {
    return refuse(`The intake Q&A for this matter is not ready: ${intakeFailed}.`);
  }
  if (requirePrimary && !attachments.some((a) => a.kind === "intake_pdf")) {
    return refuse("The intake PDF is missing from this matter's final packet.");
  }
  if ((checkCertificate && dsCertMissing) || (wantCert && !attachments.some((a) => a.kind === "certificate"))) {
    return refuse("The signing certificate has not stored yet. Open the file's agreement screen to recover it, then send again.");
  }

  // ---- Send ----
  // Reserve only after packet readiness. The database serializes callers on
  // the claim, including forced sends; no timer silently steals a send whose
  // result may already have reached the provider.
  if (netflyPacket) {
    const fresh = await db.from("claims").select("*").eq("id", claim.id).eq("lead_id", lead.id).eq("firm_id", lead.firm_id).maybeSingle();
    const freshLead = await db.from("leads").select("*").eq("id", lead.id).eq("firm_id", lead.firm_id).maybeSingle();
    const freshConfig = await db.from("campaigns").select("*").eq("id", campaignId).eq("firm_id", lead.firm_id).maybeSingle();
    if (fresh.error || freshLead.error || freshConfig.error || !fresh.data || !freshLead.data || !freshConfig.data) return refuse("Could not recheck the final file. Refresh and retry.");
    try {
      const current = await netflyPacketReview(db, freshLead.data, fresh.data, freshConfig.data);
      if (current.snapshot !== opts.netflySnapshot || current.errors.length) return refuse("The file changed while building the packet. Refresh the final review before sending.");
    } catch (error) { return refuse(errText(error)); }
  }
  // Packet assembly may take time. Honor an owner hold added while it ran.
  const finalHoldError = await attorneyHoldError();
  if (finalHoldError) return refuse(finalHoldError);
  const reservation = await beginFirmDispatch(db, opts.leadId, claim.id, lead.firm_id ?? null, campaignId, !!opts.force);
  if (!reservation.ok) return {
    ok: !!reservation.skipped, claimId: claim.id, skipped: reservation.skipped,
    error: reservation.skipped ? undefined : reservation.error,
    recoveryRequired: reservation.recoveryRequired, attemptKey: reservation.attemptKey,
  };
  const attemptKey = reservation.attemptKey;
  dispatchKey = attemptKey;
  const finalClaim = await db.from('claims').select('id,status').eq('id', claim.id).eq('lead_id', lead.id).maybeSingle();
  if (finalClaim.error || !finalClaim.data || isSignedDeclined(finalClaim.data)) {
    const message = 'The file could not be rechecked or was declined while preparing delivery. Nothing was emailed.';
    const finishError = await finishFirmDispatch(db, claim.id, attemptKey, 'failed', message);
    return { ok: false, claimId: claim.id, error: message, ...(finishError ? { warning: finishError, recoveryRequired: true } : {}) };
  }
  const from = (globalThis as any)?.process?.env?.EMAIL_FROM || "ClaimReach <noreply@claimreach.com>";
  let sendOk = false; let sendErr: string | undefined; let uncertain = false;
  try {
    const r = await sendEmail({
      from, to: [to], cc: cc.length ? cc : undefined, reply_to: replyTo,
      subject, html: bodyHtml,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
      idempotencyKey: `firm-delivery-${attemptKey}`,
    });
    if (r.ok) sendOk = true; else { sendErr = r.error; uncertain = !!r.uncertain; }
  } catch (e) { sendErr = errText(e); uncertain = true; }

  // ---- Log + guard + audit ----
  const dispatchError = await finishFirmDispatch(db, claim.id, attemptKey, sendOk ? "sent" : uncertain ? "uncertain" : "failed", sendErr ?? null);
  const problems = await record(sendOk, sendOk ? null : (sendErr || "unknown"));
  if (dispatchError) problems.push(`the delivery reservation did not settle (${dispatchError})`);
  const campName = cfg.name || claim.campaign || "";
  try {
    await audit({
      firm_id: lead.firm_id ?? null, lead_id: opts.leadId, claim_id: claim.id, actor_name: opts.actorName ?? "System",
      category: "system",
      description: sendOk
        ? `Sent to firm (${to})${campName ? ` for ${campName}` : ""} with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}.`
        : `Firm send failed${campName ? ` for ${campName}` : ""}: ${sendErr}.`,
      meta: { to, cc, attachments: attachments.map((a) => a.kind), triggered_by: opts.triggeredBy, claim_id: claim.id, campaign_id: campaignId, attempt_key: attemptKey, uncertain },
    });
  } catch (e) { problems.push(`the activity log entry did not save (${errText(e)})`); }

  if (!sendOk) {
    const msg = uncertain
      ? `The provider's delivery result could not be confirmed (${sendErr || "unknown error"}). The email may have gone out. An owner or admin must check and reconcile this attempt before another send.`
      : `The email to the firm was rejected: ${sendErr || "unknown error"}.`;
    return { ok: false, claimId: claim.id, to, attemptKey, recoveryRequired: uncertain || !!dispatchError, error: problems.length ? `${msg} Also, ${problems.join("; ")}.` : msg };
  }
  const out: DeliverResult = { ok: true, claimId: claim.id, attachments: attachments.map((a) => a.filename), to, attemptKey, recoveryRequired: !!dispatchError };
  if (problems.length) out.warning = `Sent, but ${problems.join("; ")}. Check delivery history before an intentional resend; automatic retries are blocked.`;
  return out;
}

