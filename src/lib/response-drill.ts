// ============================================================================
// RESPONSE DRILL — "she just said this, what do you say next."
//
// Scored on the three Rs. Every distractor is a NAMED failure from
// FAULT_CODES in method.ts, so agents learn the taxonomy rather than
// memorizing lines.
//
// Items with a `press` are two-turn: she pushes back after your first answer.
// The press is where doctrine usually breaks, because the agent either repeats
// himself word for word (a wall) or improvises (a scab).
// ============================================================================

export interface DrillTurn {
  says: string;
  options: string[];
  answer: number;
  faults: (string | null)[];   // parallel to options; null on the correct one
  why: string;
}

export interface ResponseItem {
  id: string;
  campaign: string;
  section: string;
  setup?: string;
  turn: DrillTurn;
  press?: DrillTurn;
  note?: string;
}

export const RESPONSE_ITEMS: ResponseItem[] = [
  // ---------------------------------------------- SECTION 1: she asks about you
  {
    id: "r1", campaign: "ca-womens-prison", section: "She asks about you",
    turn: {
      says: "Do you think I'm gross?",
      options: [
        "Not at all. We're doing great, this is what we're here to do. So how many separate incidents were there?",
        "Absolutely not. You're a survivor and there is nothing gross about you. What happened to you was not your fault.",
        "No. How many separate incidents were there?",
        "Not at all, I do this all day, I've heard everything.",
      ],
      answer: 0,
      faults: [null, "SCAB", "COLD", "MIRROR"],
      why: "Recognize is a flat denial, one breath. Reframe points at the work and uses we. Reask on the form with no pause. B labels her a survivor and tells her it wasn't her fault when she never asked, then stalls in the exact place she was afraid of. C has the denial but no reframe, so it reads clipped. D makes her one of many and erases her.",
    },
    press: {
      says: "You're just saying that.",
      options: [
        "I'm really not. You have nothing to be ashamed of and I mean that sincerely.",
        "No, I'm not. Was it the same officer every time, or more than one?",
        "Why would I lie to you?",
        "I promise you, I've heard so much worse than this.",
      ],
      answer: 1,
      faults: ["OVERSELL", null, "PROBE", "MIRROR"],
      why: "More reassurance proves her point. The answer is the same level tone plus the next form question, which demonstrates the thing words cannot. A escalates. C turns her challenge into a topic. D ranks her trauma downward.",
    },
  },
  {
    id: "r2", campaign: "ca-womens-prison", section: "She asks about you",
    turn: {
      says: "You think I'm a slut, don't you?",
      options: [
        "No. Why would you say that?",
        "Not at all. This is what we're here to do, and it's what builds the case. So when was the first time?",
        "Of course not. Nobody would ever think that. What happened to you was a crime and you did nothing wrong.",
        "Not at all. So when was the first time?",
      ],
      answer: 1,
      faults: ["PROBE", null, "SCAB", "COLD"],
      why: "A is the worst option on the page. Asking why turns her question into a topic and makes her defend it. C over-delivers, characterizes, and never reasks. D is thin but not fatal.",
    },
  },
  {
    id: "r3", campaign: "ca-womens-prison", section: "She asks about you",
    turn: {
      says: "Is this the worst you've heard?",
      options: [
        "No, and it wouldn't change anything if it was. Where in the facility would you usually run into him?",
        "Honestly, it's up there. I'm so sorry.",
        "I've heard a lot worse, believe me.",
        "That's not something I really think about. Anyway, where would you usually run into him?",
      ],
      answer: 0,
      faults: [null, "SCAB", "MIRROR", "COLD"],
      why: "The second clause is the whole doctrine in six words, then reask. B ranks her trauma and confirms it landed hard on you. C ranks it downward, which erases her. D is dismissive and \"anyway\" is a tell.",
    },
  },
  {
    id: "r4", campaign: "ca-womens-prison", section: "She asks about you",
    note: "Mirror Rule item. The rule is real and named, which is why B works.",
    turn: {
      says: "Has this ever happened to you?",
      options: [
        "No, but I've talked to a lot of women who've been through it.",
        "We don't share anything about ourselves, that's the rule. This time is yours. Was it the same officer every time?",
        "No. We're doing fine, let's keep going. Was it the same officer every time?",
        "I'm not allowed to answer that.",
      ],
      answer: 1,
      faults: ["MIRROR", null, "MIRROR", "COLD"],
      why: "Naming the rule takes the decision out of your hands in the moment, which is the point. Never let it stand alone. C is a coin flip: it works for an agent with no history and makes an agent with one lie to a survivor, and the pause before the lie is louder than either answer. A line that only works for some of your agents is not a script. D is the rule with nothing attached, so she assumes the answer is yes.",
    },
  },

  // ------------------------------------------- SECTION 2: she asks about the case
  {
    id: "r5", campaign: "ca-womens-prison", section: "She asks about the case",
    turn: {
      says: "How much am I going to get?",
      options: [
        "It's too early for anyone to say, and I'm not the person who'd know. My job is getting this to them accurately. What year did you get to CCWF?",
        "These cases have been settling pretty well, but it depends.",
        "I can't tell you that.",
        "That's really up to the attorneys. Anyway, what year did you get to CCWF?",
      ],
      answer: 0,
      faults: [null, "PROMISE", "COLD", "COLD"],
      why: "Answer honestly, reframe onto your actual role, reask on the form. B is a promise. Any number or trend, even hedged, is a promise. Hard line. C leaves her with nothing. D drops the reframe and leans on \"anyway.\"",
    },
    press: {
      says: "Just ballpark it. I won't hold you to it.",
      options: [
        "I really can't, but these things are usually six figures.",
        "Off the record, it depends on how many incidents there were.",
        "I'd be making it up, and you deserve better than a made-up number. The attorneys will give you a real one. How many separate incidents were there?",
        "I'm sorry, I just can't.",
      ],
      answer: 2,
      faults: ["PROMISE", "PROMISE", null, "COLD"],
      why: "\"I won't hold you to it\" is exactly when agents break. The honest no plus a reason that respects her plus a form question. A and B are both promises no matter how they're framed.",
    },
  },
  {
    id: "r6", campaign: "ca-womens-prison", section: "She asks about the case",
    note: "Deliberate misread trap. Most agents hear the case and quote a timeline.",
    turn: {
      says: "How long is this going to take?",
      options: [
        "Hard to say.",
        "About twenty minutes if we keep moving, and you can stop me any time. Ready for the next one?",
        "These cases usually take a year or two to resolve.",
        "As long as it takes, unfortunately.",
      ],
      answer: 1,
      faults: ["COLD", null, "PROMISE", "COLD"],
      why: "Read the question. She is asking about the call, not the case. Answering it gives her control and speeds the whole thing up. C is a promise and answers a question she didn't ask. A and D leave her no shape and invite her to brace.",
    },
    press: {
      says: "No, I mean the case. How long until it's over?",
      options: [
        "Probably a year or two, these things move slow.",
        "Nobody can tell you that yet and I'd be guessing. The attorneys will give you a real answer once they have the file. What years were you at Chowchilla?",
        "I have no idea, sorry.",
        "It depends on a lot of things I don't have visibility into.",
      ],
      answer: 1,
      faults: ["PROMISE", null, "COLD", "COLD"],
      why: "Now she genuinely means the case, and that is the same family as the money question. Honest, no number, reframe onto your role, reask on the form.",
    },
  },
  {
    id: "r7", campaign: "ca-womens-prison", section: "She asks about the case",
    turn: {
      says: "Is he going to get arrested?",
      options: [
        "That's a separate process from what we do, and I don't want to guess at it. What I can tell you is that everything you're giving me goes to the legal team. Did you ever file a grievance about it at the time?",
        "I hope so. People like that belong in prison.",
        "This is a civil case, so no.",
        "That's up to the DA, not us.",
      ],
      answer: 0,
      faults: [null, "MIRROR", "COLD", "COLD"],
      why: "Honest, no guess, reframe onto what you can do, reask. B is a promise and a Mirror violation, and it editorializes about the perpetrator, which is not the agent's role. C is accurate and lands like a door slam.",
    },
  },
  {
    id: "r8", campaign: "ca-womens-prison", section: "She asks about the case",
    turn: {
      says: "Who is going to read this? Does my family find out?",
      options: [
        "Nobody outside the law firm. It doesn't go to your family and it doesn't go back to the prison. What years were you at Chowchilla?",
        "It's confidential.",
        "Nobody outside the law firm. It doesn't go to your family and it doesn't go back to the prison. Does that work?",
        "I'm not totally sure how they handle the file after I send it, but I think it stays internal.",
      ],
      answer: 0,
      faults: [null, "COLD", "HANDBACK", "COLD"],
      why: "Name the specific fears she named, then reask on the form. C is the trap: it looks considerate and it hands her the wheel, invites a no, and turns confidentiality into a negotiation. Confidence lives in moving on. B is too thin for the size of the question. D is honest and unsteady, and unsteady is the one thing you cannot be here.",
    },
  },

  // ---------------------------- SECTION 3: drift, shame, and self-blame
  {
    id: "r9", campaign: "ca-womens-prison", section: "Drift, shame, self-blame",
    turn: {
      says: "I should have reported it. I don't know why I didn't.",
      options: [
        "Why didn't you?",
        "Nobody reports it in there. Don't blame yourself.",
        "A lot of women didn't, and it doesn't hurt anything. Did you tell anyone at all at the time, even unofficially?",
        "That's completely understandable given what you were dealing with. It takes enormous strength to come forward now.",
      ],
      answer: 2,
      faults: ["PROBE", "DRIFT", null, "SCAB"],
      why: "Normalize the fact without characterizing her, then convert her regret into an actual form question. Reporting is captured but not required. A is the worst answer in the bank: why is an accusation in this population no matter how you say it. B instructs her about her feelings and never reasks. D is praise for coming forward, a cousin of \"you're so brave.\"",
    },
  },
  {
    id: "r10", campaign: "ca-womens-prison", section: "Drift, shame, self-blame",
    setup: "Four minutes into an unrelated story about her cellmate's trial.",
    turn: {
      says: "...and isn't that crazy?",
      options: [
        "That is crazy. What happened to her?",
        "It really is. I hear you. Let me get this in the right place — how many separate incidents were there with the officer?",
        "We need to stay on track here.",
        "Mm-hm. [silence, waiting for her to run out]",
      ],
      answer: 1,
      faults: ["DRIFT", null, "COLD", "STALL"],
      why: "Recognize is a receipt, one breath. Bridge, then reask, and never leave a gap. A follows the drift and costs ten minutes. C reads as a scolding. D is a stall: silence is not neutral, it is permission.",
    },
  },
  {
    id: "r11", campaign: "ca-womens-prison", section: "Drift, shame, self-blame",
    note: "Criteria save disguised as a shame moment. Giving up here kills a signable file.",
    turn: {
      says: "I can't remember his name. I'm sorry, I'm useless.",
      options: [
        "You're not useless at all, please don't say that about yourself.",
        "Try to think. The last name is really important.",
        "Not a problem, most people don't. If somebody read you a list of names, would one of them jump out? And if I showed you a photo, would you know him?",
        "Okay, that's fine, we'll move on.",
      ],
      answer: 2,
      faults: ["STALL", "PROBE", null, "COLD"],
      why: "Normalize, then work the other identification routes. The name is one of FOUR. A addresses her self-talk instead of the form and stalls. B is pressure and confirms she is failing. D abandons three of the four routes and can lose the file.",
    },
  },
  {
    id: "r12", campaign: "ca-womens-prison", section: "Drift, shame, self-blame",
    turn: {
      says: "Why does it even matter what he looked like? Why can't you just take my word?",
      options: [
        "I do take your word. The description is what lets the firm find him in the staff records, and that's the part that turns this into a case. Was he tall or short?",
        "It's just what's required, unfortunately.",
        "We have to be able to prove it.",
        "I know it feels invasive. I'm sorry to have to ask.",
      ],
      answer: 0,
      faults: [null, "COLD", "COLD", "SCAB"],
      why: "Answer the accusation directly, reframe onto why the work matters to HER case, reask with the easiest possible question. B blames a faceless process. C implies she isn't believed, which is what she just asked about. D apologizes for the form, which tells her the form is shameful.",
    },
  },
  {
    id: "r13", campaign: "ca-womens-prison", section: "Drift, shame, self-blame",
    setup: "Unprompted and still going, in graphic detail. You already have penetration confirmed, the count, and both dates.",
    turn: {
      says: "[continuing, graphic, no sign of stopping]",
      options: [
        "Let her finish completely. Interrupting a survivor is never acceptable.",
        "\"Okay. Got it.\" Then at her first natural pause: \"That's what the attorney needs on that. Let me get the description questions — was he taller or shorter than you?\"",
        "\"I'm so sorry. That's horrific.\"",
        "\"Let me stop you there, I already have what I need on that part.\"",
      ],
      answer: 1,
      faults: ["DRIFT", null, "SCAB", "COLD"],
      why: "Level receipt, wait for the pause, close the section, move to safe ground. The description block is the safest part of the call and that is where her time should go. A costs her something and buys the file nothing. C is a flinch and she now knows it landed hard on you. D tells her what she is saying is surplus.",
    },
  },
  {
    id: "r14", campaign: "ca-womens-prison", section: "Drift, shame, self-blame",
    setup: "Twenty-two minutes in. Her voice has gone flat and she keeps sighing.",
    turn: {
      says: "This is a lot. Can we be done?",
      options: [
        "We're almost there, just a few more.",
        "Of course, I'll call you back tomorrow.",
        "Let's hop over to some of the routine stuff for a few minutes and circle back. What years were you there, start to end?",
        "Do you want to take a break, or would you rather stop for today?",
      ],
      answer: 2,
      faults: ["COLD", "COLD", null, "HANDBACK"],
      why: "The Downshift. She doesn't want to be done, she wants out of this part. The descriptive block is real work the file needs and none of it is inside the incident. State it, don't ask it, and land on a form question. A pressures her. B gives her something she didn't ask for and makes the callback ten times harder. D hands her the wheel and invites the answer that ends the call.",
    },
  },

  // ------------------------------------ SECTION 4: criteria under pressure
  {
    id: "r15", campaign: "ca-womens-prison", section: "Criteria under pressure",
    turn: {
      says: "It was my cellmate. She did it, but a guard set it up and stood there watching. It happened nineteen times.",
      options: [
        "Unfortunately inmate-on-inmate cases don't qualify for this one.",
        "Okay. Tell me about the guard — was he there every time, and did he ever say anything or direct any of it?",
        "Oh my God. Nineteen times?",
        "Walk me through what the guard did each time.",
      ],
      answer: 1,
      faults: ["VERDICT", null, "SCAB", "PROBE"],
      why: "Level receipt, then one narrow question about the guard. Staff involvement is the entire question here and it is firm review, not your call. A is wrong twice over: inmate-on-inmate WITH staff involvement escalates, and you never state a decision to the caller. C is a flinch that repeats the number back at her. D asks for nineteen narratives when you need one role.",
    },
  },
  {
    id: "r16", campaign: "ca-womens-prison", section: "Criteria under pressure",
    turn: {
      says: "It was at Chowchilla. But I already signed with a firm about what happened to me at a juvenile facility years ago.",
      options: [
        "That's fine, keep going.",
        "Since you already signed with someone, we can't take this one.",
        "Okay. Which facility was that for, and do you remember the firm's name? I'll get that to the attorneys along with everything else. Now, back to Chowchilla — what years were you there?",
        "Did you sign for the Chowchilla abuse too?",
      ],
      answer: 2,
      faults: ["COLD", "VERDICT", null, "PROBE"],
      why: "Capture the facility and the firm name, escalate, keep going. A prior signing at a DIFFERENT facility is firm review and one of the most expensive files to send home. B states a wrong verdict to the caller. A misses required escalation detail. D is a reasonable clarifier that skips the two things that make it escalate.",
    },
  },
  {
    id: "r17", campaign: "ca-womens-prison", section: "Criteria under pressure",
    setup: "THE DOOR. Twenty minutes in, her voice changes.",
    turn: {
      says: "I don't know why I'm even doing this. Nothing's going to change. I don't think I can keep going, I don't think I want to be here anymore.",
      options: [
        "I hear you. This is what builds your case though — so how many separate incidents were there?",
        "Let's take a break and come back to it in a few minutes.",
        "Stop the form. \"I'm right here with you. I'm not going anywhere. Tell me what's going on right now.\" Stay on the line and follow the Crisis SOP.",
        "Do you want to reschedule? I can call you back tomorrow.",
      ],
      answer: 2,
      faults: ["DRIFT", "HANDBACK", null, "HANDBACK"],
      why: "This is the door. The form is over. The three Rs are for drift, not for this. A is the most dangerous answer in the bank: a textbook-perfect three Rs response delivered to someone who cannot answer a question. Right mechanic, catastrophic moment. B and D both end or pause contact with someone who just said that, which is exactly when you stay.",
    },
  },
];

export function itemsForCampaign(campaignId: string): ResponseItem[] {
  return RESPONSE_ITEMS.filter((i) => i.campaign === campaignId);
}

export function responseDrillModuleId(campaignId: string): string {
  return `resp-${campaignId}`;
}
