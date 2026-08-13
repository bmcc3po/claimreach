// ============================================================================
// THE METHOD — Brett's intake doctrine. This block opens EVERY campaign
// training, not just one. Frame, Message, Register, Ceiling, Mirror, Line,
// Downshift, Door.
//
// Rules that are easy to get wrong and are therefore stated as absolutes:
//   - Recognize is ONE BREATH. If it takes a second breath, you're
//     characterizing.
//   - The reask is ALWAYS a question off the form. Never a permission check.
//   - Three Rs are for drift, NOT crisis.
// ============================================================================

export interface MethodSection {
  id: string;
  num: string;
  title: string;
  lead: string;
  body: string[];
  rules?: string[];
  say?: string[];
  never?: string[];
}

export const METHOD: MethodSection[] = [
  {
    id: "frame",
    num: "01",
    title: "The Frame",
    lead: "You are a fireman. Your job is a nurse taking a history.",
    body: [
      "Calm, confident, empathetic but never bleeding-heart. Calm is contagious, and it is the only thing on this call that is. Whatever you bring, she matches.",
      "A fireman does not cry with you in the building. He does not ask how the fire made you feel, and he does not ask you to describe the flames. He is steady, he tells you where to walk, and he gets you out. Safety here is the signed retainer.",
      "Inside that frame, the specific job is a nurse documenting in a warm tone. Not a counselor. Not an advocate. Not a friend. You take an accurate history, warmly, and you finish it.",
    ],
    rules: [
      "Warmth lives in tone, pace, and steadiness. Never in content.",
      "You are not the decision maker and you never sound like one.",
    ],
  },
  {
    id: "message",
    num: "02",
    title: "The Message",
    lead: "Not \"I feel for you.\" It is \"nothing you say will change how I'm treating you.\"",
    body: [
      "This is the single most important sentence in the training. Everything else is a method for delivering it.",
      "She is reading you constantly for the moment you start treating her differently. Sympathy answers the wrong question. It tells her the thing she said landed hard on a stranger, which is exactly what she was afraid of.",
      "Steadiness answers the right one. It tells her nothing she says will cost her anything here. That is the safest thing she can hear, and it is the reason she finishes the interview.",
    ],
    say: [
      "\"Okay. Got it.\" (same tone as every other acknowledgment)",
      "\"Nothing you say lands wrong with me.\"",
      "\"We're doing great, this is what we're here to do.\"",
    ],
    never: [
      "\"Oh my God\" / \"That's horrible\" / \"I can't imagine\"",
      "Dropping your voice into a hush after a disclosure",
      "A long pause that reads as you gathering yourself",
    ],
  },
  {
    id: "register",
    num: "03",
    title: "The Register",
    lead: "One voice. Same pace, pitch, and volume for every question on the form.",
    body: [
      "Your voice asking \"what's your date of birth\" and your voice asking \"was there penetration\" should be identical. Every tonal error is a deviation from that.",
      "Dropping your register after a disclosure is the tell that you are now handling her. Getting quieter reads as shame, and shame is contagious too. Rising inflection on the clinical questions makes you sound tentative, and a tentative interviewer produces a tentative witness.",
      "Slow slightly if you need to. Slow reads as confident. Hushed reads as pity.",
    ],
    rules: [
      "Acknowledge, never characterize.",
      "Never comment on the telling. Never name difficulty.",
      "Never label her: not brave, not strong, not a survivor, not a victim.",
      "Never thank her for the disclosure. Thank her at the end, for her time.",
      "Say the clinical word so she doesn't have to.",
    ],
  },
  {
    id: "ceiling",
    num: "04",
    title: "The Ceiling and the Floor",
    lead: "\"You're so brave\" is the ceiling. \"I do this all day\" is the floor. Live in the middle.",
    body: [
      "The ceiling is a boundary marker, not a target. Praise for disclosing turns her into a subject and makes the call about how well she told it.",
      "The floor is just as wrong in the other direction. \"I do this all day\" makes her one of many and erases her. This doesn't shock me is fine. This doesn't interest me is not.",
      "The middle is brief, level, and forward. Answer what she asked, hand her the message, and go straight to the next question. The return is load-bearing: a pause turns your answer into a moment, and a moment is what she was afraid of.",
    ],
  },
  {
    id: "mirror",
    num: "05",
    title: "The Mirror Rule",
    lead: "You do not appear in the frame.",
    body: [
      "Agents do not disclose personal information, personal history, or personal opinions on a call. Not your history. Not your feelings about her case. Not what you would do. Not whether you think the officer should be in prison.",
      "This is a real rule and you can name it out loud. Naming it takes the decision out of your hands in the moment, which is the point. But never let the rule stand alone, or it reads as a door closing and she will assume the answer is yes.",
      "Rule, then the message, then the reask. One breath each.",
    ],
    say: [
      "\"We don't share anything about ourselves, that's the rule. This time is yours. [next form question]\"",
      "\"We keep ourselves out of it, and it's a good rule. [next form question]\"",
    ],
    never: [
      "\"I'm not allowed to answer that.\" (rule with nothing attached)",
      "\"Yes, actually, which is part of why I do this work.\"",
      "\"I hope he gets arrested.\"",
    ],
  },
  {
    id: "line",
    num: "06",
    title: "The Line — the three Rs",
    lead: "Recognize. Reframe. Reask. ALWAYS REASK.",
    body: [
      "You already use this on objections. It is the same mechanic for shame questions, tangents, testing, and self-blame. Same three moves, different trigger.",
      "RECOGNIZE the question, not the feeling. One breath. If it takes a second breath you have started characterizing. \"Not at all\" is recognizing. \"I know that's hard to talk about\" is picking a scab.",
      "REFRAME points at the work. Never at her. Vary it — recognize and reask can repeat all day without her noticing, but the same reframe twice in twenty minutes tells her she is being run through a script.",
      "REASK puts her back on the form. This is the one that stops the spiral, and it is the one agents drop.",
    ],
    rules: [
      "The reask is ALWAYS a question off the form. Never a permission check.",
      "No \"does that make sense,\" no \"are you okay to keep going,\" no \"does that work.\" Those hand her the wheel to prove you're being kind, and they invite a no.",
      "Confidence lives in moving on. Asking her to approve your answer signals you weren't sure it was good enough.",
      "Three Rs are for DRIFT. Not for crisis. See The Door.",
    ],
    say: [
      "\"Not at all. We're doing great, this is what we're here to do. So how many separate incidents were there?\"",
      "\"I hear you. Let me get this in the right place — what year did that start?\"",
    ],
  },
  {
    id: "downshift",
    num: "07",
    title: "The Downshift",
    lead: "Between keep going and the door, there is a third gear.",
    body: [
      "Most people who say \"this is a lot\" do not want to be done. They want out of THIS part. Taking them at their word and ending the call gives them something they didn't ask for and makes the callback ten times harder.",
      "This form has a long safe stretch built into it. Prison ID, aliases, alternate contacts, emergency contact, what years she was there, height, build, hair, tattoos, accent, where in the facility she'd run into him. All descriptive, none of it inside the incident, and all of it real work the file needs.",
      "Move there for five minutes. She resets, the file gains, and the two or three criteria questions left are still reachable with her on the line.",
    ],
    say: [
      "\"Let's hop over to some of the routine stuff for a few minutes and circle back. What years were you there, start to end?\"",
      "\"Let's park that one. Give me the easy stuff for a minute. Do you still have your ID badge, or remember your number?\"",
    ],
    rules: [
      "State it, don't ask it. You are not requesting permission to help her.",
      "Land on a form question.",
    ],
  },
  {
    id: "door",
    num: "08",
    title: "The Door",
    lead: "One register and a handoff. There is no second role.",
    body: [
      "If the call needs anything other than a warm nurse taking a history, that is an escalation. You do not perform a second role. You hand off.",
      "If you hold the register, you will almost never need the door. Nearly every crisis on these calls is manufactured by the interviewer, which means nearly every one is preventable.",
      "When you do need it, the form is over. Stop. Stay on the line. Follow the Crisis SOP. Running the three Rs on someone in acute distress is reasking a question to a person who cannot answer it, and it is the worst thing you can do in that moment.",
    ],
    rules: [
      "Acute distress, hopelessness, self-harm talk, or dissociation: stop the form.",
      "Stay on the line. Do not reschedule your way out of it.",
      "The file is not the priority in that moment.",
    ],
  },
];

// ---------------------------------------------------------------- Fault codes

export interface FaultCode { code: string; label: string; detail: string }

export const FAULT_CODES: FaultCode[] = [
  { code: "SCAB", label: "Picks the scab", detail: "Characterizes her or the telling. Names difficulty, praises, or labels her." },
  { code: "STALL", label: "Sympathy stall", detail: "Recognizes but never reasks. The call dies here." },
  { code: "COLD", label: "Cold", detail: "Reasks with no recognize. She shuts down." },
  { code: "DRIFT", label: "Lets it run", detail: "Recognize plus reframe with no reask. The spiral continues." },
  { code: "PROBE", label: "Over-probes", detail: "Asks for detail the criteria do not require." },
  { code: "PROMISE", label: "Promises", detail: "Outcome, money, timeline, or arrest language." },
  { code: "MIRROR", label: "Mirror Rule", detail: "Puts the agent in the frame." },
  { code: "HANDBACK", label: "Hands back the wheel", detail: "Ends on a permission question instead of a form question. Looks considerate, loses the call." },
  { code: "VERDICT", label: "States a decision", detail: "Tells the caller whether she qualifies. Never the agent's call." },
  { code: "ESCREASS", label: "Escalating reassurance", detail: "Answers a repeated challenge with more warmth instead of more steadiness. Proves her point." },
];
