// A durable per-matter send boundary. Database functions are service-role only.
// Never reclaim a send just because a timer elapsed: after a provider timeout,
// the email may already exist. An owner/admin reconciles that attempt first.
export type DispatchState = "sending" | "sent" | "failed" | "uncertain";
export interface DispatchRecord {
  claim_id: string; lead_id: string; attempt_key: string; state: DispatchState;
  started_at: string; finished_at: string | null; error: string | null;
  reconciled_at?: string | null; reconciliation_note?: string | null;
}
export type BeginDispatch =
  | { ok: true; attemptKey: string }
  | { ok: false; skipped?: string; error: string; recoveryRequired?: boolean; attemptKey?: string };

export async function beginFirmDispatch(db: any, leadId: string, claimId: string, firmId: string | null, campaignId: string, force: boolean): Promise<BeginDispatch> {
  try {
    const { data, error } = await db.rpc("begin_firm_delivery", { p_lead_id: leadId, p_claim_id: claimId, p_firm_id: firmId, p_campaign_id: campaignId, p_force: force });
    if (error) return { ok: false, error: `Could not reserve this matter's delivery (${error.message}). Nothing was emailed.` };
    if (data?.state === "acquired" && data.attempt_key) return { ok: true, attemptKey: String(data.attempt_key) };
    if (data?.state === "sent") return { ok: false, skipped: "This matter was already sent to the firm.", error: "This matter was already sent to the firm." };
    if (data?.state === "blocked") return {
      ok: false, recoveryRequired: true, attemptKey: data.attempt_key,
      error: "A delivery is already running or its outcome is uncertain. No new email was sent. Check the provider and delivery history; an owner or admin must reconcile that attempt before another send.",
    };
    return { ok: false, error: "Could not reserve this matter's delivery. Nothing was emailed." };
  } catch (e: any) { return { ok: false, error: `Could not reserve this matter's delivery (${e?.message || "request failed"}). Nothing was emailed.` }; }
}

export async function finishFirmDispatch(db: any, claimId: string, attemptKey: string, state: Exclude<DispatchState, "sending">, error: string | null): Promise<string | null> {
  try {
    const r = await db.rpc("finish_firm_delivery", { p_claim_id: claimId, p_attempt_key: attemptKey, p_state: state, p_error: error });
    if (r.error) return r.error.message;
    return r.data === true ? null : "the delivery reservation was not updated";
  } catch (e: any) { return String(e?.message || e); }
}

export async function readFirmDispatch(db: any, leadId: string, claimId: string): Promise<{ row: DispatchRecord | null; error: string | null }> {
  const { data, error } = await db.from("firm_delivery_dispatch").select("claim_id, lead_id, attempt_key, state, started_at, finished_at, error, reconciled_at, reconciliation_note")
    .eq("lead_id", leadId).eq("claim_id", claimId).maybeSingle();
  return { row: data ?? null, error: error?.message ?? null };
}
