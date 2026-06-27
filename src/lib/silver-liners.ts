// ============================================================================
// SILVER LINERS — the silver linings, the one-liners. A deep bench of folksy,
// hopeful, recovery-rooted sayings an agent can hand a caller at the right
// moment to lift a chin and break the spell. Organized by WHEN to reach for one.
// Use with warmth and timing — a slogan lands only when genuine, never to rush
// or dismiss. Read the room first.
// ============================================================================

export interface SilverLiner {
  line: string;
  when: string;        // the moment it fits
  note?: string;       // how to deliver / where it comes from
}

export interface SilverGroup {
  id: string;
  label: string;
  intro: string;
  liners: SilverLiner[];
}

export const SILVER_LINERS: SilverGroup[] = [
  {
    id: "overwhelm", label: "When it all feels like too much",
    intro: "For the caller drowning in everything at once. Shrink the world down to right now.",
    liners: [
      { line: "One day at a time.", when: "Overwhelmed by the whole road ahead.", note: "The classic. 'One hour' or 'one breath at a time' when a day is too long." },
      { line: "How do you eat an elephant? One bite at a time.", when: "A huge task is paralyzing them." },
      { line: "You don't have to see the whole staircase, just take the first step.", when: "The future feels impossible.", note: "Often attributed to Dr. King." },
      { line: "Inch by inch it's a cinch; yard by yard it's hard.", when: "They're trying to do it all at once." },
      { line: "You can't pour from an empty cup.", when: "They feel they have nothing left to give." },
      { line: "Feelings are like waves; you can't stop them coming, but you can learn to surf.", when: "They're flooded by emotion." },
      { line: "Keep it simple.", when: "They're overcomplicating an impossible situation." },
      { line: "First things first.", when: "Everything feels equally urgent." },
      { line: "Easy does it.", when: "They're pushing too hard, too fast." },
      { line: "Do the next right thing, just the next one.", when: "The big picture is too heavy to hold." },
      { line: "You only have to get through the next five minutes.", when: "The day feels unsurvivable." },
      { line: "When you're going through hell, keep going.", when: "They want to stop in the worst of it.", note: "Churchill flavor — say it with grit and warmth." },
    ],
  },
  {
    id: "hope", label: "When they've lost hope",
    intro: "For the caller who can't see a way forward. Offer a glimmer, gently, never forced.",
    liners: [
      { line: "Every day is another chance.", when: "They feel it's too late." },
      { line: "Rock bottom can become the foundation you rebuild on.", when: "They feel they've hit bottom." },
      { line: "The fact that you're on this call means part of you is still fighting.", when: "They say they've given up." },
      { line: "The darkest hour is just before the dawn.", when: "They're in despair." },
      { line: "You've survived 100% of your worst days so far.", when: "They doubt they can keep going." },
      { line: "This too shall pass.", when: "A feeling seems permanent.", note: "Ancient, and true — say it softly." },
      { line: "Hope is a muscle; we'll start with one rep.", when: "Hope feels impossible." },
      { line: "Every storm runs out of rain.", when: "They feel the hard part will never end." },
      { line: "Not all who wander are lost.", when: "They feel directionless and ashamed of it." },
      { line: "A setback is a setup for a comeback.", when: "They just got knocked down again." },
      { line: "The comeback is always stronger than the setback.", when: "They're discouraged by a relapse or loss." },
      { line: "Just because you're struggling doesn't mean you're failing.", when: "They equate pain with failure." },
      { line: "Stars can't shine without darkness.", when: "They're in a dark stretch." },
      { line: "Tough times never last, but tough people do.", when: "They feel they can't outlast this." },
      { line: "Fall down seven times, stand up eight.", when: "They keep getting knocked back.", note: "Japanese proverb." },
    ],
  },
  {
    id: "selfworth", label: "When they're carrying shame or blame",
    intro: "For the caller weighed down by guilt or self-blame. Counter it gently and specifically.",
    liners: [
      { line: "Progress, not perfection.", when: "They beat themselves up for not being 'fixed.'" },
      { line: "You are not what happened to you; you're what you do next.", when: "Their identity is fused with the trauma." },
      { line: "Shame dies when stories are told in safe places, and this is a safe place.", when: "They're ashamed to speak." },
      { line: "None of this was your fault. You were surviving.", when: "They blame themselves for what was done to them." },
      { line: "Falling down is part of it; staying down isn't who you are.", when: "They feel they failed by struggling." },
      { line: "You wouldn't talk to a friend the way you're talking to yourself right now.", when: "They're harshly self-critical." },
      { line: "Guilt says I did something bad; shame says I am bad. You are not bad.", when: "Shame is swallowing them." },
      { line: "You did the best you could with what you had at the time.", when: "They're judging their past self." },
      { line: "Your worth isn't up for debate, not even by you.", when: "They feel worthless." },
      { line: "Comparison is the thief of joy.", when: "They're measuring themselves against others." },
      { line: "We're all just walking each other home.", when: "They feel they're a burden.", note: "Ram Dass — warm and leveling." },
      { line: "A diamond is a chunk of coal that did well under pressure.", when: "They feel crushed by what they've endured." },
    ],
  },
  {
    id: "grounding", label: "When they need to get out of the spin",
    intro: "Short, physical, present-tense reminders to break a spiral or panic.",
    liners: [
      { line: "HALT, are you Hungry, Angry, Lonely, or Tired? Sometimes the feeling is really one of those.", when: "Emotions run hot for no clear reason.", note: "Recovery classic. Naming it shrinks it." },
      { line: "You can't think your way out of this; let's breathe our way through the next minute.", when: "Racing thoughts." },
      { line: "Right now, in this exact moment, are you safe? Let's start there.", when: "Fear of the future swallows the present." },
      { line: "Name five things you can see. Let's come back to the room.", when: "Dissociating or panicking.", note: "Pairs with the dissociation walkthrough." },
      { line: "This feeling is real, but it's not forever.", when: "An emotion feels permanent." },
      { line: "You are not your thoughts; you're the one noticing them.", when: "They're fused to a spiraling thought." },
      { line: "Feel it, don't feed it.", when: "They're amplifying a feeling by replaying it." },
      { line: "Get out of your head and into the moment.", when: "They're lost in worry." },
      { line: "One breath at a time. That's the only job right now.", when: "Everything is too much." },
      { line: "Worrying is praying for what you don't want.", when: "They're catastrophizing." },
      { line: "Don't believe everything you think.", when: "Their thoughts are turning on them." },
    ],
  },
  {
    id: "connection", label: "When they feel utterly alone",
    intro: "For the caller who believes no one cares. Your presence is the proof against it.",
    liners: [
      { line: "You don't have to do this alone, and you're not alone right now.", when: "They feel abandoned by everyone." },
      { line: "Reaching out today was brave; that took strength you might not even feel.", when: "They downplay calling." },
      { line: "We're only as sick as our secrets, and you just let some light in.", when: "They've disclosed something hard." },
      { line: "Asking for help isn't weakness; it's how the strong stay standing.", when: "Ashamed they needed to call." },
      { line: "You matter. Full stop.", when: "They feel invisible or disposable." },
      { line: "A burden shared is a burden halved.", when: "They apologize for 'dumping' on you." },
      { line: "There is no shame in needing a hand. We all do.", when: "They feel weak for struggling." },
      { line: "You are worth the effort it takes to help you.", when: "They feel they're not worth anyone's time." },
      { line: "Connection is the opposite of addiction, and you just made one.", when: "Someone in recovery reaches out." },
    ],
  },
  {
    id: "recovery", label: "Recovery & substance struggles",
    intro: "For callers in or around addiction. No moralizing, just the wisdom of the rooms.",
    liners: [
      { line: "One day at a time. And if a day's too long, one hour.", when: "Sobriety feels impossible to sustain." },
      { line: "Relapse can be part of the story, not the end of it.", when: "They're ashamed of a slip.", note: "Reduce shame; shame fuels use." },
      { line: "You don't have to be ready to be willing, and willing is enough for today.", when: "They feel too weak to change." },
      { line: "Progress, not perfection. Nobody gets a clean run.", when: "Discouraged by setbacks." },
      { line: "Don't pick up before you put down the phone, that's the only goal right now.", when: "White-knuckling a craving." },
      { line: "Play the tape forward.", when: "They're romanticizing a relapse.", note: "Picture how it actually ends, not just the first hit." },
      { line: "Your worst day sober beats your best day using.", when: "They doubt sobriety is worth it." },
      { line: "It works if you work it.", when: "They feel recovery isn't working." },
      { line: "Stick with the winners.", when: "Talking about who they surround themselves with." },
      { line: "FEAR: Face Everything And Recover, or Forget Everything And Run, your choice today.", when: "They're scared to face it." },
      { line: "We don't regret the past nor wish to shut the door on it.", when: "Stuck in shame over their history.", note: "AA Promises." },
      { line: "More will be revealed.", when: "They can't see how it works out yet." },
      { line: "Take what you need and leave the rest.", when: "They're overwhelmed by advice." },
      { line: "The only requirement is a desire to stop.", when: "They feel too far gone to qualify for help." },
      { line: "Half measures availed us nothing.", when: "They're trying to do it halfway.", note: "AA — say with compassion, not judgment." },
    ],
  },
  {
    id: "strength", label: "When they need to feel their own strength",
    intro: "For the caller who's stronger than they know. Reflect it back to them.",
    liners: [
      { line: "You're braver than you believe, stronger than you seem, and smarter than you think.", when: "They underestimate themselves.", note: "A.A. Milne flavor." },
      { line: "Scars are proof you survived.", when: "They're ashamed of what they've been through." },
      { line: "You've been assigned this mountain to show others it can be moved.", when: "They wonder why this happened to them." },
      { line: "The same boiling water that softens the potato hardens the egg, it's about what you're made of.", when: "They feel broken by hardship." },
      { line: "A smooth sea never made a skilled sailor.", when: "They resent how hard it's been." },
      { line: "What's coming is better than what's gone.", when: "They're stuck looking backward." },
      { line: "Turn your wounds into wisdom.", when: "They're ready to find meaning.", note: "Oprah." },
      { line: "Courage isn't the absence of fear; it's feeling it and showing up anyway.", when: "They feel like a coward for being scared." },
      { line: "You can't go back and change the beginning, but you can start where you are and change the ending.", when: "They feel doomed by their past.", note: "C.S. Lewis flavor." },
    ],
  },
  {
    id: "acceptance", label: "When they're fighting what they can't control",
    intro: "For the caller exhausting themselves against the immovable. The serenity lane.",
    liners: [
      { line: "Grant me the serenity to accept the things I cannot change, courage to change the things I can, and wisdom to know the difference.", when: "They're torn up over what they can't control.", note: "The Serenity Prayer — the bedrock." },
      { line: "Let go or be dragged.", when: "They're white-knuckling something they can't control." },
      { line: "You can't control the waves, but you can learn to surf.", when: "Life keeps coming at them." },
      { line: "Acceptance is the answer to all my problems today.", when: "They're resisting reality.", note: "AA Big Book." },
      { line: "Not my circus, not my monkeys.", when: "They're carrying someone else's chaos.", note: "Polish proverb — a little levity." },
      { line: "Surrender isn't giving up; it's giving over.", when: "They think letting go means quitting." },
      { line: "Expectations are premeditated resentments.", when: "They're hurt that things didn't go as planned." },
      { line: "Pain is inevitable; suffering is optional.", when: "They're adding a story on top of the hurt." },
    ],
  },
];

// Flat list for "surprise me" / peppering.
export const ALL_LINERS: SilverLiner[] = SILVER_LINERS.flatMap((g) => g.liners);

export function randomLiner(): SilverLiner {
  return ALL_LINERS[Math.floor(Math.random() * ALL_LINERS.length)];
}

// Loose match a moment to relevant liners (for the in-the-moment surface).
export function linersFor(text: string): SilverLiner[] {
  const t = (text || "").toLowerCase();
  const map: [string, string[]][] = [
    ["overwhelm", ["overwhelm", "too much", "can't handle", "everything", "drowning", "so much"]],
    ["hope", ["hope", "no point", "give up", "given up", "why bother", "hopeless", "dark", "pointless"]],
    ["selfworth", ["fault", "shame", "blame", "my fault", "failed", "worthless", "guilt", "stupid"]],
    ["grounding", ["panic", "spiral", "racing", "breathe", "can't think", "dissociat", "freaking"]],
    ["connection", ["alone", "nobody", "no one", "lonely", "by myself", "burden"]],
    ["recovery", ["drink", "drug", "using", "sober", "relapse", "craving", "addict", "high"]],
    ["strength", ["weak", "can't do", "not strong", "broken", "scared", "coward"]],
    ["acceptance", ["control", "can't change", "unfair", "let go", "stuck", "powerless"]],
  ];
  for (const [gid, kws] of map) if (kws.some((k) => t.includes(k))) return SILVER_LINERS.find((g) => g.id === gid)?.liners ?? [];
  return [];
}
