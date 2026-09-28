// One list of the TMP MVA agreement names, by packet key. The preview stamp,
// the file, exports and webhooks all read it (Astra round 6: the preview
// said "undefined agreement" for the two Nevada packets).
export const AGREEMENT_NAMES: Record<string, string> = {
  TX: "Texas",
  FL: "Florida",
  OTHER: "Alabama/Georgia (every other state)",
  NV: "Nevada tiered",
  NV_FLAT: "Nevada non-tiered",
};
export const agreementName = (key: string | null | undefined): string => (key ? AGREEMENT_NAMES[key] || key : "");
