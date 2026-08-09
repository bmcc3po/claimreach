import type { Field } from "@/lib/questionnaire";

// Common Intake Starter — the questions nearly every campaign shares. Begin a new
// form from this, then add campaign-specific sections.
export const COMMON_STARTER: Field[] = [
  { id: "s_open", scope: "lead", kind: "section", label: "Opening" },
  { id: "script_intro", scope: "lead", kind: "script", label: "Intro (read verbatim)",
    script: "Thank you. My name is ___. I'm calling from ___ regarding your claim. Before we begin, are you in a safe place to speak right now?",
    agentNote: "If NOT safe to talk: schedule a callback and stop here." },
  { id: "safe_to_talk", scope: "lead", kind: "bool", label: "Claimant is in a safe place to speak", vital: true },

  { id: "s_contact", scope: "lead", kind: "section", label: "Contact Info" },
  { id: "first_name", scope: "lead", kind: "text", label: "First name", vital: true, surface: "contact" },
  { id: "last_name", scope: "lead", kind: "text", label: "Last name", vital: true, surface: "contact" },
  { id: "phone", scope: "lead", kind: "phone", label: "Best phone", vital: true, surface: "contact" },
  { id: "email", scope: "lead", kind: "email", label: "Email", surface: "contact" },
  { id: "dob", scope: "lead", kind: "date", label: "Date of birth", surface: "contact" },
  { id: "mail_addr1", scope: "lead", kind: "text", label: "Mailing address", surface: "contact" },
  { id: "mail_city", scope: "lead", kind: "text", label: "City", surface: "contact" },
  { id: "mail_state", scope: "lead", kind: "text", label: "State", surface: "contact" },
  { id: "mail_zip", scope: "lead", kind: "text", label: "ZIP", surface: "contact" },

  { id: "s_attorney", scope: "lead", kind: "section", label: "Attorney Status" },
  { id: "has_attorney", scope: "lead", kind: "bool", label: "Currently represented by another attorney for this matter?", vital: true,
    agentNote: "If yes, this may be a DQ unless a drop letter + supervisor approval." },
  { id: "gate_represented", scope: "lead", kind: "gate", label: "If represented: confirm drop letter + supervisor approval", gateType: "dq",
    showIf: { match: "all", rules: [{ fieldId: "has_attorney", op: "is", value: "true" }] } },

  { id: "s_close", scope: "lead", kind: "section", label: "Close" },
  { id: "script_close", scope: "lead", kind: "script", label: "Closing (read verbatim)",
    script: "Thank you. The next step is to get your agreement signed and your file to the firm. I'll send that over now." },
];

export const TEMPLATES: { id: string; name: string; description: string; fields: Field[] }[] = [
  { id: "common", name: "Common Intake Starter", description: "Opening, contact info, attorney status, close, the shared spine.", fields: COMMON_STARTER },
];
