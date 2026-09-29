import { agreementName } from "./agreement-names";
import { stateCodeOf } from "./state";

export type MvaAgreementKey = "TX" | "FL" | "NV" | "NV_FLAT" | "OTHER";

/** The crash state determines the permitted contract family, never residence. */
export function agreementKey(stateCode: string | null | undefined): Exclude<MvaAgreementKey, "NV_FLAT"> | null {
  const code = String(stateCode || "").toUpperCase();
  if (!code) return null;
  return code === "TX" || code === "FL" || code === "NV" ? code : "OTHER";
}

/** Shared by the engine, draft preview and send. A missing campaign template
 * stays unavailable; choosing another state's contract is never a fallback. */
export function agreementChoice(city: string | null | undefined, variant: unknown, configuredKeys: readonly string[]) {
  const state = stateCodeOf(city);
  const base = agreementKey(state);
  const variantError = variant != null && variant !== "" && variant !== "tiered" && variant !== "flat"
    ? "Choose a supported agreement contract."
    : variant === "flat" && base && base !== "NV" ? "The non-tiered Nevada agreement is only available for a Nevada wreck." : "";
  const key: MvaAgreementKey | null = base === "NV" && variant === "flat" ? "NV_FLAT" : base;
  const allowed: MvaAgreementKey[] = base === "NV" ? ["NV", "NV_FLAT"] : base ? [base] : [];
  const options = allowed.map((value) => ({ key: value, label: value === "NV" ? "Tiered (standard)" : value === "NV_FLAT" ? "Non-tiered (needs approval)" : agreementName(value), available: configuredKeys.includes(value) }));
  const available = !variantError && !!key && configuredKeys.includes(key);
  return { state, key, label: agreementName(key), options, available, requiresReason: key === "NV_FLAT",
    variantError, error: variantError || (!key ? "Add the city and state where the wreck happened." : !available ? `${agreementName(key)} is not set up for this campaign. Ask an admin to configure it.` : "") };
}
