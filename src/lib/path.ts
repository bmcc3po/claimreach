// ============================================================================
// THE PATH — the one prescribed route from new hire to cleared for live calls.
//
// Every stage lists the module_ids that must be "completed" in training_progress
// before the next stage unlocks. Nothing here is a suggestion: an agent is not
// cleared until the last stage is green, and Records is the proof.
//
// Order is deliberate. The Method comes before the Course because every later
// chapter is downstream of it. Crisis comes late because the door is the last
// thing you reach for, not the first.
// ============================================================================

export interface PathStage {
  id: string;
  num: string;
  title: string;
  blurb: string;
  chapter: "method" | "course" | "campaigns" | "sop" | "bible" | "liners";
  requires: string[];          // module_ids that must be completed
  estimate: string;
}

export const METHOD_READ_ID = "method-read";

// Course module ids in teaching order.
const M = {
  foundations: "m1-foundations",
  method: "m8-the-method",
  control: "m9-control-the-call",
  trauma: "m4-trauma-responses",
  populations: "m5-populations",
  bleed: "m2-stop-the-bleed",
  acute: "m3-acute",
  liners: "m6-silver-liners",
  selfcare: "m7-selfcare",
};

export function buildPath(campaignId: string): PathStage[] {
  return [
    {
      id: "read-method", num: "01", title: "Read The Method",
      blurb: "How we run every call on every campaign. Frame, message, register, the ceiling, the Mirror Rule, the three Rs, the downshift, and the door. Read all eight sections before anything else.",
      chapter: "method", requires: [METHOD_READ_ID], estimate: "20 min",
    },
    {
      id: "response-drill", num: "02", title: "Pass the response drill",
      blurb: "She says a thing, you say the next thing. Every wrong answer is a named fault with the move that replaces it. 90% to pass, and you can retake it.",
      chapter: "method", requires: [`resp-${campaignId}`], estimate: "25 min",
    },
    {
      id: "foundations", num: "03", title: "Role and boundaries",
      blurb: "What you are on this call and what you are not. The lines you never cross, least harm over most detail, and controlling a call without going cold.",
      chapter: "course", requires: [M.foundations, M.method, M.control], estimate: "45 min",
    },
    {
      id: "reading-people", num: "04", title: "Reading people",
      blurb: "Trauma responses, fragmented memory, shutdown, and the specific experiences you'll hear from most.",
      chapter: "course", requires: [M.trauma, M.populations], estimate: "35 min",
    },
    {
      id: "crisis", num: "05", title: "Crisis mode",
      blurb: "The door. What happens after the form stops. Everything in this stage is wrong during an interview and right once you've stopped, and knowing the difference is the point.",
      chapter: "course", requires: [M.bleed, M.acute], estimate: "40 min",
    },
    {
      id: "sustain", num: "06", title: "Hope and self-care",
      blurb: "Silver Liners at the right moment — never mid-form — and how to set a hard call down so you can take the next one.",
      chapter: "course", requires: [M.liners, M.selfcare], estimate: "25 min",
    },
    {
      id: "campaign-cert", num: "07", title: "Certify on the campaign",
      blurb: "The case in front of you. Criteria board, call order, technique, and the written certification.",
      chapter: "campaigns", requires: [`cmp-${campaignId}`], estimate: "30 min",
    },
    {
      id: "verdict-drill", num: "08", title: "Pass the qualifier drill",
      blurb: "Fact patterns, one at a time. Sign, escalate, or disqualify. This is the one that says whether you can run the campaign.",
      chapter: "campaigns", requires: [`drill-${campaignId}`], estimate: "20 min",
    },
  ];
}

export type StageState = "done" | "current" | "locked";

export function stageStates(stages: PathStage[], completed: Set<string>): StageState[] {
  let foundCurrent = false;
  return stages.map((s) => {
    const done = s.requires.every((r) => completed.has(r));
    if (done) return "done";
    if (!foundCurrent) { foundCurrent = true; return "current"; }
    return "locked";
  });
}
