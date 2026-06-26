// Agent-assist reference content. Read-only knowledge agents pull up on a call.
// Extend per campaign over time.

export interface KnowledgeTopic {
  id: string;
  label: string;
  icon: string;
  body: { h?: string; p?: string; list?: string[] }[];
}

export const KNOWLEDGE: KnowledgeTopic[] = [
  {
    id: "criteria",
    label: "Campaign criteria",
    icon: "✓",
    body: [
      { h: "PFAS — disqualifiers (only 3 gates)", list: [
        "Currently represented by another attorney for this matter",
        "Signed documents with another firm (unless dropped with drop letter + supervisor approval)",
        "Prior Camp Lejeune / PFAS signup",
      ]},
      { p: "Military and location questions are for case classification only, not disqualifiers." },
      { h: "Bard PowerPort", list: [
        "Blood clot vs missed-flush causation distinction",
        "Unflushed port is an intake gate",
      ]},
    ],
  },
  {
    id: "rebuttals",
    label: "Rebuttals",
    icon: "💬",
    body: [
      { h: "\"I need to think about it\"", p: "Totally fair. The questions take about two minutes and there's no obligation either way. Let's just see if you even qualify, then you can decide." },
      { h: "\"Is this going to cost me anything?\"", p: "No. There's no cost to you. The firm only gets paid if there's a recovery." },
      { h: "\"How did you get my information?\"", p: "You reached out / submitted info about a claim. I'm just following up to see if we can help." },
    ],
  },
  {
    id: "afff",
    label: "AFFF vs CL",
    icon: "⚠️",
    body: [
      { p: "AFFF firefighting foam exposure is OK to continue (not a disqualifier)." },
      { p: "A prior Camp Lejeune (CL) signup IS a disqualifier for PFAS." },
      { p: "If unsure which the claimant means, clarify before DQ'ing." },
    ],
  },
  {
    id: "dx",
    label: "PFAS diagnosis list",
    icon: "🩺",
    body: [
      { h: "Commonly qualifying conditions", list: [
        "Kidney cancer", "Testicular cancer", "Liver cancer",
        "Pancreatic cancer", "Bladder cancer", "Thyroid disease",
        "Ulcerative colitis", "Kidney disease",
      ]},
      { p: "This is a reference, not a guarantee. Confirm against current campaign sheet." },
    ],
  },
  {
    id: "sol",
    label: "SOL by state",
    icon: "📅",
    body: [
      { p: "Statute of limitations varies by state and tort. Flag a supervisor for any claimant near a potential deadline." },
      { p: "Do not advise the claimant on SOL directly; route to the firm." },
    ],
  },
];
