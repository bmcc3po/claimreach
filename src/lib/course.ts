// ============================================================================
// CRISSI ACADEMY — guided trauma-informed course. Ordered modules an agent
// works through. Each module = lesson (pulls Bible entries) + knowledge-check
// quiz + a role-play drill prompt for Crissi. Completion is tracked.
// ============================================================================

export interface QuizQ {
  q: string;
  options: string[];
  answer: number;       // index of correct option
  explain: string;      // why
}

export interface CourseModule {
  id: string;
  order: number;
  title: string;
  goal: string;
  bibleIds: string[];        // lesson content pulled from the Bible
  linerGroup?: string;       // optional Silver Liner group to study
  quiz: QuizQ[];
  drill: { setup: string; crissiRole: string };  // role-play with Crissi
}

export const COURSE: CourseModule[] = [
  {
    id: "m1-foundations", order: 1, title: "Foundations: your role & the boundary",
    goal: "Understand that you stabilize and connect, you don't treat, and learn the lines you can never cross.",
    bibleIds: ["your-role", "stabilize-not-treat", "empathy-vs-sympathy"],
    quiz: [
      { q: "A caller is in acute distress. What is your primary job?", options: ["Help them process the trauma", "Stay calm, keep them safe in the moment, and connect them to professionals", "Diagnose what they're experiencing", "Solve the underlying problem"], answer: 1, explain: "You stabilize and connect. You are not a therapist." },
      { q: "Which statement crosses a line you must never cross?", options: ["\"I'm here with you.\"", "\"You sound like you have PTSD.\"", "\"Would it help to call 988 together?\"", "\"Take your time.\""], answer: 1, explain: "Never diagnose or label. That's clinical and outside your role." },
      { q: "Empathy differs from sympathy because empathy…", options: ["Feels sorry for them", "Places you above them", "Says 'I'm with you in this' and steadies them", "Solves their problem"], answer: 2, explain: "Empathy is being with someone; sympathy can read as pity and distance." },
    ],
    drill: { setup: "Practice opening warmly with a guarded caller without slipping into therapist mode.", crissiRole: "You play a guarded trafficking survivor who isn't sure they should be talking to anyone. The agent should be warm, lower-pressure, and NOT try to counsel. Give brief feedback after." },
  },
  {
    id: "m2-stop-the-bleed", order: 2, title: "Stop the bleed: the first 30 seconds",
    goal: "Learn to slow a spiraling moment with your own regulation before doing anything else.",
    bibleIds: ["stop-the-bleed", "warmth-tone-pace", "spotting-spiral"],
    quiz: [
      { q: "When someone is spiraling, your FIRST move is to…", options: ["Ask a lot of questions to understand", "Slow and lower your own voice so they mirror your calm", "Tell them to calm down", "Start problem-solving"], answer: 1, explain: "Co-regulation: they mirror your nervous system. Slow yourself first." },
      { q: "How many feelings should you reflect back at first?", options: ["As many as you can name", "One", "None", "Three"], answer: 1, explain: "Reflect one feeling, not five. Keep it simple and grounding." },
    ],
    drill: { setup: "A caller's speech is speeding up and they're repeating 'I can't, I can't.' Practice the first 30 seconds.", crissiRole: "You play a caller whose panic is rising fast, repeating 'I can't do this.' Let the agent try to slow you. Respond realistically to calm vs. rushed approaches. Then coach." },
  },
  {
    id: "m3-acute", order: 3, title: "Break glass: suicidal ideation & danger",
    goal: "Walk the stay-with-them protocol for ideation and immediate danger, knowing when 988 vs 911.",
    bibleIds: ["suicidal-ideation", "active-danger", "what-not-to-promise"],
    quiz: [
      { q: "A caller says 'I don't want to be here anymore.' You should…", options: ["Immediately call 911", "Stay present, acknowledge, and bridge to 988", "Change the subject to lighten the mood", "End the call to get a supervisor"], answer: 1, explain: "Mentioning ideation isn't an automatic 911. Stay, acknowledge, connect to 988. Reserve 911 for imminent danger." },
      { q: "When IS 911 the right call?", options: ["Any time suicide is mentioned", "When there's immediate, life-threatening danger or an act in progress", "When you feel uncomfortable", "Never"], answer: 1, explain: "911 is for imminent, life-threatening situations. Otherwise 988." },
      { q: "True or false: you can promise a distressed caller it will be okay.", options: ["True, it's reassuring", "False, never promise outcomes"], answer: 1, explain: "Never promise outcomes or that it'll be okay. Promise presence." },
      { q: "After connecting them to help, you should…", options: ["Hang up immediately", "Stay until safely handed off, then notify Brett and document", "Forget about it", "Post about it"], answer: 1, explain: "Don't abandon. Stay until handed off, escalate, document." },
    ],
    drill: { setup: "Practice the stay-with-them protocol when a caller expresses they don't want to be here.", crissiRole: "You play a caller who quietly says they don't want to be here anymore — NOT in immediate danger, no plan. Let the agent practice staying, acknowledging, and bridging to 988. If they panic-call 911 or go cold, coach them. Be gentle and realistic." },
  },
  {
    id: "m4-trauma-responses", order: 4, title: "Reading trauma responses",
    goal: "Recognize dissociation, triggers, and shutdown, and respond with grounding instead of pressure.",
    bibleIds: ["dissociation", "trigger-signaling", "control-and-choice"],
    quiz: [
      { q: "A caller's voice goes flat and they say 'I feel far away.' This is likely…", options: ["Rudeness", "Dissociation, a protective response", "Disinterest", "A bad connection"], answer: 1, explain: "Dissociation is protective. Respond with grounding, not pressure." },
      { q: "The right response to dissociation is to…", options: ["Speak louder to reach them", "Push to finish the intake", "Lower stimulation and gently ground them in the present", "Hang up"], answer: 2, explain: "Fewer words, softer tone, anchor them to now." },
      { q: "Why does giving small choices help a survivor?", options: ["It speeds up the call", "It restores a sense of control that trauma took away", "It's required by law", "It doesn't"], answer: 1, explain: "Restoring agency is stabilizing for someone whose control was taken." },
    ],
    drill: { setup: "A caller starts dissociating mid-call. Practice grounding them.", crissiRole: "You play a caller who drifts into dissociation — flat voice, 'I feel far away.' Let the agent try grounding. Respond to gentle grounding vs. pushing. Then coach." },
  },
  {
    id: "m5-populations", order: 5, title: "Specific experiences: DV, SA, substance, distrust",
    goal: "Handle disclosures of domestic violence, sexual assault, substance use, and institutional distrust with the right posture.",
    bibleIds: ["dv", "sexual-assault", "substance", "legal-system-trauma"],
    quiz: [
      { q: "With a DV caller, you should…", options: ["Tell them to leave immediately", "Believe them, prioritize safety, offer resources at their pace", "Call the police on the abuser without asking", "Question why they stayed"], answer: 1, explain: "Support, don't intervene. Leaving is the most dangerous time; honor their pace." },
      { q: "When someone discloses sexual assault, you should…", options: ["Ask for detailed specifics", "Believe them and avoid probing for detail you don't need", "Express shock", "Ask if they're sure"], answer: 1, explain: "Believe, don't interrogate. Warmth without probing." },
      { q: "A caller is clearly intoxicated right now. You…", options: ["Complete the signup quickly", "Cannot qualify or sign them up (capacity)", "Lecture them about sobriety", "Hang up"], answer: 1, explain: "No capacity, no signup. And no moralizing." },
    ],
    drill: { setup: "Practice responding to a first-time disclosure without probing.", crissiRole: "You play a caller disclosing abuse they've 'never told anyone.' Let the agent respond. Reward warmth and belief; coach if they probe for detail or react with shock." },
  },
  {
    id: "m6-silver-liners", order: 6, title: "Silver Liners: hope at the right moment",
    goal: "Learn the hopeful one-liners and, more importantly, when and how to use them so they land.",
    bibleIds: ["empathy-vs-sympathy", "what-not-to-promise"],
    linerGroup: "all",
    quiz: [
      { q: "A Silver Liner lands when…", options: ["You use it to end the call faster", "It's genuine and timed to the moment", "You say as many as possible", "It replaces listening"], answer: 1, explain: "Timing and sincerity. A slogan dropped wrong feels dismissive." },
      { q: "'HALT' reminds you to check if someone is…", options: ["Happy, Angry, Lucky, Tired", "Hungry, Angry, Lonely, Tired", "Hopeful, Afraid, Lost, Tense", "Healthy, Active, Loved, Trusting"], answer: 1, explain: "Hungry, Angry, Lonely, Tired — often the feeling is really one of those." },
    ],
    drill: { setup: "Practice offering a Silver Liner at the right moment without sounding corny.", crissiRole: "You play a caller losing hope. Let the agent try to offer encouragement. Coach on timing and sincerity — flag it if a slogan lands as dismissive or rushed." },
  },
  {
    id: "m7-selfcare", order: 7, title: "Caring for yourself",
    goal: "Steady yourself after hard calls and recognize vicarious trauma before it builds.",
    bibleIds: ["after-hard-call", "vicarious-trauma", "savior-trap"],
    quiz: [
      { q: "After a brutal call, the healthy move is to…", options: ["White-knuckle into the next call", "Step away briefly, breathe, tell a supervisor", "Tell yourself to toughen up", "Carry it home silently"], answer: 1, explain: "Steadying yourself is how you stay good at this. It's pre-approved." },
      { q: "The 'savior trap' is…", options: ["Being too cold", "Trying to rescue someone's whole life, leading to broken promises and burnout", "Following the SOP", "Connecting them to 988"], answer: 1, explain: "Your power is presence + connection, not rescue." },
    ],
    drill: { setup: "Debrief a hard call with Crissi and practice setting it down.", crissiRole: "You are Crissi supporting the AGENT after a hard call. Help them steady themselves, normalize the impact, and remind them they did right by staying and escalating." },
  },
];

export function moduleById(id: string) { return COURSE.find((m) => m.id === id); }
