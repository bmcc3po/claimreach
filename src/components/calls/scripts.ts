// ============================================================================
// The lines the agent reads out after the intake questions: how we work, the
// agreement, walking the PNC through signing, and the close. Written once here so
// Guided and Simple Chorelist say the same words. Question and script wording
// is Brett's: never change it without his approval (AGENTS.md).
// ============================================================================

export const OPEN_TONE = "Say it with empathy, warmth, and concern";
export const openGreeting = (first: string) => `Hi, is this ${first}?`;
export const openLine = (first: string, agent: string, firm: string) => `${first}, this is ${agent} with the ${firm} Intake Center. I'm reaching out about the car accident information we just received. Tell me what happened.`;
export const OPEN_CUE = "The last four words are the whole open. You do not ask if now is a good time.";

export const OPEN_LINE = { label: "Say, then stop talking", line: "Tell me what happened.", cue: "Let the PNC run. Capture anything below, in any order." };

export const MONEY = {
  label: "Say, before the PNC asks",
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

export const SIGNED = { label: "Signed. Say", line: "Perfect, I've got that back on my end. Thank you. Let me just make sure it came back correctly.", cue: "Open the signed retainer below, approve the copy or flag a problem, then finish the office step." };

export const closeLines = (_first: string, _firm: string) => [
  "Perfect, you're all set with the agreement. I'm getting your file ready for your team now so they can get started. A couple things and I'll let you go. You're going to hear these reminders again because they're important:",
  "If the other driver's insurance company calls you, you don't have to talk to them. Give them our number and we'll take it from there.",
  "Stay off social media about the accident. No posts, no pictures, nothing about how you're feeling.",
  "The most important piece of this is getting yourself healthy. You focus on your treatment; the firm will focus on everything else.",
];
export const CLOSE_CUE = "If asked: Your case manager will reach out in the next 24–48 business hours.";
