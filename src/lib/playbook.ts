// Trauma-informed playbook. SOP + best practices. Extensible: add CUSTOM_TOPICS
// later (or load from DB) and they merge into the library and the bot's grounding.

export interface PlaybookTopic {
  id: string;
  group: "deescalation" | "skills" | "recognize" | "situations" | "selfcare" | "faq";
  title: string;
  summary: string;
  do?: string[];
  avoid?: string[];
  scenario?: { prompt: string; good: string; why: string };
}

export const PLAYBOOK: PlaybookTopic[] = [
  // ---- DE-ESCALATION ----
  {
    id: "stop-the-bleed", group: "deescalation",
    title: "Stop the bleed — first 30 seconds",
    summary: "When someone is spiraling, your first job is not to fix anything. It is to slow the moment and make them feel heard so they stay on the line.",
    do: [
      "Slow your own voice and breathing first; they will mirror you.",
      "Name that you are here: \"I'm right here with you. We can take this slow.\"",
      "Let silence happen. Don't rush to fill it.",
      "Reflect one feeling, not five: \"That sounds really heavy.\"",
    ],
    avoid: ["Problem-solving immediately", "Stacking questions", "\"Calm down\" or \"it's okay\"", "Talking fast to cover your own nerves"],
  },
  {
    id: "empathy-not-sympathy", group: "deescalation",
    title: "Empathy, not sympathy",
    summary: "Empathy says \"I'm with you in this.\" Sympathy says \"I feel bad for you\" and quietly puts you above them. Empathy stabilizes; sympathy distances.",
    do: [
      "\"That makes sense given what you went through.\" (validates)",
      "\"I can hear how much this is weighing on you.\" (with them)",
      "Stay level. You are a steady hand, not a fellow victim.",
    ],
    avoid: ["\"Oh you poor thing\" (pity)", "\"I know exactly how you feel\" (you don't)", "Matching their panic with your own emotion"],
  },
  // ---- SKILLS ----
  {
    id: "reflective-listening", group: "skills",
    title: "Reflective listening without amplifying",
    summary: "Reflect enough that they feel heard, but don't keep re-opening the wound. Acknowledge, then gently steer toward safety and next steps.",
    do: ["Acknowledge once, then move: \"I hear you. Let's make sure you're safe right now.\"", "Use their words back sparingly", "Pivot to the present and to support"],
    avoid: ["Asking them to re-tell graphic detail", "Looping on the trauma", "Digging for more than you need"],
  },
  {
    id: "open-vs-closed", group: "skills",
    title: "When to use open vs closed questions",
    summary: "In crisis, closed and concrete questions are grounding (\"Is anyone with you right now?\"). Open questions are for when they're already steady.",
    do: ["Crisis: short, concrete, answerable", "Steady: open, gentle, their pace"],
    avoid: ["\"Why\" questions in crisis (they feel like blame)", "Big open questions when someone is flooded"],
  },
  // ---- RECOGNIZE ----
  {
    id: "spotting-spiral", group: "recognize",
    title: "Spotting an emotional spiral early",
    summary: "Catch it before it peaks. Signs: speech speeding up, breathing changes, repeating the same phrase, going from talking to dissociating or going flat.",
    do: ["Interrupt gently with grounding: \"Let's pause for one breath together.\"", "Bring them to the present: name the date, where they are, that they're safe with you now", "Slow everything down"],
    avoid: ["Pushing forward with the script", "Adding new information", "Letting silence turn into freefall"],
  },
  {
    id: "trigger-signaling", group: "recognize",
    title: "Trigger signaling — reading the cues",
    summary: "A trigger can show as sudden silence, a flat voice, anger that appears from nowhere, or someone leaving their body (\"I feel far away\"). These are protective responses, not difficulty.",
    do: ["Lower stimulation: fewer words, softer tone", "Offer a choice to restore control: \"We can pause or skip that, your call.\"", "Re-anchor to the present"],
    avoid: ["Taking anger personally", "Pressing on the trigger", "Treating shutdown as non-compliance"],
  },
  // ---- SITUATIONS ----
  {
    id: "dv-support-vs-intervention", group: "situations",
    title: "Domestic violence — support vs intervention",
    summary: "Support means believing them, prioritizing their safety, and offering resources at their pace. Intervention (deciding for them, pushing them to leave, calling without consent) can increase danger. You support; professionals intervene.",
    do: [
      "Believe them; never question why they stayed",
      "Ask if they're safe to talk right now",
      "Offer the DV hotline (800-799-7233) and let them choose",
      "If immediate danger, 911; for out-of-area, 988 routes locally",
    ],
    avoid: ["Telling them to leave", "Calling the abuser's location without consent unless life is in danger", "Promises about confidentiality you can't keep"],
  },
  {
    id: "deathtraps", group: "situations",
    title: "Emotional deathtraps to avoid",
    summary: "The phrases and moves that quietly blow up a fragile call.",
    avoid: [
      "\"Calm down\" / \"It's not that bad\" — minimizes",
      "\"I know how you feel\" — you don't, and they know it",
      "Making it about the case or the signup mid-crisis",
      "Arguing or debating their feelings",
      "Going silent and disappearing vs. warm presence",
      "Promising outcomes (\"we'll definitely win this\")",
    ],
    do: ["When in doubt: slow down, validate one feeling, connect to 988/911, get a supervisor"],
  },
  // ---- SELF CARE (the agent) ----
  {
    id: "agent-after-hard-call", group: "selfcare",
    title: "After a hard call — steadying yourself",
    summary: "Hard calls land on you too. Stabilizing yourself isn't weakness; it's how you stay good at this. You did the right thing by staying and escalating.",
    do: ["Step away for a few minutes, it's pre-approved", "Breathe out longer than you breathe in, a few times", "Tell a supervisor; you don't carry this alone", "Name it: \"that was a lot,\" then let it be a lot"],
    avoid: ["White-knuckling into the next call", "Telling yourself you should be tougher", "Carrying it home silently"],
  },
  // ---- FAQ ----
  {
    id: "faq-out-of-state", group: "faq",
    title: "FAQ: caller is in another state and in danger",
    summary: "Dialing 911 from the office reaches local dispatch, not their town. 988 routes to a crisis center near the caller and can arrange local dispatch.",
    do: ["Use 988 as the primary rail for out-of-area", "Get city/state + address if immediate danger", "Stay on the line; have them dial 911 if able"],
  },
  {
    id: "faq-capacity", group: "faq",
    title: "FAQ: caller can't understand what they're agreeing to",
    summary: "If someone is in acute crisis, intoxicated, or apparently a minor, no qualification or signup may occur. Stop, care for them, document, escalate. A signup they couldn't understand is invalid.",
  },
  {
    id: "faq-csam", group: "faq",
    title: "FAQ: someone tries to send disturbing material",
    summary: "Do not receive or open anything. Decline. Refer to law enforcement, the FBI (fbi.gov), or NCMEC (1-800-843-5678). Escalate to a supervisor immediately.",
  },
];

export const PLAYBOOK_GROUPS: { id: PlaybookTopic["group"]; label: string }[] = [
  { id: "deescalation", label: "De-escalation" },
  { id: "skills", label: "Core skills" },
  { id: "recognize", label: "Recognizing distress" },
  { id: "situations", label: "Hard situations" },
  { id: "selfcare", label: "Steadying yourself" },
  { id: "faq", label: "FAQs" },
];
