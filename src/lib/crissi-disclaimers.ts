// ============================================================================
// Crissi — Legal & safety disclaimers. SWAPPABLE: replace these strings with
// attorney-approved wording when ready. Everything else references these.
// ============================================================================

export const DISCLAIMER_SHORT =
  "Crissi is a support tool, not a therapist. You are not a licensed counselor and neither is Crissi. This is operational guidance, not clinical, medical, or legal advice. When in doubt: stay present, connect to 988 or 911, escalate to a supervisor, and document.";

export const DISCLAIMER_FULL = [
  "Crissi and this guide are operational and communication aids for trained intake staff. They are NOT clinical, medical, psychological, or legal advice.",
  "You are not a licensed therapist, counselor, clinician, social worker, or mandated reporter, and neither is Crissi. Do not diagnose, do not treat, do not attempt to process or resolve someone's trauma.",
  "Your job is to be calm and human, keep the person safe in the moment, stay with them, and connect them to trained professionals. Always favor connecting to 988 (crisis) or 911 (immediate danger) over trying to manage a crisis yourself.",
  "Never promise confidentiality, outcomes, or that everything will be okay. Never make the call about the case, the signup, or commission when someone is in distress.",
  "When something may require an outside report, you do not decide that alone (except calling 911 in an immediate emergency). Document factually and escalate to Brett, who decides with counsel.",
  "This guidance may be updated by the Company at any time and does not create any professional duty of care.",
];

// The lines that must never be crossed — shown on acute topics.
export const HARD_LINES = [
  "Do not diagnose or label (no \"you have PTSD,\" \"that's a panic attack,\" etc.).",
  "Do not give medical, psychiatric, medication, or legal advice.",
  "Do not try to be their therapist or work through the trauma itself.",
  "Do not promise confidentiality or any outcome.",
  "Do not take a signup from someone who cannot understand what they're agreeing to.",
  "Do not receive or open any image/file that could be illegal material — decline and escalate.",
  "Do not abandon them in an acute moment — stay until safely handed off.",
];

export const ESCALATION_LINE =
  "Stay with them. Connect to 988 (call/text) or 911 if immediate danger. Then notify Brett by all methods and document. The person's safety never waits on reaching anyone.";

// ============================================================================
// ABSOLUTE PROHIBITIONS — injected into EVERY Crissi AI system prompt. These are
// non-negotiable and override anything else the model might generate.
// ============================================================================
export const CRISSI_NEVER = [
  "NEVER tell the agent to ask the caller if they are thinking about hurting themselves, harming themselves, or suicide. Do NOT suggest any version of 'are you thinking about hurting yourself', 'are you suicidal', 'do you want to hurt yourself', or any self-harm screening question. Asking this can plant or amplify the idea and is a clinical risk-assessment the agent is NOT permitted to perform.",
  "NEVER instruct the agent to assess, screen, or evaluate suicide or self-harm risk. That is a trained-clinician function (988), not the agent's. The agent stays present and connects to 988; the agent does NOT probe.",
  "NEVER name, suggest, or ask about specific methods of self-harm or suicide.",
  "If the CALLER spontaneously expresses thoughts of self-harm, do NOT have the agent ask follow-up screening questions. The agent acknowledges warmly, stays present, and bridges to 988 ('I'm really glad you told me. I'm not going anywhere. Can we get 988 on with us? I'll stay right here.'). Connect, don't interrogate.",
  "NEVER tell the agent to diagnose, label, or give medical/psychiatric/legal advice.",
  "Keep safety checks to gentle, NON-clinical presence only (e.g. 'I'm right here with you'). Do not turn it into a questionnaire.",
];

export const CRISSI_GUARDRAIL_PROMPT =
  "ABSOLUTE RULES YOU MUST FOLLOW (these override everything else):\n- " + CRISSI_NEVER.join("\n- ");
