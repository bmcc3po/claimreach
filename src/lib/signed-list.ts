import { isSignedKey, type SignedCatalogRow } from "./statuses";

// A delivered, no-signature campaign is not a signed client. Status alone is
// insufficient: it also describes a firm handoff without a retainer.
export function isSignedClient(lead: any, catalog: SignedCatalogRow[] | null, signedSubmissionIds: Set<string>): boolean {
  const status = lead.claims?.[0]?.status ?? lead.status;
  return isSignedKey(status, catalog) && (!!lead.signed_at || signedSubmissionIds.has(lead.id));
}

export async function signedSubmissionIdsForLeads(sb: any, leadIds: string[]): Promise<Set<string>> {
  if (!leadIds.length) return new Set();
  const { data, error } = await sb.from("esign_submissions")
    .select("lead_id,signed_at,voided_at").in("lead_id", leadIds).not("signed_at", "is", null);
  if (error) return new Set();
  return new Set((data ?? []).filter((row: any) => row.signed_at && !row.voided_at).map((row: any) => row.lead_id));
}

