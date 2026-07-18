// ============================================================================
// Per-firm console config. One engine, many tenants. Adding a firm is an entry
// here (plus optional DB overrides in firms.intake_config), never new code.
// ============================================================================
import type { CaseTypeKey, Disposition } from "./engine";

export interface FirmConsoleConfig {
  slug: string;
  firmName: string;              // spoken on the greeting, must be exact
  greeting: string;              // [agent] is substituted at render
  recordingDisclosure: string;   // mandatory, statement not a question
  caseTypes: CaseTypeKey[];      // which pickers this firm screens
  autoBillsThreshold: number;    // auto retainer line, NEVER read aloud
  gpiBillsThreshold: number;     // general PI line, NEVER read aloud
  referTurnaround: string | null; // the [X] in "you will hear back within X"
  network: string;               // referral network name shown to the agent only
  // Non-new-potential call routing. Firms answer their phones differently, so
  // this is config rather than a hardcoded switch.
  callTypeRouting: Record<string, { disposition: Disposition; reason: string; script: string }>;
  // "This sounds like a case we can handle" is approved for TMP only. TMT runs
  // the network model and must never imply acceptance.
  allowSoundsLikeACase: boolean;
  // Spoken the moment the file qualifies, BEFORE identity is captured. The old
  // "I have everything I need" line moved to just before the retainer goes out,
  // because at this point we do not have everything yet.
  signTransition: string;
}

const TMT_ROUTING: FirmConsoleConfig["callTypeRouting"] = {
  existing: {
    disposition: "TRANSFER",
    reason: "Existing client, routed to their case team",
    script: "Let me get you to the team handling your case. One moment.",
  },
  non_client: {
    disposition: "TRANSFER",
    reason: "Non-client matter, routed to the firm",
    script: "Let me get you to the right person here. One moment.",
  },
  not_legal: {
    disposition: "DISQUALIFY",
    reason: "Not a legal matter",
    script: "I appreciate you calling in. This is not something our attorneys handle, so I do not want to hold you up. Take care.",
  },
};

export const FIRM_CONFIGS: Record<string, FirmConsoleConfig> = {
  tmt: {
    slug: "tmt",
    firmName: "The Money Team Law Firm",
    greeting:
      "Thank you for calling The Money Team Law Firm, this is [agent]. This call may be recorded for quality and training. Is this about an injury to you, or to someone close to you?",
    recordingDisclosure:
      "The recording line is mandatory. Read it as written. It is a statement, not a question — do not pause for permission and do not shorten it.",
    caseTypes: ["mva", "prem", "employment", "family", "criminal", "contract", "other"],
    autoBillsThreshold: 10000,
    gpiBillsThreshold: 50000,
    referTurnaround: "72 hours",
    network: "the Lexamica network",
    callTypeRouting: TMT_ROUTING,
    allowSoundsLikeACase: false,
    signTransition: "Alright [name], I can get you started right now. I just need a few details from you so I can send your agreement over.",
  },

  // Config stubs. Fill in greeting + thresholds when each firm signs off; no
  // code change required to bring them live.
  tmp: {
    slug: "tmp",
    firmName: "Turnbull, Moak & Pendergrass",
    greeting:
      "Thank you for calling Turnbull, Moak and Pendergrass, this is [agent]. This call may be recorded for quality and training. Is this about an injury to you, or to someone close to you?",
    recordingDisclosure:
      "The recording line is mandatory. Read it as written. It is a statement, not a question.",
    caseTypes: ["mva", "prem", "other"],
    autoBillsThreshold: 10000,
    gpiBillsThreshold: 50000,
    referTurnaround: "72 hours",
    network: "our referral network",
    callTypeRouting: TMT_ROUTING,
    allowSoundsLikeACase: true, // approved for TMP only
    signTransition: "Good news [name], this sounds like a case we can handle. Let me grab a few details so I can send your agreement over.",
  },

  roth: {
    slug: "roth",
    firmName: "The Roth Law Firm",
    greeting:
      "Thank you for calling The Roth Law Firm, this is [agent]. This call may be recorded for quality and training. How can I help you today?",
    recordingDisclosure:
      "The recording line is mandatory. Read it as written. It is a statement, not a question.",
    caseTypes: ["mva", "prem", "other"],
    autoBillsThreshold: 10000,
    gpiBillsThreshold: 50000,
    referTurnaround: "72 hours",
    network: "our referral network",
    callTypeRouting: TMT_ROUTING,
    allowSoundsLikeACase: false,
    signTransition: "Alright [name], I can get you started right now. I just need a few details so I can send your agreement over.",
  },
};

export const DEFAULT_FIRM_SLUG = "tmt";

export function getFirmConfig(slug: string | null | undefined): FirmConsoleConfig {
  return FIRM_CONFIGS[slug ?? ""] ?? FIRM_CONFIGS[DEFAULT_FIRM_SLUG];
}

// Shallow-merge DB overrides (firms.intake_config) over the code defaults.
export function mergeFirmConfig(base: FirmConsoleConfig, override: any): FirmConsoleConfig {
  if (!override || typeof override !== "object") return base;
  return { ...base, ...override, callTypeRouting: { ...base.callTypeRouting, ...(override.callTypeRouting ?? {}) } };
}
