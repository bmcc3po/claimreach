import { resolveMatter, matterRowsFilter, rowBelongsToMatter, type MatterResult } from "@/lib/matter";
import { paxParentId } from "@/lib/linked-files";
import { LEAD_CALL_COLS } from "./server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { CALLER_FIRST, clientSignatureConfirmed } from './passenger-signing';

export type SigningMatter = Extract<MatterResult, { ok: true }>;
type Failure = { ok: false; status: number; error: string; ambiguous?: boolean };
export type SigningContext = { ok: true; lead: any; matter: SigningMatter; campaignId: string | null };

/** Resolve through the caller's RLS session before any provider or admin write.
 * A passenger's originating call is on the parent; its own signing actions
 * resolve its own lead/claim and do not require that old call to stay open. */
export async function resolveSigningMatter(db: any, leadId: string, opts: {
  claimId?: string | null; callId?: string | null; allowArchived?: boolean; authoritativeDb?: any;
} = {}): Promise<SigningContext | Failure> {
  if (!leadId) return { ok: false, status: 400, error: "Name the file first." };
  const { data: lead, error } = await db.from("leads").select(LEAD_CALL_COLS).eq("id", leadId).maybeSingle();
  if (error) return { ok: false, status: 500, error: `Could not read the file: ${error.message}` };
  if (!lead) return { ok: false, status: 404, error: "Lead not found." };
  if (lead.archived_at && !opts.allowArchived) return { ok: false, status: 409, error: "This file is archived. Restore it before working its agreement." };
  let call: any = null;
  if (opts.callId) {
    const result = await db.from("intake_calls").select("id, lead_id, claim_id, campaign_id, firm_id").eq("id", opts.callId).maybeSingle();
    if (result.error) return { ok: false, status: 500, error: `Could not read the call: ${result.error.message}` };
    call = result.data;
    if (!call || call.lead_id !== lead.id || (call.firm_id && call.firm_id !== lead.firm_id)) {
      return { ok: false, status: 409, error: "This call does not belong to the selected file. Refresh and try again." };
    }
  }
  const matter = await resolveMatter(db, leadId, {
    claimId: opts.claimId || call?.claim_id,
    campaignId: call?.campaign_id ?? lead.campaign_id ?? null,
    // Only count through the service role after the session has proved it can
    // read this lead. The trusted count never selects a hidden claim for it.
    authoritativeDb: opts.authoritativeDb ?? supabaseAdmin(),
  });
  if (!matter.ok) return matter;
  if (matter.claim.firm_id && matter.claim.firm_id !== lead.firm_id) {
    return { ok: false, status: 409, error: "This matter and file belong to different firms. Correct their association first." };
  }
  if (opts.callId) {
    if (!rowBelongsToMatter(call, matter)) {
      return { ok: false, status: 409, error: "This call does not belong to the selected matter. Refresh the file and try again." };
    }
  }
  return { ok: true, lead, matter, campaignId: matter.claim.campaign_id ?? (matter.sole ? lead.campaign_id ?? null : null) };
}

/** The current envelope, including a voided newest row so an old agreement
 * cannot silently become current again. Callers decide which actions its
 * status permits. History actions may name an exact row, still bound to the
 * same lead/firm/matter. Passenger envelopes are primary on their own file. */
export async function getMatterAgreement(db: any, lead: any, matter: SigningMatter, agreementId?: string | null, opts: { allowHistorical?: boolean } = {}): Promise<
  { ok: true; row: any | null } | Failure
> {
  let q = db.from("esign_submissions").select("*").eq("lead_id", lead.id).or(matterRowsFilter(matter));
  if (!paxParentId(lead.external_id)) q = q.is("pax_index", null);
  if (agreementId && opts.allowHistorical) q = q.eq("id", agreementId);
  const { data: row, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return { ok: false, status: 500, error: `Could not read the agreement: ${error.message}` };
  if (agreementId && (!row || row.id !== agreementId)) return { ok: false, status: 409, error: "That is not this matter's current agreement. Refresh and pick the agreement again." };
  if (row && (!rowBelongsToMatter(row, matter) || (row.firm_id && row.firm_id !== lead.firm_id))) {
    return { ok: false, status: 409, error: "The agreement's file association needs to be corrected before continuing." };
  }
  return { ok: true, row };
}

export function agreementIsVoided(row: any): boolean {
  return row?.status === "voided" || !!row?.voided_at;
}

/** Emergency agreements are provisional and never masquerade as DocuSeal.
 * One selector defines which emergency can supersede primary evidence. */
export async function getMatterEmergency(db: any, lead: any, matter: SigningMatter): Promise<{ ok: true; row: any | null } | Failure> {
  const { data, error } = await db.from("signable_documents").select("*").eq("lead_id", lead.id)
    .eq("audit->emergency->>claim_id", matter.claim.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return { ok: false, status: 503, error: "Could not read this matter's emergency agreement." };
  if (data && data.firm_id !== lead.firm_id) return { ok: false, status: 409, error: "The emergency agreement belongs to another firm." };
  return { ok: true, row: data };
}

export function emergencySupersedes(primary: any, emergency: any): boolean {
  if (!emergency || ["cancelled", "declined"].includes(emergency.status)) return false;
  return !primary || Date.parse(emergency.created_at) > Date.parse(primary.created_at);
}

/** Check current, matter-scoped evidence before a passenger file or send is created. */
export async function requireCallerSignatureForPassenger(db: any, context: SigningContext): Promise<{ ok: true } | Failure> {
  const agreement = await getMatterAgreement(db, context.lead, context.matter);
  if (!agreement.ok) return agreement;
  const row = agreement.row;
  if (!row || agreementIsVoided(row) || !row.signed_at || !clientSignatureConfirmed(row.status)) {
    return { ok: false, status: 409, error: CALLER_FIRST };
  }
  const emergency = await getMatterEmergency(db, context.lead, context.matter);
  if (!emergency.ok) return emergency;
  if (emergencySupersedes(row, emergency.row)) return { ok: false, status: 409, error: CALLER_FIRST };
  return { ok: true };
}
