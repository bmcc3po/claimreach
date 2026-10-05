/** Human confirmation is separate from a provider signature or mail receipt.
 * Missing historical dates must never become today's signing/delivery date. */
export const OWNER_SENT_UNKNOWN_DATE = "owner confirmed sent; original delivery date unknown";
export const OWNER_FILE_CONFIRMATION = "owner_signed_delivery_confirmation";
export const ownerConfirmedDelivery = (result: unknown) => result === OWNER_SENT_UNKNOWN_DATE;
export function ownerSignatureConfirmation(activity: any[], firmId: string, leadId: string, claimId: string, ownerIds: string[]) {
  return activity.some(a => a.firm_id === firmId && a.lead_id === leadId && a.meta?.claim_id === claimId &&
    a.meta?.event === OWNER_FILE_CONFIRMATION && a.meta?.signature_confirmed === true &&
    a.meta?.confirmation_source === "direct_owner_instruction" && ownerIds.includes(a.actor));
}
