// ============================================================================
// THE METHOD — Innovative Intake's extraction doctrine.
//
// The rest of the Bible teaches you how to hold someone steady. This teaches
// you how to get a qualified, signable file out of them while doing the least
// damage possible on the way through.
//
// These are BibleEntry objects and are merged into the searchable Bible.
// Group: "method".
// ============================================================================

import type { BibleEntry } from "./bible";

export const DOCTRINE_ENTRIES: BibleEntry[] = [
  {
    id: "least-harm",
    group: "method",
    title: "Least harm is the goal, not most detail",
    keywords: ["least harm", "doctrine", "method", "how much", "goal", "philosophy", "get in get out"],
    summary:
      "You are not a counselor and you are not a documentarian. You are here to establish that this person qualifies, capture the facts the firm cannot get anywhere else, and get them off the phone with less weight on them than a bad interviewer would leave. Every extra minute you spend inside the worst thing that ever happened to them is a cost. Spend only what the file requires.",
    say: [
      "\"I'm going to ask specific questions. Short answers are fine. We'll be quick.\"",
      "\"That's what I needed. Moving on.\"",
      "\"You don't have to describe more than the question asks.\"",
    ],
    avoid: [
      "Asking for more color because it makes a better story",
      "\"Tell me everything from the beginning\" when you need one date",
      "Letting a long answer run because you feel rude cutting in",
      "Treating silence as an invitation to dig",
    ],
    whatToListenFor: [
      "The moment the answer has satisfied the criterion — that is your exit",
      "Voice flattening, going fast and shallow, or going somewhere else entirely",
    ],
    why:
      "Re-telling is not free. Every unnecessary pass through the event costs the caller something and buys the file nothing. A tight, respectful interview also gets signed more often than a long one.",
    hardLines: [
      "Never ask for detail the criteria do not require.",
      "Never ask a question twice because you weren't writing.",
    ],
  },
  {
    id: "no-scab-picking",
    group: "method",
    title: "Don't pick the scab",
    keywords: ["scab", "reliving", "detail", "graphic", "probing", "dig", "re-traumatize"],
    summary:
      "There is a difference between a fact that proves an element and a detail that only makes the call heavier. \"Penetration, yes or no\" is an element. \"Walk me through exactly what he did\" is a scab. Ask the element. If the answer is clear, stop. If the answer is vague, ask one narrowing question, not a tour.",
    say: [
      "\"I have to ask one clinical question so the firm can categorize this correctly.\"",
      "\"Yes or no is enough here.\"",
      "\"Was it once, or more than once?\"",
    ],
    avoid: [
      "\"And then what happened?\" when you already have what you need",
      "Following an emotional thread because it opened up",
      "Asking a survivor to characterize their own trauma for you",
      "Silence-fishing for more after a complete answer",
    ],
    whatToListenFor: [
      "Volunteered detail — write it, don't chase it",
      "\"I don't want to talk about that part\" — that is a full stop, not a hurdle",
    ],
    pitfalls: [
      "Confusing a vivid file with a strong file. The firm needs elements met and the perpetrator identifiable, not prose.",
    ],
    why:
      "Unstructured re-telling is where the real damage in this work happens, and it is almost always the interviewer's choice, not the caller's need.",
  },
  {
    id: "how-much-is-enough",
    group: "method",
    title: "How much is enough",
    keywords: ["enough", "detail", "specificity", "criteria", "qualify", "when to stop"],
    summary:
      "Enough is the point where an attorney reading your note can check the box without calling the client back. Not a syllable more. For each criterion, know the shape of the answer that closes it before you ask the question.",
    steps: [
      { label: "Know the target", detail: "Before you ask, know what a closing answer sounds like. Criterion: penetration. Closing answer: a yes to one of the listed categories. That's it." },
      { label: "Ask narrow", detail: "Ask the narrowest question that can produce a closing answer. Narrow questions are easier to answer under stress, not harder." },
      { label: "Confirm once", detail: "Read it back in your words: \"So that was oral, more than once, by the same officer. Correct?\" One confirmation, then move." },
      { label: "Bank the volunteered", detail: "Anything they add on their own goes in the note. You did not ask for it, so it cost them nothing extra." },
      { label: "Leave the rest", detail: "Anything still missing that the criteria do not require is the attorney's follow-up, not yours." },
    ],
    say: [
      "\"Let me read that back so I don't make you repeat it.\"",
      "\"That's everything I need on that. Next question.\"",
    ],
    avoid: ["Open-ended narrative prompts for closed criteria", "Re-asking to \"make sure\" when you already confirmed"],
    why: "A file gets rejected for missing elements, not for missing atmosphere.",
  },
  {
    id: "flinch-control",
    group: "method",
    title: "Your reaction is the interview",
    keywords: ["reaction", "flinch", "gasp", "shock", "neutral", "poker face", "tone"],
    summary:
      "The caller is reading you constantly for whether this is the moment you start treating them differently. A gasp, a long sympathetic sigh, a shift into a softer voice, or \"oh my God\" all tell them the same thing: you were not ready for this, and now you are handling them. They shut down or they perform. Stay exactly as level after the disclosure as before it.",
    say: [
      "\"Okay. Thank you.\" (same tone as every other acknowledgment)",
      "\"Got it.\"",
      "\"That makes sense.\"",
    ],
    avoid: [
      "\"Oh my God\" / \"That's horrible\" / \"I'm so sorry that happened to you\" mid-interview",
      "Dropping your voice into a hush after they disclose",
      "Long pauses that read as you gathering yourself",
      "Any version of \"I can't imagine\"",
    ],
    whatToListenFor: [
      "Them checking on you: \"Is that too much?\" — answer flat and reassuring, then continue",
      "Them escalating detail to test your reaction",
    ],
    why:
      "Level is the kindest thing you can be. It tells them nothing they said changed how you see them, and it keeps them able to finish.",
    hardLines: ["Save your reaction for after the call. Have one, just not on the line."],
  },
  {
    id: "clinical-language",
    group: "method",
    title: "Say the clinical word so they don't have to",
    keywords: ["clinical", "language", "words", "penetration", "euphemism", "permission", "wording"],
    summary:
      "When a question requires a specific sexual act to be named, you name it. Offer it as a checkbox, not an essay prompt. Making the caller find the word themselves is where people freeze, minimize, or use a euphemism that makes the file unusable.",
    say: [
      "\"I have to ask this clinically. Did the contact include vaginal penetration, anal penetration, oral, or masturbation? You can just say which ones.\"",
      "\"Was there skin-to-skin contact, or over clothing?\"",
      "\"I'll use the clinical words so you don't have to.\"",
    ],
    avoid: [
      "\"What exactly did he do to you?\"",
      "\"Can you describe the contact?\" for a criterion that is a yes or no",
      "Accepting \"he messed with me\" or \"stuff happened\" as a final answer",
      "Apologizing three times before asking — it signals the question is shameful",
    ],
    pitfalls: [
      "Euphemism in the note. \"Inappropriate touching\" is not a category. Write the category the criteria list.",
    ],
    why:
      "Precision here is the entire qualification. A softened answer gets the file declined and forces someone else to call and ask again.",
  },
  {
    id: "containment",
    group: "method",
    title: "Containing the story without dismissing it",
    keywords: ["ramble", "contain", "redirect", "off track", "long answer", "interrupt", "control the call"],
    summary:
      "People who have never been believed will tell you everything at once. Letting it run is not kindness, it is a longer call and a worse file. Contain with a bridge: acknowledge in four words, name what you need, ask the next question. Never let the redirect sound like a correction.",
    steps: [
      { label: "Acknowledge short", detail: "\"I hear you.\" or \"That matters.\" Four words, level tone." },
      { label: "Name the need", detail: "\"I want to make sure the attorney has this in the right place.\"" },
      { label: "Ask forward", detail: "Immediately follow with the next specific question. Do not leave a gap for the story to resume." },
      { label: "Park the rest", detail: "\"At the end I'll ask if there's anything else your attorney should know. Hold that for me.\" Then actually ask it." },
    ],
    say: [
      "\"I hear you. Let me get this in the right box — what year did that start?\"",
      "\"Hold that thought, I want to make sure it lands in the notes. First, one date.\"",
      "\"We'll have a spot at the end for anything I didn't ask about.\"",
    ],
    avoid: [
      "\"Let's stay on track\" (reads as a scolding)",
      "Talking over them",
      "Silently waiting for them to run out",
      "Promising an open-ended section you never come back to",
    ],
    why: "Containment protects the caller too. An unstructured hour costs them far more than a structured fifteen minutes.",
  },
  {
    id: "breakdown-recovery",
    group: "method",
    title: "When they break mid-answer",
    keywords: ["crying", "break down", "cant continue", "pause", "recover", "overwhelmed"],
    summary:
      "Expect it. Do not treat it as an emergency and do not treat it as nothing. Give them the floor for a moment, offer a real choice about how to continue, and then resume from where you were, not from the top.",
    steps: [
      { label: "Stop talking", detail: "Let a few seconds pass. Do not fill it with reassurance." },
      { label: "Offer the choice", detail: "\"We can take a minute, we can skip this one and come back, or we can pick it up another day. Your call.\"" },
      { label: "Take yes for an answer", detail: "If they pick the break, take the break. If they pick skip, skip it and note it. If they say keep going, keep going." },
      { label: "Resume precisely", detail: "\"We were on the year it started.\" Never make them re-establish context." },
    ],
    say: [
      "\"Take your time. I'm not going anywhere.\"",
      "\"We can skip that one. It's not the whole case.\"",
      "\"You're doing fine. We were on the year it started.\"",
    ],
    avoid: [
      "\"Don't cry\" or \"it's okay\"",
      "Rushing to finish while they're still off balance",
      "Making them re-tell what they had already gotten out",
      "Pushing through a hard stop to save the call",
    ],
    escalate:
      "If distress becomes acute — hopelessness, self-harm talk, dissociation — leave the script entirely and go to the Crisis SOP. The file is not the priority in that moment.",
    why: "A caller who is allowed to stop and come back finishes. A caller who is pushed hangs up and does not answer again.",
  },
  {
    id: "dq-without-damage",
    group: "method",
    title: "Closing a call that doesn't qualify",
    keywords: ["dq", "disqualify", "decline", "doesn't qualify", "no", "close", "reject"],
    summary:
      "A person who just disclosed abuse should never hear that they do not qualify from you. You are not the decision maker and you should not sound like one. Finish cleanly, tell them what actually happens next, and never characterize their case.",
    say: [
      "\"Thank you for going through that with me. I'm sending everything to the legal team for review, and someone will follow up with you.\"",
      "\"I'm not the person who makes that call — my job is to get it in front of them accurately.\"",
      "\"Nothing you told me was wrong or not enough. There are specific requirements on this particular case that have nothing to do with what you went through.\"",
    ],
    avoid: [
      "\"You don't qualify\" / \"We can't help you\"",
      "Explaining the criteria so they can guess what answer would have worked",
      "Going cold or wrapping up fast the second you hit a disqualifier",
      "Any promise about outcome, value, or timing",
    ],
    whatToListenFor: ["Them sensing the shift and asking if something is wrong — stay level and give them the same close you'd give anyone"],
    pitfalls: [
      "Telling them the criteria invites a corrected story on the next call, which poisons the file and the campaign.",
    ],
    why:
      "Being told you don't count, right after telling a stranger the worst thing that happened to you, is its own injury. It also costs nothing to close well.",
    hardLines: ["Never state or imply a qualification decision to the caller.", "Never coach a caller toward a qualifying answer."],
  },
];
