// ============================================================================
// REBUTTALS
//
// Generic objection handling. Not case-specific on purpose: the same five or six
// objections come up on every campaign, and an agent who has the shape of the
// answer in their head does not freeze. These go on the dashboard so agents see
// one every time they load the page, which is how they end up drilled in.
//
// The rule underneath all of them: agree first, then reframe. Never argue with a
// caller. Never promise an outcome. Never pressure someone into signing.
// ============================================================================

export interface Rebuttal {
  objection: string;   // what the caller says
  line: string;        // what the agent says back, verbatim
  why?: string;        // the mechanic, so agents learn the pattern not just the words
}

export const REBUTTALS: Rebuttal[] = [
  {
    objection: "I need to talk to my spouse first.",
    line: "I understand you want to speak with your spouse, and you should. But remember, we are only taking the first step together, not the last step. If I can't help you tomorrow, then there's nothing to talk to your wife about.",
    why: "Agree completely, then shrink the decision. You are not asking them to commit to a case, only to find out whether there is one.",
  },
  {
    objection: "Let me think about it.",
    line: "That's fair, and you should think about it. The only thing I'd say is that thinking is free and time isn't. Let's get you on the record today, and then think about it with everything in front of you instead of guessing.",
    why: "Never fight the pause. Move the thinking to after the free step instead of before it.",
  },
  {
    objection: "I want to talk to a few other firms.",
    line: "Good, you should. Honestly, anybody who tells you not to shop is telling on themselves. But you can't compare us to anyone until you have one real answer to compare against. Let's get you that, and then go look.",
    why: "Endorsing the shopping removes the pressure and makes you the one they measure against.",
  },
  {
    objection: "I don't want to sue anybody.",
    line: "Most people don't, and that's not really what this is. This is about the bills and the time you lost getting hurt by somebody else's mistake. Whether it ever goes near a courtroom is a long way down the road.",
    why: "The objection is to a picture in their head, not to your service. Replace the picture.",
  },
  {
    objection: "I'm not sure I'm hurt badly enough.",
    line: "That's exactly why we get you seen. You're not supposed to be the one who decides how hurt you are, and neither am I. A doctor decides that, and until one does, nobody knows what we're dealing with.",
    why: "Take the judgment off both of you and hand it to the right authority.",
  },
  {
    objection: "Can you call me back later?",
    line: "I can, absolutely. The only thing that changes between now and then is that we lose a day, and days are the one thing nobody can get back for you. We're most of the way through it, let's finish while I've got you.",
    why: "Say yes, then make the cost of waiting concrete and small.",
  },
  {
    objection: "I don't have time right now.",
    line: "I hear you, and I'm not going to keep you. What's left is a few minutes, and it's the only few minutes in this whole thing that costs you nothing. Let's knock it out and get you back to your day.",
    why: "Never argue with a busy person. Shrink the ask and name the end.",
  },
  {
    objection: "What if nothing comes of it?",
    line: "Then you're standing exactly where you're standing right now, and it hasn't cost you a dollar. That's the whole reason it works this way. The only version of this where you lose is the one where you never asked.",
    why: "Make the downside explicit and boring. Fear thrives on the unnamed.",
  },
  {
    objection: "I've never done anything like this before.",
    line: "Almost nobody has. That's the point of calling somebody who does it every single day. You only have to do this once, and you don't have to do any of it alone.",
    why: "Normalize the inexperience instead of reassuring past it.",
  },
  {
    objection: "I need to find my paperwork first.",
    line: "We'll get all of that, and it won't be today. None of it changes whether we can get started. Let's get the file open, and the paperwork catches up to us.",
    why: "Separate starting from completing. Most stalls are people confusing the two.",
  },
  {
    objection: "How much is this going to cost me?",
    line: "Nothing out of your pocket, not today and not later. There's no bill from us and no fee unless there's a recovery. That's the arrangement, and it's the same for everybody.",
    why: "Answer plainly and immediately. Any hedging here reads as a catch.",
  },
  {
    objection: "I already talked to somebody about this.",
    line: "Tell me a little about that, because it matters. If you've already signed with a firm, I'll tell you straight and we'll leave it alone. If you just talked, that's a different thing entirely.",
    why: "Do not assume representation. Separate a conversation from a signature before you do anything else.",
  },
];

export function randomRebuttal(): Rebuttal {
  return REBUTTALS[Math.floor(Math.random() * REBUTTALS.length)];
}
