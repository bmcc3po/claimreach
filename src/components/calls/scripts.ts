// ============================================================================
// The lines the agent reads out after the intake questions: how we work, the
// agreement, walking her through signing, and the close. Written once here so
// Guided and Simple Chorelist say the same words. Question and script wording
// is Brett's: never change it without his approval (AGENTS.md).
// ============================================================================

export const OPEN_LINE = { label: "Say, then stop talking", line: "Tell me what happened.", cue: "Let her run. Capture anything below, in any order." };

export const MONEY = {
  label: "Say, before she asks",
  line: "Let me tell you real quick how we work, because people always want to know. We don't charge you anything up front. We only get paid at the very end out of the settlement, so nothing comes out of your pocket at any point, and if there's nothing recovered you don't owe us anything.",
  cue: "Don't bring up the split. Never name a dollar amount. Never do the math out loud.",
};

export const SEND_LINE = "Here's what I'm going to do. I'm sending your agreement over right now so we can get this open today and start pulling that report for you. Are you better by text or by email?";

export const STAY = { label: "Stay on the line", line: "Go ahead and put me on speaker and I'll walk you through it, it's short." };

export const walkThrough = (firm: string) => [
  `You should see a text from ${firm} with a link. Tap that link.`,
  "There's a highlighted box at the bottom of that first page. Tap it, draw your signature with your finger, and hit create.",
  "Then there's one more on page two. That one is just your authorization for us to go pull the accident report and your records so nobody's asking you to chase paperwork.",
];

export const NO_DEAD_AIR = [
  "While you're looking at that, let me tell you what happens on your end this week.",
  "Your case manager is going to reach out to introduce herself, and we'll go ahead and start working on getting that report pulled.",
  "And if you're hurting, we can get you in with somebody local just to get looked at, no cost to you out of pocket. That's up to you, nobody's making you go anywhere.",
];

export const SIGNED = { label: "Signed. Say", line: "Perfect, I've got that back on my end. Thank you.", cue: "Now you collect. A caller who has signed will give you anything." };

export const closeLines = (first: string, firm: string) => [
  `Okay ${first}, I've got everything I need from you. Your case manager is going to reach out tomorrow or the day after at the latest to introduce herself and go over next steps. She may come from a different number, and if she can't reach you she'll text you so you can just reply with a good time.`,
  "We just like to remind our clients of a couple of things. First, stay off social media about the accident. It's the first place the other insurance company will look to try to discredit you.",
  `Next, and this is the most important one. You do not need to speak with the other insurance company, or your own. If they call, just politely say, please call my attorney at ${firm}.`,
  "Your only job now is to focus on getting treated and feeling better. We'll handle the rest.",
  "Anything you need in the meantime, you call me right back at this number.",
  "I appreciate your time today. I hope you start feeling better.",
];
export const CLOSE_CUE = "Nothing good happens after the close.";
