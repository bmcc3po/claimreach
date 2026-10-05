// ============================================================================
// Which matter (claim) an action belongs to. ONE definition, used by the call
// console, autosave, disposition, signing, QA and firm delivery, so nothing
// guesses a sibling (Astra rounds 4-6).
//
// The rule, in order:
//   1. An explicitly named claim must exist AND belong to the lead. Otherwise
//      the action stops with an error.
//   2. A lead with exactly ONE claim: that claim (the ordinary single-matter
//      file, including legacy files whose claim predates campaign ids).
//   3. Several claims: the single claim on the preferred campaign. Zero
//      matches or two matches (two accidents on one campaign) is AMBIGUOUS
//      and stops — the caller must name the claim.
//   4. A failed lookup is an error, never "no scope" (an empty scope used to
//      widen into a lead-wide write).
// Explicitly lead-wide operations (bulk status, archive) are separate
// commands and never call this.
// ============================================================================

export interface MatterClaim {
  id: string;
  lead_id: string;
  firm_id: string | null;
  campaign_id: string | null;
  campaign: string | null;
  claim_type: string | null;
  status: string | null;
  firm_send_result?: string | null;
  answers: any;
  created_at: string | null;
}

export type MatterResult =
  | {
      ok: true; claim: MatterClaim; via: "named" | "only" | "campaign";
      /** The lead has exactly ONE claim, however this one was selected
       *  (Astra round 7b G4: "named" is not "one of several"). */
      sole: boolean;
    }
  | { ok: false; status: number; error: string; ambiguous?: boolean; candidates?: { id: string; campaign: string | null; claim_type: string | null; status: string | null }[] };

const COLS = "id, lead_id, firm_id, campaign_id, campaign, claim_type, status, answers, created_at, firm_send_result";

export async function resolveMatter(
  db: any,
  leadId: string,
  opts: { claimId?: string | null; campaignId?: string | null; authoritativeDb?: any } = {},
): Promise<MatterResult> {
  if (!leadId) return { ok: false, status: 400, error: "No file named." };
  // A caller's RLS session chooses which claim may be seen. A trusted DB is
  // used only for cardinality: a hidden sibling must never make the visible
  // claim look like the file's sole matter and inherit claim-null evidence.
  // Do not return rows or identifiers from this unrestricted count.
  const countAll = async (campaignId?: string | null): Promise<number | null> => {
    let q = (opts.authoritativeDb ?? db).from("claims").select("id", { count: "exact", head: true }).eq("lead_id", leadId);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    const { count, error } = await q;
    return error || typeof count !== "number" ? null : count;
  };
  if (opts.claimId) {
    const { data, error } = await db.from("claims").select(COLS).eq("id", opts.claimId).maybeSingle();
    if (error) return { ok: false, status: 500, error: `Could not read the claim: ${error.message}` };
    if (!data) return { ok: false, status: 404, error: "That claim no longer exists. Refresh the file and try again." };
    if (data.lead_id !== leadId) return { ok: false, status: 400, error: "That claim does not belong to this file. Refresh and try again." };
    const count = await countAll();
    if (count === null || count < 1) return { ok: false, status: 500, error: "Could not verify this file's matter count. Refresh before working its documents." };
    return { ok: true, claim: data as MatterClaim, via: "named", sole: count === 1 };
  }
  const { data, error } = await db.from("claims").select(COLS).eq("lead_id", leadId).order("created_at", { ascending: true });
  if (error) return { ok: false, status: 500, error: `Could not read this file's claims: ${error.message}` };
  const all = (data ?? []) as MatterClaim[];
  const count = await countAll();
  if (count === null || count < all.length) return { ok: false, status: 500, error: "Could not verify this file's matter count. Refresh before working its documents." };
  if (!all.length) {
    // The call page may create a first claim only when the file truly has
    // none. Hidden claims are not permission to create a duplicate matter.
    if (count > 0) return { ok: false, status: 409, ambiguous: true, error: "This file's existing matter is not available in your current access. Ask the owner to review its campaign before continuing." };
    return { ok: false, status: 409, error: "This file has no claim yet. Open the file and add its claim first." };
  }
  if (all.length === 1 && count === 1) return { ok: true, claim: all[0], via: "only", sole: true };
  const hit = opts.campaignId ? all.filter((c) => c.campaign_id === opts.campaignId) : [];
  const campaignCount = hit.length === 1 && opts.campaignId ? await countAll(opts.campaignId) : null;
  if (hit.length === 1 && campaignCount === 1) return { ok: true, claim: hit[0], via: "campaign", sole: false };
  if (hit.length === 1 && campaignCount === null) return { ok: false, status: 500, error: "Could not verify this campaign's matter count. Refresh before working its documents." };
  return {
    ok: false, status: 409, ambiguous: true,
    error: hit.length > 1 || (campaignCount !== null && campaignCount > 1)
      ? "This file has more than one matter on the same campaign. Pick which one this is for."
      : "This file has more than one matter and none matches this campaign. Pick which one this is for.",
    candidates: all.map((c) => ({ id: c.id, campaign: c.campaign, claim_type: c.claim_type, status: c.status })),
  };
}

/**
 * The rows (agreements, calls) that belong to this matter, as a PostgREST
 * `or` filter. A row stamped with the claim always counts. A legacy row with
 * no claim stamped counts ONLY when the lead has exactly one claim and the
 * row's campaign is unknown or the claim's own, so a null is never a
 * wildcard on a file with several matters (Astra round 7b: poll, complete,
 * void and resend picked a sibling's unbound agreement; disposition refused
 * a sole matter's own legacy signature).
 */
export function matterRowsFilter(m: { claim: { id: string; campaign_id: string | null }; sole: boolean }): string {
  const id = String(m.claim.id).replace(/[^0-9a-f-]/gi, "");
  if (!m.sole) return `claim_id.eq.${id}`;
  const camp = String(m.claim.campaign_id || "").replace(/[^0-9a-f-]/gi, "");
  if (!camp) return `claim_id.eq.${id},claim_id.is.null`;
  return `claim_id.eq.${id},and(claim_id.is.null,or(campaign_id.is.null,campaign_id.eq.${camp}))`;
}

/** The same rule for a row already in hand. */
export function rowBelongsToMatter(row: { claim_id?: string | null; campaign_id?: string | null }, m: { claim: { id: string; campaign_id: string | null }; sole: boolean }): boolean {
  if (row.claim_id) return row.claim_id === m.claim.id;
  if (!m.sole) return false;
  return !row.campaign_id || !m.claim.campaign_id || row.campaign_id === m.claim.campaign_id;
}
