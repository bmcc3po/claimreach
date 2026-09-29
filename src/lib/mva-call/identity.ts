// SERVER ONLY. Raw identity values are used only for Vault writes and verified
// agreement rendering/completion; never include them in API responses or logs.
export type IdentityMode = "full" | "last4";
export type IdentityScope = { leadId: string; claimId: string; firmId: string };
export type IdentityMetadata = { saved: boolean; mode: IdentityMode | null; version: number; saved_at: string | null };
export type SavedIdentity = { ssn: string; mode: IdentityMode; version: number };
export type IdentityResult<T> = { ok: true; identity: T } | { ok: false; status: number; error: string };

const UNAVAILABLE = { ok: false as const, status: 503, error: "Secure identity storage is unavailable. Your entry has not been confirmed saved." };
const scopeArgs = (scope: IdentityScope) => ({ p_lead_id: scope.leadId, p_claim_id: scope.claimId, p_firm_id: scope.firmId });

export function normalizeIdentityValue(value: unknown, mode: unknown): string | null {
  if ((mode !== "full" && mode !== "last4") || typeof value !== "string" || !/^[\d -]+$/.test(value)) return null;
  const digits = value.replace(/[ -]/g, "");
  return digits.length === (mode === "full" ? 9 : 4) ? digits : null;
}

function metadata(data: any): IdentityMetadata | null {
  if (data?.saved === false && data.version === 0) return { saved: false, mode: null, version: 0, saved_at: null };
  if (data?.saved !== true || !["full", "last4"].includes(data.mode) || !Number.isSafeInteger(data.version) || data.version < 1 || typeof data.saved_at !== "string") return null;
  // Deliberately pick only these fields even if an RPC accidentally adds data.
  return { saved: true, mode: data.mode, version: data.version, saved_at: data.saved_at };
}

function rpcFailure(error: any): IdentityResult<never> {
  if (error?.code === "40001") return { ok: false, status: 409, error: "Saved identity changed. Refresh its saved status before trying again. A saved full SSN cannot be replaced with only four digits." };
  if (error?.code === "42501") return { ok: false, status: 403, error: "Identity is not available for this file and matter." };
  if (error?.code === "22023") return { ok: false, status: 400, error: "Enter all nine SSN digits or the last four digits in the selected mode." };
  return UNAVAILABLE;
}

export async function getIdentityMetadata(admin: any, scope: IdentityScope): Promise<IdentityResult<IdentityMetadata>> {
  try {
    const { data, error } = await admin.rpc("cr_identity_metadata", scopeArgs(scope));
    if (error) return rpcFailure(error);
    const identity = metadata(data);
    return identity ? { ok: true, identity } : UNAVAILABLE;
  } catch { return UNAVAILABLE; }
}

export async function saveIdentity(admin: any, scope: IdentityScope, input: {
  ssn: unknown; mode: unknown; expectedVersion: unknown; actorId: string;
}): Promise<IdentityResult<IdentityMetadata>> {
  const digits = normalizeIdentityValue(input.ssn, input.mode);
  if (!digits || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0) return { ok: false, status: 400, error: "Enter the selected SSN digits and refresh the saved identity status before saving." };
  try {
    const { data, error } = await admin.rpc("cr_save_identity", {
      ...scopeArgs(scope), p_ssn: digits, p_mode: input.mode,
      p_expected_version: input.expectedVersion, p_actor_id: input.actorId,
    });
    if (error) return rpcFailure(error);
    const identity = metadata(data);
    return identity?.saved ? { ok: true, identity } : UNAVAILABLE;
  } catch { return UNAVAILABLE; }
}

/** Caller must first resolve this same scope through the user's RLS session.
 * Do not pass the return value to a browser, activity history, or general answers. */
export async function readIdentityForSigning(admin: any, scope: IdentityScope): Promise<IdentityResult<SavedIdentity | null>> {
  try {
    const { data, error } = await admin.rpc("cr_read_identity_for_signing", scopeArgs(scope));
    if (error) return rpcFailure(error);
    if (data === null) return { ok: true, identity: null };
    const digits = normalizeIdentityValue(data?.ssn, data?.mode);
    if (!digits || !Number.isSafeInteger(data?.version) || data.version < 1) return UNAVAILABLE;
    return { ok: true, identity: { ssn: digits, mode: data.mode, version: data.version } };
  } catch { return UNAVAILABLE; }
}
