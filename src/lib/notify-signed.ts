// ============================================================================
// When a client signs, email the people who handle that case type. One
// definition of who gets it (signedRecipients), one rule for when it may be
// attempted (signedNoticeDue) and one sender (notifySigned), called from
// syncSubmission. DocuSeal's webhook and the agent's screen both land here.
//
// Delivery is AT LEAST ONCE, with provider idempotency. It is not
// exactly-once. The lifecycle lives on esign_submissions (migration 0108):
//
//   notify_state      null / pending   not tried yet          -> may claim
//                     sending          a sender holds a lease -> may reclaim
//                                      only once the lease is older than
//                                      NOTIFY_LEASE_MINUTES (a crash mid-send)
//                     failed           the last try failed     -> may claim
//                     sent             it went; signed_notified_at is stamped
//                     no_recipient     nobody is set to get it (terminal and
//                                      visible, never quietly "sent")
//                     legacy_unknown   marked before 0108 with no proof of a
//                                      send; never re-sent automatically
//   notify_claimed_at when the current lease was taken
//   notify_attempts   bumped on every claim (also the compare-and-set version)
//   notify_error      the last reason it did not go
//
// A claim is a compare-and-set on the row exactly as it was read, so two
// racing syncs cannot both take the same lease. A sender that dies after
// the provider accepted the email leaves the row "sending"; after the lease
// runs out the next sync sends again with the same Idempotency-Key, and
// Resend answers the first result instead of emailing twice while its key
// window (24 hours) lasts and the content is unchanged. Outside that, a
// second email is possible. That is the accepted trade: a duplicate beats a
// team that never hears a client signed.
//
// Rules live in notify_routes (migration 0099), set in Settings > When a
// client signs:
//   a case-type rule (no campaign) is the distro for every signing of that
//   type, like mva@
//   a campaign rule adds CCs for that campaign only, like tmpmva@
// Every matching rule's To and CC are combined.
// ============================================================================
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { caseReport, caseReportHtml, caseReportText } from "@/lib/mva-call/report";
import { signedPdfAttachment } from "@/lib/signed-docs";
import { caseName } from "@/lib/case-name";
import { leadKeyOf } from "@/lib/lead-key";
import { resolveSigningMatter, getMatterAgreement, getMatterEmergency, emergencySupersedes } from "@/lib/mva-call/signing-matter";
import { matterRowsFilter, rowBelongsToMatter } from "@/lib/matter";
import { paxParentId } from "@/lib/linked-files";

export interface NotifyRoute {
  event: string;
  case_type: string | null;
  campaign_id: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  active?: boolean | null;
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "mva@x.com, TMPmva@x.com; bad" -> ["mva@x.com", "tmpmva@x.com"]. Order kept, no repeats. */
export function cleanEmails(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/);
  const out: string[] = [];
  for (const p of parts) {
    const e = String(p ?? "").trim().toLowerCase();
    if (EMAIL_RE.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

/** Who gets the email for one signing. */
export function signedRecipients(routes: NotifyRoute[], lead: { case_type?: string | null; campaign_id?: string | null }): { to: string[]; cc: string[] } {
  const hits = routes.filter((r) =>
    r.active !== false && (r.event || "signed") === "signed" &&
    (r.campaign_id ? r.campaign_id === lead.campaign_id : (!r.case_type || r.case_type === lead.case_type)));
  let to = cleanEmails(hits.flatMap((r) => r.to_emails ?? []));
  let cc = cleanEmails(hits.flatMap((r) => r.cc_emails ?? [])).filter((e) => !to.includes(e));
  if (!to.length && cc.length) { to = cc; cc = []; }
  return { to, cc };
}

const AGREEMENT: Record<string, string> = { TX: "Texas", FL: "Florida", OTHER: "AL/GA", NV: "Nevada tiered", NV_FLAT: "Nevada NON-TIERED" };

/** How long a sender's lease holds before another sync may take it over. */
export const NOTIFY_LEASE_MINUTES = 10;
const LEASE_MS = NOTIFY_LEASE_MINUTES * 60_000;

export type NotifyState = "pending" | "sending" | "sent" | "no_recipient" | "failed" | "legacy_unknown";

/** The lease fields of one esign_submissions row. */
export interface NotifyLeaseRow {
  status?: string | null;
  voided_at?: string | null;
  signed_notified_at?: string | null;
  notify_state?: string | null;
  notify_claimed_at?: string | null;
}

/**
 * Whether this agreement's team email may be attempted now. The ONE rule:
 * syncSubmission may use it to skip a needless call, and notifySigned
 * re-checks it on a fresh read before its compare-and-set claim.
 * Anything not listed as claimable (sent, no_recipient, legacy_unknown, an
 * unknown value) is never attempted automatically.
 */
export function signedNoticeDue(row: NotifyLeaseRow | null | undefined, now: number = Date.now()): boolean {
  if (!row) return false;
  if (row.signed_notified_at) return false;
  if (row.voided_at || row.status === "voided") return false;
  const state = row.notify_state ?? null;
  if (state === null || state === "pending" || state === "failed") return true;
  if (state === "sending") {
    const at = Date.parse(String(row.notify_claimed_at ?? ""));
    // A lease with no time cannot be held by anyone: take it.
    return !Number.isFinite(at) || now - at > LEASE_MS;
  }
  return false;
}

/** The provider idempotency key for one agreement's team email. */
export function signedNotifyKey(rowId: string): string {
  return `signed-notify-${rowId}`;
}

export type NotifyOutcome =
  | "sent"               // the provider accepted it
  | "failed"             // it did not go; a later sync tries again
  | "no_recipient"       // nobody is set to get it; terminal
  | "not_due"            // already handled, held by a live lease, voided or legacy
  | "claimed_elsewhere"  // another sync took the lease first
  | "read_failed";       // could not read or claim the row; a later sync tries again

const NO_RECIPIENT_NOTE = "Nobody is set to get the signing email for this case type or campaign.";

/**
 * Send the signing email for one agreement. Never throws: a failure is kept
 * on the row (notify_state/notify_error) and in the file's history, and the
 * signing itself is untouched. Callers may ignore the returned outcome.
 */
export async function notifySigned(admin: any, row: any, origin = "https://claimreach.com"): Promise<NotifyOutcome> {
  if (!row?.id) return "not_due";
  let claimedAt: string | null = null;
  let providerAccepted = false;

  // Write a non-success outcome, only while THIS sender still holds its
  // lease, so a slow sender can never overwrite a later sender's "sent".
  const settle = async (patch: Record<string, any>): Promise<void> => {
    if (!claimedAt) return;
    try {
      const { error } = await admin.from("esign_submissions").update(patch)
        .eq("id", row.id).eq("notify_state", "sending").eq("notify_claimed_at", claimedAt).select("id");
      if (error) console.error("signing email state did not save", row.id, error.message);
    } catch (e: any) {
      console.error("signing email state did not save", row.id, e?.message || e);
    }
  };

  try {
    // Claim: read the row fresh, decide with the one rule, then take the
    // lease only if the row is still exactly as read.
    const { data: cur, error: readErr } = await admin.from("esign_submissions")
      .select("*")
      .eq("id", row.id).maybeSingle();
    if (readErr) { console.error("signing email: could not read the agreement", row.id, readErr.message); return "read_failed"; }
    if (!signedNoticeDue(cur) || !["signed", "completed"].includes(cur?.status)) return "not_due";
    // Identity and content come from the fresh row too, never the stale poll
    // object that happened to trigger this retry.
    row = cur;

    const attempts = Number(cur.notify_attempts ?? 0) || 0;
    const stamp = new Date().toISOString();
    let claim = admin.from("esign_submissions")
      .update({ notify_state: "sending", notify_claimed_at: stamp, notify_attempts: attempts + 1 })
      .eq("id", row.id).eq("notify_attempts", attempts)
      .is("signed_notified_at", null).is("voided_at", null);
    claim = cur.notify_state == null ? claim.is("notify_state", null) : claim.eq("notify_state", cur.notify_state);
    claim = cur.notify_claimed_at == null ? claim.is("notify_claimed_at", null) : claim.eq("notify_claimed_at", cur.notify_claimed_at);
    const { data: claimed, error: claimErr } = await claim.select("id");
    if (claimErr) { console.error("signing email: could not claim the agreement", row.id, claimErr.message); return "read_failed"; }
    if (!claimed?.length) return "claimed_elsewhere";
    claimedAt = stamp;

    const context = await resolveSigningMatter(admin, row.lead_id, { claimId: row.claim_id, authoritativeDb: admin });
    if (!context.ok) {
      await settle({ notify_state: "failed", notify_error: context.error });
      return "failed";
    }
    const current = await getMatterAgreement(admin, context.lead, context.matter, row.id);
    if (!current.ok || !current.row || current.row.voided_at || current.row.status === "voided") {
      await settle({ notify_state: "failed", notify_error: current.ok ? "This agreement is no longer current." : current.error });
      return "failed";
    }
    const emergency = await getMatterEmergency(admin, context.lead, context.matter);
    if (!emergency.ok || emergencySupersedes(current.row, emergency.row)) {
      await settle({ notify_state: "failed", notify_error: emergency.ok ? "A newer emergency agreement requires DocuSeal re-sign." : emergency.error });
      return "failed";
    }
    const lead = { ...context.lead, campaign_id: context.campaignId,
      campaign: context.matter.claim.campaign, case_type: context.matter.claim.claim_type };
    const { data: routes, error: routeErr } = await admin.from("notify_routes")
      .select("event, case_type, campaign_id, to_emails, cc_emails, active").eq("event", "signed").eq("active", true);
    if (routeErr) {
      await settle({ notify_state: "failed", notify_error: `Could not read who gets the signing email: ${routeErr.message}` });
      return "failed";
    }
    const { to, cc } = signedRecipients(routes ?? [], lead);
    if (!to.length) {
      // Terminal and visible: no email went, and the row says why.
      await settle({ notify_state: "no_recipient", notify_error: NO_RECIPIENT_NOTE });
      await recordAudit({
        firm_id: lead.firm_id, lead_id: lead.id, actor_name: "ClaimReach", category: "retainer",
        description: `No signing email went out. ${NO_RECIPIENT_NOTE} Set it in Settings, When a client signs.`,
        meta: { submission_id: row.submission_id, notify_state: "no_recipient" },
      });
      return "no_recipient";
    }

    // Passenger envelopes name the originating parent call. Validate that
    // link, but summarize only the passenger's own call/claim answers.
    let answers: any = context.matter.claim.answers?.mva_call ?? {};
    const parentId = paxParentId(lead.external_id);
    let call: any = null;
    if (row.call_id) {
      const named = await admin.from("intake_calls").select("id, lead_id, firm_id, campaign_id, claim_id, answers").eq("id", row.call_id).maybeSingle();
      if (named.error || !named.data || (named.data.firm_id && named.data.firm_id !== lead.firm_id)) {
        await settle({ notify_state: "failed", notify_error: "Could not verify the agreement's call." }); return "failed";
      }
      if (named.data.lead_id === lead.id && rowBelongsToMatter(named.data, context.matter)) call = named.data;
      else if (!parentId || named.data.lead_id !== parentId || named.data.campaign_id !== context.campaignId) {
        await settle({ notify_state: "failed", notify_error: "The agreement's call belongs to another file or matter." }); return "failed";
      }
    }
    if (!call) {
      const latest = await admin.from("intake_calls").select("answers").eq("lead_id", lead.id)
        .or(matterRowsFilter(context.matter)).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest.error) { await settle({ notify_state: "failed", notify_error: `Could not read the case summary: ${latest.error.message}` }); return "failed"; }
      call = latest.data;
    }
    if (call?.answers && typeof call.answers === "object") answers = call.answers;

    const name = row.injured_name || row.signer_name || lead.claimant_name || "New client";
    const camp = caseName(lead.campaign, lead.case_type);
    const agr = AGREEMENT[row.template_key] ? `${AGREEMENT[row.template_key]} ` : "";
    const who = row.signer_name && row.injured_name && row.signer_name !== row.injured_name
      ? `${row.signer_name} signed for ${row.injured_name}` : `${name} signed`;
    // The whole case: summary, qualifiers, every question and answer, and the
    // signed agreement when DocuSeal already has it complete.
    const report = caseReport(lead, answers, row);
    const link = `${origin}/app/${leadKeyOf(lead)}?claim=${encodeURIComponent(context.matter.claim.id)}`;
    const pdf = row.status === "completed" && row.completed_pdf_path ? await signedPdfAttachment(admin, row.completed_pdf_path, `${name} agreement`) : { file: null };
    const attachments = pdf.file ? [pdf.file] : [];
    const html = caseReportHtml(report, { link, note: `${who} the ${agr}agreement${row.pax_index != null ? " as a passenger" : ""}.`, attached: attachments.length > 0 });
    const r = await sendEmail({
      to, cc, subject: `Signed: ${name}${camp ? `, ${camp}` : ""}`, html, text: caseReportText(report, link), attachments,
      idempotencyKey: signedNotifyKey(String(row.id)),
    });

    let recordError: string | null = null;
    if (r.ok) {
      providerAccepted = true;
      // It went. Record it on the row whoever holds the lease now: the send
      // is the fact. Keeps the first recorded time if another sender won.
      const { error } = await admin.from("esign_submissions")
        .update({ notify_state: "sent", signed_notified_at: new Date().toISOString(), notify_error: null })
        .eq("id", row.id).is("signed_notified_at", null).select("id");
      if (error) {
        // Never reported as recorded. The row stays "sending"; after the
        // lease runs out a later sync tries again with the same key.
        recordError = error.message;
        console.error("signing email sent but not recorded", row.id, error.message);
      }
    } else {
      await settle({ notify_state: "failed", notify_error: r.error || "The email did not send." });
    }
    await recordAudit({
      firm_id: lead.firm_id, lead_id: lead.id, actor_name: "ClaimReach", category: "retainer",
      description: r.ok
        ? `Emailed the signing to ${to.join(", ")}${cc.length ? `, cc ${cc.join(", ")}` : ""}.${recordError ? ` The app could not record that it went (${recordError}), so it may send again.` : ""}`
        : `The signing email did not send: ${r.error}`,
      meta: { submission_id: row.submission_id, to, cc, notify_state: r.ok ? (recordError ? "sending" : "sent") : "failed" },
    });
    return r.ok ? "sent" : "failed";
  } catch (e: any) {
    const msg = String(e?.message || e || "unknown error");
    console.error("signing email failed", row.id, msg);
    // The provider already took it: never mark that as failed. The lease
    // stays, and after it runs out a later sync retries with the same key.
    if (providerAccepted) return "sent";
    if (claimedAt) {
      await settle({ notify_state: "failed", notify_error: `The signing email hit an error: ${msg}` });
      return "failed";
    }
    return "read_failed";
  }
}
