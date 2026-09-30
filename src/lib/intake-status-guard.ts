import { isSignedKey, type StatusDef } from "@/lib/statuses";

// Read only after the caller has authorized the exact lead and matter.
// soleClaim must come from an authoritative count, never an RLS-filtered list.
export async function signedAgreementStopReason(admin: any, target: any): Promise<string | null> {
  const { lead, claim, soleClaim, statusDefinition } = target;
  if (isSignedKey(claim.status, statusDefinition ? [statusDefinition] : [])) return "file signed";
  if (claim.status === "external_signed_review") return "imported signing needs verification";
  const { data, error } = await admin.from("esign_submissions").select("id,claim_id,campaign_id,signed_at,status").eq("lead_id", lead.id);
  if (error || !Array.isArray(data)) throw new Error("Could not check whether the client signed.");
  if (!soleClaim && data.some((row: any) => !row.claim_id && (!row.campaign_id || row.campaign_id === claim.campaign_id) &&
    (row.signed_at || row.status === "signed" || row.status === "completed")))
    throw new Error("An older signature is not attached to an exact matter; review before continuing automation.");
  if (data.some((row: any) => (row.claim_id === claim.id || (!row.claim_id && soleClaim && (!row.campaign_id || row.campaign_id === claim.campaign_id))) &&
    (row.signed_at || row.status === "signed" || row.status === "completed"))) return "file signed";
  const { data: emergencies, error: emergencyError } = await admin.from("signable_documents")
    .select("id,status,signed_at,audit").eq("lead_id", lead.id);
  if (emergencyError || !Array.isArray(emergencies)) throw new Error("Could not check signed emergency agreement evidence.");
  for (const row of emergencies) {
    if (!row.signed_at && row.status !== "signed") continue;
    const claimId = row.audit?.emergency?.claim_id;
    if (claimId === claim.id || (!claimId && soleClaim)) return "file carries a signed agreement";
    if (!claimId) throw new Error("An older signed agreement is not attached to an exact matter; review before continuing automation.");
  }
  return null;
}

/** Generic intake actions must never erase evidence-driven progress. Ordinary
 * unsigned terminal outcomes may still be corrected through the manual UI. */
export async function intakeStatusTransitionBlock(db: any, target: any, catalog: StatusDef[]): Promise<string | null> {
  const currentStatus = catalog.find(item => item.key === target.claim.status);
  if (!currentStatus) throw new Error("Could not verify this matter's current status.");
  if (isSignedKey(target.claim.status, catalog) || ["in_qa", "post_qa"].includes(currentStatus.phase) || currentStatus.unlocks_firm || currentStatus.billable)
    return "This matter has reached a signed, QA, or firm milestone. Use its review or correction workflow to change it.";
  const signed = await signedAgreementStopReason(db, { ...target, statusDefinition: currentStatus });
  return signed ? "This matter carries signed agreement evidence. Use its review or correction workflow to change it." : null;
}
