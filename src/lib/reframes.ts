// ============================================================================
// REFRAME BANK — the middle R. Always sandwiched:
//   Recognize (one breath) -> Reframe (from here) -> Reask (a form question).
//
// Hard rules baked into every line below:
//   - Never promise. No money, timeline, arrest, or outcome. "Seek justice" is
//     process and is fine. "Get justice" is outcome and is not.
//   - Never characterize her or the telling. Point at the work.
//   - Never put the agent in the frame (Mirror Rule).
//   - Vary them. The same reframe twice in twenty minutes sounds scripted.
// ============================================================================

export interface ReframeGroup {
  id: string;
  label: string;
  triggers: string[];
  note?: string;
  lines: string[];
}

export const REFRAMES: ReframeGroup[] = [
  {
    id: "shame",
    label: "Shame about herself",
    triggers: ["\"Do you think I'm gross?\"", "\"You think I'm a slut, don't you?\"", "\"I feel disgusting telling you this.\""],
    lines: [
      "This is what we're here to do.",
      "This is the part that builds the case.",
      "Nothing you say lands wrong with me.",
      "We're doing great.",
      "We're doing fine, we're right on track.",
      "Nothing you tell me changes how this call goes.",
      "My job is to write it down accurately. That's the whole job.",
      "This is the work. You're doing it right.",
    ],
  },
  {
    id: "about-you",
    label: "She asks about you",
    triggers: ["\"Has this happened to you?\"", "\"Do you have kids?\"", "\"What would you do?\""],
    note: "Mirror Rule. The rule is real. Name it, never lean on it alone.",
    lines: [
      "We don't share anything about ourselves. That's the rule.",
      "This time is yours.",
      "We keep ourselves out of it, and it's a good rule.",
      "Not allowed to, and it's better that way.",
      "The call is yours, not mine.",
    ],
  },
  {
    id: "money",
    label: "Money and outcome",
    triggers: ["\"How much will I get?\"", "\"Is this worth anything?\"", "\"Will I win?\""],
    note: "Hardest no-promise zone in the bank. No numbers, no trends, no hedged numbers.",
    lines: [
      "Nobody can tell you that yet, and I'd be guessing.",
      "I'm not the person who'd know, and I won't guess at it.",
      "My job is getting this in front of them accurately.",
      "They'll walk you through all of that once they have the file.",
      "The best thing we can do for that is finish this and get it to them.",
    ],
  },
  {
    id: "timeline",
    label: "Timeline",
    triggers: ["\"How long will this take?\"", "\"When will I hear something?\""],
    note: "First read is the CALL. If she presses, she means the case, and that's Money and outcome.",
    lines: [
      "About twenty minutes if we keep moving.",
      "You can stop me any time.",
      "The case side is up to the attorneys, and I won't guess at it.",
      "That's not on my end, and I'd rather not put a number on it.",
    ],
  },
  {
    id: "criminal",
    label: "Criminal process",
    triggers: ["\"Will he get arrested?\"", "\"Is he still working there?\"", "\"Has anyone gone to jail?\""],
    lines: [
      "That's a separate process from what we do.",
      "I don't want to guess at something that isn't ours.",
      "What I can tell you is that everything here goes to the legal team.",
      "That's a question for them, and they'll have a better answer than I would.",
    ],
  },
  {
    id: "confidentiality",
    label: "Confidentiality",
    triggers: ["\"Who reads this?\"", "\"Does my family find out?\"", "\"Does the prison see it?\""],
    note: "Name her actual fear. Vague reassurance reads as evasion.",
    lines: [
      "Nobody outside the law firm.",
      "It doesn't go to your family and it doesn't go back to the prison.",
      "This is between you and the firm.",
      "The only people who see this are the attorneys working your case.",
    ],
  },
  {
    id: "why-questions",
    label: "Why so many questions",
    triggers: ["\"Why does it matter what he looked like?\"", "\"Why can't you just take my word?\"", "\"Is all this necessary?\""],
    lines: [
      "This is what lets the firm find him in the staff records.",
      "The details are what turn this into a case.",
      "Every one of these is a box the attorney has to check.",
      "I ask everyone the same questions in the same order.",
      "The more I get now, the less anyone has to call you back about.",
      "I do take your word. This is what makes it provable.",
    ],
  },
  {
    id: "drift",
    label: "Drift and tangent",
    triggers: ["Four minutes into a story that isn't on the form."],
    lines: [
      "Let me get this in the right place.",
      "I want to make sure this lands where the attorney will see it.",
      "We'll have a spot at the end for anything I didn't ask about.",
      "Hold that one for me.",
      "Let me get this part down first.",
    ],
  },
  {
    id: "self-blame",
    label: "Self-blame",
    triggers: ["\"I should have reported it.\"", "\"I let it happen.\"", "\"I never said anything.\""],
    note: "Normalize the fact. Never instruct her about her feelings.",
    lines: [
      "A lot of women didn't, and it doesn't hurt anything.",
      "That's not a requirement here.",
      "Nothing about that changes what we're doing.",
      "That's not unusual at all in these cases.",
    ],
  },
  {
    id: "memory",
    label: "Memory gaps",
    triggers: ["\"I can't remember his name.\"", "\"I don't know the dates.\"", "\"I'm useless.\""],
    note: "This is a criteria save disguised as a shame moment. Work the other identification routes.",
    lines: [
      "Most people don't remember names.",
      "That's not the only way to identify someone.",
      "Unknown is a fine answer here.",
      "We have other ways to get there.",
      "Close is good enough on dates.",
    ],
  },
  {
    id: "fatigue",
    label: "Fatigue",
    triggers: ["\"Can we be done?\"", "\"This is a lot.\"", "\"I'm tired.\""],
    note: "Downshift before you stop. Move to the descriptive block, don't end the call.",
    lines: [
      "Let's hop over to some of the routine stuff for a few minutes and circle back.",
      "Let's park that one. Give me the easy stuff for a minute.",
      "We can stop any time, and we can pick it up tomorrow.",
      "Anything you don't want to answer, we skip.",
      "Say the word and we pause.",
      "We're past the hard part.",
    ],
  },
  {
    id: "distrust",
    label: "Distrust",
    triggers: ["\"Is this even real?\"", "\"How do I know you're not a scam?\"", "\"Why should I tell you any of this?\""],
    lines: [
      "That's fair, and I'd rather you ask than wonder.",
      "Everything I take down goes into a file the attorney reviews.",
      "You can call the firm directly and confirm before we go further.",
      "Ask me anything you want about who we are.",
    ],
  },
];
