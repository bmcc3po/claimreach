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
  answers: any;
  created_at: string | null;
}

export type MatterResult =
  | { ok: true; claim: MatterClaim; via: "named" | "only" | "campaign" }
  | { ok: false; status: number; error: string; ambiguous?: boolean; candidates?: { id: string; campaign: string | null; claim_type: string | null; status: string | null }[] };

const COLS = "id, lead_id, firm_id, campaign_id, campaign, claim_type, status, answers, created_at";

export async function resolveMatter(
  db: any,
  leadId: string,
  opts: { claimId?: string | null; campaignId?: string | null } = {},
): Promise<MatterResult> {
  if (!leadId) return { ok: false, status: 400, error: "No file named." };
  if (opts.claimId) {
    const { data, error } = await db.from("claims").select(COLS).eq("id", opts.claimId).maybeSingle();
    if (error) return { ok: false, status: 500, error: `Could not read the claim: ${error.message}` };
    if (!data) return { ok: false, status: 404, error: "That claim no longer exists. Refresh the file and try again." };
    if (data.lead_id !== leadId) return { ok: false, status: 400, error: "That claim does not belong to this file. Refresh and try again." };
    return { ok: true, claim: data as MatterClaim, via: "named" };
  }
  const { data, error } = await db.from("claims").select(COLS).eq("lead_id", leadId).order("created_at", { ascending: true });
  if (error) return { ok: false, status: 500, error: `Could not read this file's claims: ${error.message}` };
  const all = (data ?? []) as MatterClaim[];
  if (!all.length) return { ok: false, status: 409, error: "This file has no claim yet. Open the file and add its claim first." };
  if (all.length === 1) return { ok: true, claim: all[0], via: "only" };
  const hit = opts.campaignId ? all.filter((c) => c.campaign_id === opts.campaignId) : [];
  if (hit.length === 1) return { ok: true, claim: hit[0], via: "campaign" };
  return {
    ok: false, status: 409, ambiguous: true,
    error: hit.length > 1
      ? "This file has more than one matter on the same campaign. Pick which one this is for."
      : "This file has more than one matter and none matches this campaign. Pick which one this is for.",
    candidates: all.map((c) => ({ id: c.id, campaign: c.campaign, claim_type: c.claim_type, status: c.status })),
  };
}
