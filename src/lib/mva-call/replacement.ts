export const SEND_HELD_MESSAGE = "An agreement send is still being verified. Do not send another link; ask the owner to reconcile this file.";
/** A correction never destroys signed evidence. A client-signed original with
 * a pending replacement stays on a supervisor-review hold until the owner or
 * admin resolves the original; only the newest active packet can be released. */
export function signingReleaseGate(rows: any[]): string | null {
  const ordered = [...rows].sort((a, b) => {
    const delta = (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0);
    return delta || String(b.id || "").localeCompare(String(a.id || ""));
  });
  const unresolved = ordered.find((r) => r.replacement_requested_at && !r.voided_at && r.status !== "voided");
  if (unresolved) return "A client-signed original is awaiting supervisor review after a correction. An owner or admin must resolve it before QA approval or firm delivery.";
  // The newest row, even after it is voided, supersedes prior evidence. An
  // earlier completed packet must never spring back into force after a failed
  // correction or owner void.
  const newest = ordered[0];
  if (newest?.replacement_of && (newest.voided_at || newest.status === "voided")) return "The corrected agreement was voided. Send and complete a new agreement; the older packet cannot be used for QA or firm delivery.";
  const current = ordered.find((r) => !r.voided_at && r.status !== "voided");
  if (!current) return null;
  if (current.replacement_of && current.status !== "completed") return "The corrected agreement is still awaiting signatures and a complete packet. The older agreement cannot stand in for it.";
  if (["signed", "completed"].includes(current.status) && !current.agent_reviewed_at) return "An agent must review the client-signed agreement preview before office completion, QA approval or firm delivery.";
  return null;
}

/** Only an authenticated owner or admin may operate a direct void/cancel. */
export function canDirectVoid(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** These states contain no completed client signature. A verified provider
 * expiry may advance the local row to a terminal state before our CAS runs. */
export const UNSIGNED_AGREEMENT_STATUSES = ["sent", "opened", "sending", "failed", "declined", "expired"];

/** A dead link opens contract selection; it is never a pending send. */
export function agreementSendStatus(status: string | null | undefined): string {
  return !status || ["voided", "expired", "declined", "failed"].includes(status) ? "ready" : status;
}
export type SendAttemptHold = {
  id: string;
  state: "reserved" | "provider_pending" | "uncertain";
  created_at: string;
  needs_reconciliation: true;
  pax_key?: string;
};
