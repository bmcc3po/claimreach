// ============================================================================
// LawRuler status -> ClaimReach status, for files still worked in LawRuler
// (Motel 6 secondaries). One table, set by Brett 2026-09-26:
//
//   Secondary OK Sent To Firm      -> Delivered to Firm   (billable)
//   Secondary Intake OK COMPLETE   -> Approved            (billable)
//   Secondary DQ Sent to Firm      -> DQ Billable
//
// Anything else LawRuler sends is kept in the file's history and changes
// nothing. The write goes through setClaimStatusForLeads, the one status setter.
// ============================================================================

export interface LrMapped { status: string; dqReasonKey?: string; dqNote?: string; }

const norm = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const MAP: Record<string, LrMapped> = {
  "secondary ok sent to firm": { status: "delivered" },
  "secondary intake ok sent to firm": { status: "delivered" },
  "secondary intake ok complete": { status: "approved" },
  "secondary ok complete": { status: "approved" },
  "secondary dq sent to firm": { status: "dq_billable", dqReasonKey: "other", dqNote: "DQ at the secondary interview (LawRuler)." },
  "secondary intake dq sent to firm": { status: "dq_billable", dqReasonKey: "other", dqNote: "DQ at the secondary interview (LawRuler)." },
};

export function mapLawRulerStatus(raw: string | null | undefined): LrMapped | null {
  return MAP[norm(raw)] ?? null;
}

/**
 * Whether to apply it. LawRuler is the source of truth while the file lives
 * there, with one exception: a file already delivered to the firm is not
 * pulled back to Approved by a late or repeated "complete".
 */
export function shouldApplyLr(current: string | null | undefined, next: LrMapped): boolean {
  if (!next) return false;
  if (current === next.status) return false;
  if (current === "delivered" && next.status === "approved") return false;
  return true;
}
