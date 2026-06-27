// ============================================================================
// SILVER LINERS — the silver linings, the one-liners. A deep bench of hopeful,
// folksy, recovery-rooted, and famous sayings an agent can hand a caller at the
// right moment to get them through the call and the day. A BANDAGE, not surgery.
// We are not therapists. If a line helps someone hold on until they see their
// therapist tomorrow, that's a home run. Used right, it defuses, offers hope,
// or buys time until help arrives. Searchable by mood/keyword.
// Shared with Maverick too.
// ============================================================================

export interface SilverLiner {
  line: string;
  when: string;        // the moment it fits
  framing?: string;    // optional delivery, e.g. "My papi always said..."
  source?: string;     // attribution if famous
}

export interface SilverGroup {
  id: string;
  label: string;
  intro: string;
  liners: SilverLiner[];
}

export const SILVER_LINERS: SilverGroup[] = [
  {
    id: "overwhelm", label: "Overwhelmed / too much at once",
    intro: "Shrink the world down to right now.",
    liners: [
      { line: "One day at a time.", when: "Overwhelmed by the whole road ahead.", source: "AA/NA" },
      { line: "How do you eat an elephant? One bite at a time.", when: "A huge task is paralyzing them." },
      { line: "You don't have to see the whole staircase, just take the first step.", when: "The future feels impossible.", source: "Martin Luther King Jr." },
      { line: "Inch by inch it's a cinch; yard by yard it's hard.", when: "Trying to do it all at once." },
      { line: "You can't pour from an empty cup.", when: "They feel they have nothing left to give." },
      { line: "Feelings are like waves; you can't stop them coming, but you can learn to surf.", when: "Flooded by emotion.", source: "Jon Kabat-Zinn" },
      { line: "Easy does it.", when: "Pushing too hard, too fast.", source: "AA" },
      { line: "First things first.", when: "Everything feels equally urgent.", source: "AA" },
      { line: "Do the next right thing, just the next one.", when: "The big picture is too heavy to hold." },
      { line: "You only have to get through the next five minutes.", when: "The day feels unsurvivable." },
      { line: "When you're going through hell, keep going.", when: "They want to stop in the worst of it.", source: "Winston Churchill" },
      { line: "My grandma used to say: you can only carry one bag of groceries at a time, so put some down.", when: "They're carrying everything at once.", framing: "My grandma used to say..." },
      { line: "Yard by yard, life is hard. Inch by inch, it's a cinch.", when: "Breaking a big thing into small steps." },
      { line: "The way out is through.", when: "They want to avoid the hard part.", source: "Robert Frost" },
    ],
  },
  {
    id: "hope", label: "Lost hope / helpless",
    intro: "Offer a glimmer, gently, never forced. 'Helpless, not hopeless.'",
    liners: [
      { line: "Every day is another chance.", when: "They feel it's too late." },
      { line: "Rock bottom can become the foundation you rebuild on.", when: "They feel they've hit bottom.", source: "J.K. Rowling" },
      { line: "The fact that you're on this call means part of you is still fighting.", when: "They say they've given up." },
      { line: "The darkest hour is just before the dawn.", when: "In despair." },
      { line: "You've survived 100% of your worst days so far.", when: "They doubt they can keep going." },
      { line: "This too shall pass.", when: "A feeling seems permanent." },
      { line: "Every storm runs out of rain.", when: "They feel the hard part will never end.", source: "Maya Angelou" },
      { line: "A setback is just a setup for a comeback.", when: "They just got knocked down again." },
      { line: "Just because you're struggling doesn't mean you're failing.", when: "They equate pain with failure." },
      { line: "Stars can't shine without darkness.", when: "In a dark stretch." },
      { line: "Tough times never last, but tough people do.", when: "They feel they can't outlast this.", source: "Robert Schuller" },
      { line: "Fall down seven times, stand up eight.", when: "They keep getting knocked back.", source: "Japanese proverb" },
      { line: "Hope is being able to see that there is light despite all of the darkness.", when: "They can't see any way forward.", source: "Desmond Tutu" },
      { line: "Once you choose hope, anything's possible.", when: "They've written off the future.", source: "Christopher Reeve" },
      { line: "Helpless isn't hopeless. You feel stuck, but stuck isn't the end.", when: "They feel completely powerless." },
      { line: "Keep your face always toward the sunshine and shadows will fall behind you.", when: "They're fixated on the dark.", source: "Walt Whitman" },
    ],
  },
  {
    id: "selfworth", label: "Shame / self-blame / not good enough",
    intro: "Counter it gently and specifically. None of it was their fault.",
    liners: [
      { line: "Progress, not perfection.", when: "Beating themselves up for not being 'fixed.'", source: "AA/NA" },
      { line: "You are not what happened to you; you're what you do next.", when: "Identity fused with the trauma.", source: "Carl Jung (paraphrase)" },
      { line: "None of this was your fault. You were surviving.", when: "They blame themselves for what was done to them." },
      { line: "You wouldn't talk to a friend the way you're talking to yourself right now.", when: "Harshly self-critical." },
      { line: "Guilt says I did something bad; shame says I am bad. You are not bad.", when: "Shame is swallowing them.", source: "Brené Brown" },
      { line: "You did the best you could with what you had at the time.", when: "Judging their past self." },
      { line: "Your worth isn't up for debate, not even by you.", when: "They feel worthless." },
      { line: "Comparison is the thief of joy.", when: "Measuring themselves against others.", source: "Theodore Roosevelt" },
      { line: "We're all just walking each other home.", when: "They feel like a burden.", source: "Ram Dass" },
      { line: "No one can make you feel inferior without your consent.", when: "They've absorbed someone's cruelty.", source: "Eleanor Roosevelt" },
      { line: "You've been criticizing yourself for years and it hasn't worked. Try approving of yourself and see what happens.", when: "Stuck in self-attack.", source: "Louise Hay" },
      { line: "My papi always said a stumble is not a fall, it's just the ground reminding you you're still walking.", when: "They feel a slip defines them.", framing: "My papi always said..." },
    ],
  },
  {
    id: "grounding", label: "Panic / spiraling / can't think",
    intro: "Short, physical, present-tense. Break the spin.",
    liners: [
      { line: "HALT, are you Hungry, Angry, Lonely, or Tired? Sometimes the feeling is really one of those.", when: "Emotions run hot for no clear reason.", source: "AA/NA" },
      { line: "You can't think your way out of this; let's breathe our way through the next minute.", when: "Racing thoughts." },
      { line: "Right now, in this exact moment, are you safe? Let's start there.", when: "Fear of the future swallows the present." },
      { line: "Name five things you can see. Let's come back to the room.", when: "Dissociating or panicking." },
      { line: "This feeling is real, but it's not forever.", when: "An emotion feels permanent." },
      { line: "You are not your thoughts; you're the one noticing them.", when: "Fused to a spiraling thought." },
      { line: "Feel it, don't feed it.", when: "Amplifying a feeling by replaying it.", source: "Recovery saying" },
      { line: "Don't believe everything you think.", when: "Their thoughts are turning on them." },
      { line: "One breath at a time. That's the only job right now.", when: "Everything is too much." },
      { line: "Worry is a rocking chair: it gives you something to do but gets you nowhere.", when: "Caught in catastrophizing.", source: "Folk saying" },
    ],
  },
  {
    id: "connection", label: "Alone / nobody cares",
    intro: "Your presence is the proof against it.",
    liners: [
      { line: "You don't have to do this alone, and you're not alone right now.", when: "They feel abandoned by everyone." },
      { line: "Reaching out today was brave; that took strength you might not even feel.", when: "They downplay calling." },
      { line: "We're only as sick as our secrets, and you just let some light in.", when: "They've disclosed something hard.", source: "AA/NA" },
      { line: "Asking for help isn't weakness; it's how the strong stay standing.", when: "Ashamed they needed to call." },
      { line: "You matter. Full stop.", when: "They feel invisible or disposable." },
      { line: "A burden shared is a burden halved.", when: "They apologize for 'dumping' on you.", source: "Folk saying" },
      { line: "You are worth the effort it takes to help you.", when: "They feel they're not worth anyone's time." },
      { line: "Connection is the opposite of addiction, and you just made one.", when: "Someone in recovery reaches out.", source: "Johann Hari (paraphrase)" },
      { line: "Alone we can do so little; together we can do so much.", when: "They feel they have to face it solo.", source: "Helen Keller" },
    ],
  },
  {
    id: "recovery", label: "Addiction / substance struggles",
    intro: "No moralizing, just the wisdom of the rooms.",
    liners: [
      { line: "One day at a time. And if a day's too long, one hour.", when: "Sobriety feels impossible to sustain.", source: "AA/NA" },
      { line: "Relapse can be part of the story, not the end of it.", when: "Ashamed of a slip." },
      { line: "You don't have to be ready to be willing, and willing is enough for today.", when: "Too weak to change." },
      { line: "Progress, not perfection. Nobody gets a clean run.", when: "Discouraged by setbacks.", source: "AA/NA" },
      { line: "Don't pick up before you put down the phone, that's the only goal right now.", when: "White-knuckling a craving." },
      { line: "Play the tape forward.", when: "Romanticizing a relapse.", source: "Recovery saying" },
      { line: "Your worst day sober beats your best day using.", when: "They doubt sobriety is worth it.", source: "Recovery saying" },
      { line: "It works if you work it.", when: "They feel recovery isn't working.", source: "AA/NA" },
      { line: "We don't regret the past nor wish to shut the door on it.", when: "Stuck in shame over their history.", source: "AA Promises" },
      { line: "More will be revealed.", when: "They can't see how it works out yet.", source: "AA" },
      { line: "Take what you need and leave the rest.", when: "Overwhelmed by advice.", source: "AA/NA" },
      { line: "The only requirement is a desire to stop.", when: "They feel too far gone to qualify for help.", source: "AA" },
      { line: "Stick with the winners.", when: "Talking about who they surround themselves with.", source: "AA/NA" },
      { line: "FEAR: Face Everything And Recover, or Forget Everything And Run.", when: "They're scared to face it.", source: "Recovery acronym" },
      { line: "Fall down seven times, get up eight. That's recovery.", when: "Ashamed of multiple attempts." },
    ],
  },
  {
    id: "strength", label: "Feel their own strength",
    intro: "Reflect their strength back to them.",
    liners: [
      { line: "You're braver than you believe, stronger than you seem, and smarter than you think.", when: "They underestimate themselves.", source: "A.A. Milne" },
      { line: "Scars are proof you survived.", when: "Ashamed of what they've been through." },
      { line: "The same boiling water that softens the potato hardens the egg, it's about what you're made of.", when: "They feel broken by hardship." },
      { line: "A smooth sea never made a skilled sailor.", when: "They resent how hard it's been.", source: "Franklin D. Roosevelt" },
      { line: "Turn your wounds into wisdom.", when: "Ready to find meaning.", source: "Oprah Winfrey" },
      { line: "Courage isn't the absence of fear; it's feeling it and showing up anyway.", when: "They feel like a coward for being scared." },
      { line: "You can't go back and change the beginning, but you can start where you are and change the ending.", when: "They feel doomed by their past.", source: "C.S. Lewis" },
      { line: "Out of difficulties grow miracles.", when: "In the thick of hardship.", source: "Jean de La Bruyère" },
      { line: "You may not control all the events that happen to you, but you can decide not to be reduced by them.", when: "They feel defined by what happened.", source: "Maya Angelou" },
      { line: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", when: "They feel small against their past.", source: "Ralph Waldo Emerson" },
    ],
  },
  {
    id: "acceptance", label: "Fighting what they can't control",
    intro: "The serenity lane. Let go of the unchangeable.",
    liners: [
      { line: "Grant me the serenity to accept the things I cannot change, courage to change the things I can, and wisdom to know the difference.", when: "Torn up over what they can't control.", source: "Serenity Prayer" },
      { line: "Let go or be dragged.", when: "White-knuckling something they can't control.", source: "Zen proverb" },
      { line: "You can't control the waves, but you can learn to surf.", when: "Life keeps coming at them.", source: "Jon Kabat-Zinn" },
      { line: "Acceptance is the answer to all my problems today.", when: "Resisting reality.", source: "AA Big Book" },
      { line: "Not my circus, not my monkeys.", when: "Carrying someone else's chaos.", source: "Polish proverb" },
      { line: "Surrender isn't giving up; it's giving over.", when: "They think letting go means quitting." },
      { line: "Expectations are premeditated resentments.", when: "Hurt that things didn't go as planned.", source: "Recovery saying" },
      { line: "Pain is inevitable; suffering is optional.", when: "Adding a story on top of the hurt.", source: "Buddhist proverb" },
      { line: "Worrying does not take away tomorrow's troubles; it takes away today's peace.", when: "Lost in anxiety about the future." },
    ],
  },
  {
    id: "happiness", label: "Life, happiness & keep-going wisdom",
    intro: "Broader life and happiness quotes that lift a chin and reframe the day.",
    liners: [
      { line: "Whatever you do, do it well.", when: "They've lost pride in themselves.", source: "Walt Disney" },
      { line: "The simplest things are often the truest.", when: "They're overcomplicating their pain.", source: "Richard Bach" },
      { line: "Your time is limited, so don't waste it living someone else's life.", when: "They feel trapped by others' expectations.", source: "Steve Jobs" },
      { line: "The only way to do great work is to love what you do, and that starts with loving yourself a little.", when: "They've given up on themselves.", source: "Steve Jobs (adapted)" },
      { line: "Happiness is not something ready made. It comes from your own actions.", when: "Waiting for happiness to arrive.", source: "Dalai Lama" },
      { line: "Turn your face to the sun and the shadows fall behind you.", when: "Fixated on the dark.", source: "Māori proverb" },
      { line: "In the middle of difficulty lies opportunity.", when: "They can only see the difficulty.", source: "Albert Einstein" },
      { line: "Believe you can and you're halfway there.", when: "They doubt they can.", source: "Theodore Roosevelt" },
      { line: "The best way out is always through.", when: "They want to run from the hard part.", source: "Robert Frost" },
      { line: "Happiness can be found even in the darkest of times, if one only remembers to turn on the light.", when: "In a dark stretch.", source: "Albus Dumbledore" },
      { line: "It always seems impossible until it's done.", when: "A goal feels unreachable.", source: "Nelson Mandela" },
      { line: "Just keep swimming.", when: "They want to stop and can't see the shore.", source: "Dory, Finding Nemo" },
      { line: "Every accomplishment starts with the decision to try.", when: "Afraid to even begin.", source: "John F. Kennedy" },
      { line: "You miss 100% of the shots you don't take.", when: "Afraid to try for help or change.", source: "Wayne Gretzky" },
      { line: "Hard times don't create heroes. It's during hard times that the hero within us is revealed.", when: "They don't feel strong enough.", source: "Bob Riley" },
      { line: "It's not whether you get knocked down; it's whether you get up.", when: "They got knocked down again.", source: "Vince Lombardi" },
      { line: "You're off to great places, today is your day, your mountain is waiting, so get on your way.", when: "They need a nudge forward.", source: "Dr. Seuss" },
    ],
  },
  {
    id: "folksy", label: "Folksy & 'my papi always said'",
    intro: "Personal-framing sayings. Delivered as a human sharing, not a counselor reciting, they earn a smile and lower the wall.",
    liners: [
      { line: "This too shall pass, and like a kidney stone, it might hurt on the way out, but it WILL pass.", when: "They need a little laugh in the dark.", framing: "My papi always said..." },
      { line: "Can't never could.", when: "They keep saying 'I can't.'", framing: "My grandma always said...", source: "Southern saying" },
      { line: "You can't unscramble eggs, so quit trying to fix yesterday and cook something good today.", when: "Stuck replaying the past.", framing: "My papi always said..." },
      { line: "Every old dog has one good fight left in him.", when: "They feel too worn down to keep going.", framing: "My grandpa used to say..." },
      { line: "The Lord didn't bring you this far to leave you.", when: "They feel forsaken (if they're faith-leaning).", framing: "My grandma always said...", source: "Folk/gospel saying" },
      { line: "Just because you're in a valley doesn't mean you've lost the mountain.", when: "A low stretch feels like the whole story.", framing: "My papi always said..." },
      { line: "A bend in the road is not the end of the road, unless you fail to make the turn.", when: "They think a setback is the end.", source: "Helen Keller" },
      { line: "You don't drown by falling in the water; you drown by staying there.", when: "They feel a slip means they failed.", framing: "My papi always said...", source: "Edwin Louis Cole" },
      { line: "Smooth roads never made good drivers.", when: "They resent how hard it's been.", framing: "My grandpa always said..." },
      { line: "Worry is like a rocking chair, lots of motion, never gets you anywhere.", when: "Spinning in worry.", framing: "My grandma always said...", source: "Folk saying" },
      { line: "Storms make trees take deeper roots.", when: "They feel battered by hardship.", source: "Dolly Parton" },
      { line: "Bloom where you're planted.", when: "Stuck in a hard situation they can't change yet.", framing: "My grandma always said...", source: "Folk saying" },
    ],
  },
];

// Flat list for "surprise me" / peppering.
export const ALL_LINERS: SilverLiner[] = SILVER_LINERS.flatMap((g) => g.liners);

export function randomLiner(): SilverLiner {
  return ALL_LINERS[Math.floor(Math.random() * ALL_LINERS.length)];
}

// Full-text search across line, the "when" moment, framing, source, and group.
export function searchLiners(query: string): { group: SilverGroup; liner: SilverLiner }[] {
  const q = (query || "").toLowerCase().trim();
  const out: { group: SilverGroup; liner: SilverLiner }[] = [];
  for (const g of SILVER_LINERS) {
    for (const l of g.liners) {
      const hay = `${l.line} ${l.when} ${l.framing ?? ""} ${l.source ?? ""} ${g.label} ${g.intro}`.toLowerCase();
      if (!q || hay.includes(q)) out.push({ group: g, liner: l });
    }
  }
  return out;
}

// Loose mood-match for the in-the-moment surface (keyword -> group).
export function linersFor(text: string): SilverLiner[] {
  const t = (text || "").toLowerCase();
  const map: [string, string[]][] = [
    ["overwhelm", ["overwhelm", "too much", "can't handle", "everything", "drowning", "so much"]],
    ["hope", ["hope", "no point", "give up", "given up", "why bother", "hopeless", "helpless", "dark", "pointless"]],
    ["selfworth", ["fault", "shame", "blame", "my fault", "failed", "worthless", "guilt", "stupid", "not good enough"]],
    ["grounding", ["panic", "spiral", "racing", "breathe", "can't think", "dissociat", "freaking"]],
    ["connection", ["alone", "nobody", "no one", "lonely", "by myself", "burden"]],
    ["recovery", ["drink", "drug", "using", "sober", "relapse", "craving", "addict", "high"]],
    ["strength", ["weak", "can't do", "not strong", "broken", "scared", "coward"]],
    ["acceptance", ["control", "can't change", "unfair", "let go", "stuck", "powerless"]],
    ["happiness", ["happy", "happiness", "meaning", "purpose", "future", "try", "keep going"]],
    ["folksy", ["smile", "laugh", "lighten"]],
  ];
  for (const [gid, kws] of map) if (kws.some((k) => t.includes(k))) return SILVER_LINERS.find((g) => g.id === gid)?.liners ?? [];
  return [];
}
