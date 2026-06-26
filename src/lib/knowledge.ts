// Agent-assist reference, keyed by claim type so a trafficking file shows
// trafficking guidance (not PFAS oncology). Read-only; extend over time.

export interface KnowledgeTopic {
  id: string;
  label: string;
  icon: string;
  body: { h?: string; p?: string; list?: string[] }[];
}

const TRAFFICKING: KnowledgeTopic[] = [
  {
    id: "language",
    label: "Victim-centered language",
    icon: "💛",
    body: [
      { h: "Lead with safety and care", p: "You are not judging or interrogating. You are gathering facts so the legal team can help. Reassure the claimant it is confidential and there is no wrong answer." },
      { h: "Phrasing that helps", list: [
        "\"Take your time, there's no rush.\"",
        "\"You can skip anything you're not ready to talk about.\"",
        "\"Nothing you share changes whether we can help.\"",
        "\"I'm just writing down what you remember.\"",
      ]},
      { h: "Avoid", list: [
        "Why didn't you leave / why didn't you call police",
        "Anything that sounds like blame or doubt",
        "Pushing for graphic detail beyond what's needed",
      ]},
    ],
  },
  {
    id: "redflags",
    label: "Hospitality red flags",
    icon: "🏨",
    body: [
      { h: "Signs the property knew or should have known", list: [
        "Cash payments, frequent room changes, same rooms requested",
        "Heavy foot traffic to one room; men waiting in lobby/lot",
        "Do-not-disturb for long periods; refused housekeeping",
        "Staff ignored visible signs; no intervention by management",
        "Condoms/paraphernalia visible to staff; violence in public areas",
      ]},
      { p: "These map to the Hotel Knowledge questions on each property." },
    ],
  },
  {
    id: "viability",
    label: "Case viability",
    icon: "✓",
    body: [
      { h: "What strengthens a hospitality trafficking claim", list: [
        "Identifiable property/brand (even if rebranded since)",
        "Specific, repeated stays the claimant can place in time",
        "Staff awareness indicators (the red flags above)",
        "Trafficker identification details",
      ]},
      { h: "Classification, not disqualifiers", p: "Location and timeframe questions help classify the case. Confirm the claimant is not already represented for this matter." },
    ],
  },
  {
    id: "crisis",
    label: "If claimant is in distress",
    icon: "🆘",
    body: [
      { h: "In the moment", list: [
        "If immediate danger: call 911.",
        "Slow down. Let them breathe. Do not push the questionnaire.",
        "\"You're safe talking to me right now. We can pause any time.\"",
        "Offer the hotline: National Human Trafficking Hotline 1-888-373-7888 (text 233733).",
        "988 for suicide/crisis. Then flag a supervisor.",
      ]},
      { p: "Use the Crisis help button (bottom right) for resources any time." },
    ],
  },
];

const PFAS: KnowledgeTopic[] = [
  { id: "criteria", label: "PFAS criteria", icon: "✓", body: [
    { h: "Only 3 DQ gates", list: [
      "Currently represented for this matter",
      "Signed with another firm (unless dropped + supervisor approval)",
      "Prior Camp Lejeune / PFAS signup",
    ]},
    { p: "Military/location questions are classification only." },
  ]},
  { id: "dx", label: "PFAS diagnosis list", icon: "🩺", body: [
    { h: "Commonly qualifying", list: ["Kidney cancer","Testicular cancer","Liver cancer","Pancreatic cancer","Bladder cancer","Thyroid disease","Ulcerative colitis","Kidney disease"] },
    { p: "Reference only. Confirm against current campaign sheet." },
  ]},
];

const BARD: KnowledgeTopic[] = [
  { id: "bard", label: "Bard PowerPort", icon: "✓", body: [
    { h: "Causation", list: ["Blood clot vs missed-flush distinction","Unflushed port is an intake gate"] },
  ]},
];

const GENERAL: KnowledgeTopic[] = [
  { id: "rebuttals", label: "Rebuttals", icon: "💬", body: [
    { h: "\"I need to think about it\"", p: "Totally fair. The questions take a couple minutes, no obligation. Let's just see if we can help." },
    { h: "\"Will this cost me anything?\"", p: "No. The firm only gets paid if there's a recovery." },
  ]},
];

export function knowledgeFor(claimType: string): KnowledgeTopic[] {
  const t = (claimType || "").toLowerCase();
  if (t.includes("traffick") || t.includes("motel") || t.includes("hotel")) return [...TRAFFICKING, ...GENERAL];
  if (t.includes("pfas")) return [...PFAS, ...GENERAL];
  if (t.includes("bard") || t.includes("powerport")) return [...BARD, ...GENERAL];
  return [...TRAFFICKING, ...GENERAL];
}
