// Innovative Intake — Crisis Response & Reporting SOP (operational guide).
export const CRISIS_SOP = {
  title: "Crisis Response & Reporting",
  subtitle: "Support · Connect · Escalate",
  intro: "This is an operational and communication guide. It is not clinical advice and does not make you a counselor or mandated reporter. Your role in a crisis is to be calm and human, keep the person connected to professional help, and escalate. Always favor connecting the person to trained crisis professionals (988) or emergency services (911) over managing the crisis yourself. When in doubt, connect and escalate.",
  sections: [
    { h: "Your role in three words", items: ["Support — stay calm, listen, be warm and non-judgmental.", "Connect — get them to 988 (crisis) or 911 (immediate danger).", "Escalate — notify the supervisor by all methods and document."] },
    { h: "Helpful things to say", items: [
      "“I’m really glad you told me. I’m here, and I’m listening.”",
      "“That sounds incredibly hard. You don’t have to go through this alone.”",
      "“There are people available right now trained for exactly this. Can we get them on with us? You can call or text 988 and I’ll stay with you.”",
      "“I want to make sure you’re safe. Is there anyone with you right now?”",
      "“You matter. I want to help you get the right support.”",
    ]},
    { h: "What to avoid", items: [
      "Don’t say “calm down,” “it’s not that bad,” or minimize what they feel.",
      "Don’t argue, lecture, debate, or try to convince them logically.",
      "Don’t promise confidentiality or outcomes you can’t guarantee.",
      "Don’t try to diagnose, counsel, or act as a therapist.",
      "Don’t make the call about the case, signup, or commission.",
      "Don’t hang up or rush them off the line.",
    ]},
    { h: "Out-of-state callers", items: [
      "988 is the primary rail — it routes to a crisis center near the caller and can arrange local dispatch.",
      "Dialing 911 from the office reaches LOCAL dispatch, not the caller’s town.",
      "Keep the caller on the line; connect them to 988 (call/text) and offer to stay on.",
      "If immediate danger and you need local services, get city/state + address and contact that locality, or have the caller dial 911 while you stay on.",
    ]},
    { h: "Capacity", items: ["If a caller cannot understand what they’re agreeing to (acute crisis, intoxication, incapacity, apparent minor), no qualification or signup may occur. Confirm the agent stopped, address safety, document, and escalate. A signup from someone who couldn’t understand it is invalid."] },
    { h: "Reporting decisions", items: [
      "Agents don’t make external reports on their own (other than 911 in an emergency).",
      "Immediate life-threatening danger: call 911 now.",
      "Everything else: document factually and escalate; the Company decides on any external report.",
      "Suspected CSAM: do not receive or open anything; refer to law enforcement, FBI (fbi.gov), or NCMEC (1-800-843-5678).",
    ]},
  ],
  resources: [
    { name: "Immediate, life-threatening danger", value: "911" },
    { name: "988 Suicide & Crisis Lifeline", value: "Call or text 988 · 988lifeline.org · 24/7 (Veterans press 1, Spanish press 2)" },
    { name: "National Domestic Violence Hotline", value: "800-799-7233 (TTY 800-787-3224) · 24/7" },
    { name: "National Human Trafficking Hotline", value: "1-888-373-7888 · text 233733" },
    { name: "Childhelp National Child Abuse Hotline", value: "800-422-4453 · call or text · 24/7" },
  ],
};
