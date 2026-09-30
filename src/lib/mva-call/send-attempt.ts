// Server-side only. Callers must first authorize the exact file and matter
// through their session. Never expose the stored send context to a browser.
import type { SendAttemptHold } from "./replacement";

export const SEND_HELD_MESSAGE = "An agreement send is still being verified. Do not send another link; ask the owner to reconcile this file.";
type Failure = { ok: false; status: number; error: string };
type Result<T> = { ok: true } & T | Failure;
const unavailable = (): Failure => ({ ok: false, status: 503, error: "Could not verify the agreement send reservation. Nothing new will be sent until this check is available." });

export function safeSendAttempt(data: any): SendAttemptHold | null {
  if (!data || typeof data.id !== "string" || !["reserved", "provider_pending", "uncertain"].includes(data.state) || typeof data.created_at !== "string") return null;
  return { id: data.id, state: data.state, created_at: data.created_at, needs_reconciliation: true,
    ...(typeof data.pax_key === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(data.pax_key) ? { pax_key: data.pax_key } : {}) };
}

function failure(error: any): Failure {
  if (["23505", "40001", "P0001", "55000"].includes(error?.code)) return { ok: false, status: 409, error: SEND_HELD_MESSAGE };
  if (error?.code === "42501") return { ok: false, status: 403, error: "This agreement send is not available for the selected file." };
  return unavailable();
}

async function rpc(admin: any, name: string, args: any): Promise<Result<{ data: any }>> {
  try {
    const { data, error } = await admin.rpc(name, args);
    return error ? failure(error) : { ok: true, data };
  } catch { return unavailable(); }
}

export async function readPendingSendAttempt(admin: any, claimId: string, paxKey: string | null = null): Promise<Result<{ attempt: SendAttemptHold | null }>> {
  const result = await rpc(admin, "cr_pending_esign_send", { p_claim_id: claimId, p_pax_key: paxKey });
  if (!result.ok) return result;
  if (result.data == null) return { ok: true, attempt: null };
  const attempt = safeSendAttempt(result.data);
  return attempt ? { ok: true, attempt } : unavailable();
}

export async function reserveSendAttempt(admin: any, input: { claimId: string; actorId: string; paxKey: string | null; paxIndex: number | null }): Promise<Result<{ attempt: SendAttemptHold }>> {
  const result = await rpc(admin, "cr_reserve_esign_send", { p_parent_claim_id: input.claimId, p_actor_id: input.actorId, p_pax_key: input.paxKey, p_pax_index: input.paxIndex });
  if (!result.ok) return result;
  const attempt = safeSendAttempt(result.data);
  return attempt && result.data.acquired === true ? { ok: true, attempt } : unavailable();
}

export async function bindSendAttempt(admin: any, attemptId: string, input: {
  leadId: string; claimId: string; expectedId: string | null; expectedStatus: string | null;
  templateKey: string; templateId: string; via: string; sendContext: Record<string, unknown>; emergencyDocumentId?: string | null;
}): Promise<Result<{ data: any }>> {
  const result = await rpc(admin, "cr_bind_esign_send", { p_attempt_id: attemptId, p_target_lead_id: input.leadId, p_target_claim_id: input.claimId,
    p_expected_submission_id: input.expectedId, p_expected_status: input.expectedStatus, p_template_key: input.templateKey,
    p_template_id: input.templateId, p_via: input.via, p_send_context: input.sendContext, p_emergency_document_id: input.emergencyDocumentId ?? null });
  if (!result.ok) return result;
  return result.data?.id === attemptId && result.data.state === "reserved" && result.data.target_claim_id === input.claimId ? result : unavailable();
}

export async function markSendPending(admin: any, attemptId: string) {
  const result = await rpc(admin, "cr_mark_esign_send_pending", { p_attempt_id: attemptId });
  if (!result.ok) return result;
  return result.data?.id === attemptId && result.data.state === "provider_pending" ? result : unavailable();
}
export async function holdSendAttempt(admin: any, attemptId: string, code: string) {
  return rpc(admin, "cr_hold_esign_send", { p_attempt_id: attemptId, p_error_code: code });
}
export async function rejectSendAttempt(admin: any, attemptId: string, providerRejected = false) {
  const result = await rpc(admin, "cr_reject_esign_send", { p_attempt_id: attemptId,
    p_error_code: providerRejected ? "definitive_provider_rejection" : "pre_provider_abort", p_provider_rejected: providerRejected });
  if (!result.ok) return result;
  return result.data?.id === attemptId && result.data.state === "rejected" ? result : unavailable();
}
export async function finalizeSendAttempt(admin: any, attemptId: string, submission: Record<string, unknown>, ownerId?: string): Promise<Result<{ id: string }>> {
  const result = await rpc(admin, "cr_finalize_esign_send", { p_attempt_id: attemptId, p_submission: submission, ...(ownerId ? { p_reconciled_by: ownerId } : {}) });
  if (!result.ok) return result;
  return typeof result.data?.id === "string" ? { ok: true, id: result.data.id } : unavailable();
}
