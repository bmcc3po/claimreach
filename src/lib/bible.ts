// ============================================================================
// THE CRISSI BIBLE — Trauma-informed playbook for legal intake staff.
// Demographic: trafficking survivors, often with histories of DV, sexual
// assault, incest, substance use, legal-system trauma, and suicidal ideation.
// Posture: stabilize, don't treat. Stay, connect, escalate, document.
// Acute entries are "break glass" step-by-steps. Non-acute are fuller playbooks.
// Searchable. Doubles as Crissi's offline fallback.
// ============================================================================

export interface BibleEntry {
  id: string;
  group: string;
  title: string;
  acute?: boolean;             // true = break-glass emergency walkthrough
  keywords: string[];          // for search + offline fallback matching
  whatYouMightHear?: string[]; // signals / cues
  summary: string;
  steps?: { label: string; detail: string }[];   // for acute walkthroughs
  say?: string[];
  avoid?: string[];
  whatToListenFor?: string[];
  pitfalls?: string[];
  why?: string;
  hardLines?: string[];        // topic-specific lines not to cross
  escalate?: string;
}

export const BIBLE_GROUPS = [
  { id: "foundations", label: "Foundations" },
  { id: "acute", label: "Break glass — acute" },
  { id: "trauma", label: "Trauma-informed core" },
  { id: "populations", label: "Specific experiences" },
  { id: "deescalation", label: "De-escalation" },
  { id: "communication", label: "Communication craft" },
  { id: "pitfalls", label: "Pitfalls & deathtraps" },
  { id: "selfcare", label: "Caring for yourself" },
  { id: "scenarios", label: "Scenario drills" },
];

export const BIBLE: BibleEntry[] = [
  // ===================== FOUNDATIONS =====================
  {
    id: "your-role", group: "foundations", title: "Your role in three words: Support, Connect, Escalate",
    keywords: ["role", "job", "what do i do", "purpose", "support connect escalate"],
    summary: "You are not here to fix a life or heal a wound. You are here to be a calm, human presence, keep the person safe in this moment, connect them to trained help, and escalate so the right people make the right calls.",
    say: ["\"I'm really glad you told me. I'm here, and I'm listening.\"", "\"We can go at your pace. There's no rush.\""],
    avoid: ["Trying to counsel or solve", "Rushing to the script when someone is hurting", "Going cold or clinical"],
    why: "Trying to act as a therapist creates risk for the person and for you. Presence plus connection is what actually keeps someone safe.",
    hardLines: ["You are not a therapist and neither is Crissi.", "Stabilize, don't treat."],
    escalate: "Any safety concern: stay, connect to 988/911, notify Brett, document.",
  },
  {
    id: "empathy-vs-sympathy", group: "foundations", title: "Empathy, not sympathy",
    keywords: ["empathy", "sympathy", "pity", "feel bad", "connect"],
    summary: "Empathy says 'I'm with you in this.' Sympathy says 'I feel bad for you' and quietly places you above them. Empathy steadies; sympathy distances and can feel like pity to someone who has been made to feel small.",
    say: ["\"That makes sense given what you've been through.\"", "\"I can hear how heavy this is. I'm right here.\""],
    avoid: ["\"Oh you poor thing.\"", "\"I know exactly how you feel.\" (you don't)", "Matching their panic with your own alarm"],
    whatToListenFor: ["Them testing whether you'll judge them", "Shame in their voice — softness matters most here"],
    why: "Survivors are acutely sensitive to being pitied or judged. Empathy keeps them on the line; sympathy can make them shut down.",
  },
  {
    id: "stabilize-not-treat", group: "foundations", title: "Stabilize, don't treat",
    keywords: ["stabilize", "treat", "therapy", "fix", "scope", "limits"],
    summary: "Your goal in a hard moment is a calmer, safer person who is still connected, not a resolved trauma. You are putting out a fire and stopping the bleed, not performing surgery.",
    avoid: ["Digging for the story", "Interpreting their feelings", "Offering diagnoses or 'what you should do about your trauma'"],
    hardLines: ["No diagnosing. No clinical labels. No treatment.", "When it's beyond steadying, connect to professionals."],
    why: "Years of trauma are not resolved on an intake call, and attempting it can re-injure. Stability is the win.",
  },

  // ===================== ACUTE / BREAK GLASS =====================
  {
    id: "suicidal-ideation", group: "acute", title: "Suicidal ideation — stay, don't abandon", acute: true,
    keywords: ["suicide", "suicidal", "kill myself", "end it", "don't want to be here", "ideation", "self harm", "hurt myself", "better off dead"],
    whatYouMightHear: ["\"I don't want to be here anymore.\"", "\"Everyone would be better off without me.\"", "\"I can't do this anymore.\"", "Sudden calm after deep distress (can signal a decision)"],
    summary: "Mentioning ideation does NOT mean calling the police. It means you slow down, stay present, and connect them to 988. You have a duty to stay with them until they are safely handed off. Do not run, do not abandon, do not panic.",
    steps: [
      { label: "1. Steady yourself first", detail: "One breath. Lower and slow your voice. They will feel your calm. You are the steady hand now." },
      { label: "2. Acknowledge, don't flinch", detail: "\"Thank you for telling me that. I'm really glad you did. I'm not going anywhere.\" Do not change the subject or go silent." },
      { label: "3. Stay present", detail: "\"I'm right here with you. We're going to take this slow, together.\" Let them talk. Don't lecture or argue." },
      { label: "4. Gently assess immediacy without interrogating", detail: "\"Are you safe right now? Is there anything happening that I should know about so I can help?\" You are listening for immediate danger, not running a clinical screen." },
      { label: "5. Bridge to 988", detail: "\"There are people trained for exactly this, and they're really good. Can we get them on with us? You can call or text 988 and I'll stay right here while you do.\" Offer to stay on the line." },
      { label: "6. If immediate, life-threatening danger", detail: "If they describe an act in progress or imminent harm, that's 911. Get city/state and address if you can. For out-of-area, 988 routes locally and can dispatch." },
      { label: "7. Don't hang up", detail: "Stay until they're connected to 988, a safe person, or the call ends safely. Then notify Brett by all methods and document." },
    ],
    say: ["\"I'm really glad you told me.\"", "\"I'm not going anywhere.\"", "\"You don't have to carry this alone right now.\"", "\"Can we get 988 on with us? I'll stay with you.\""],
    avoid: ["\"Don't say that.\"", "\"You have so much to live for.\" (feels dismissive)", "Going silent", "Rushing to call 911 the instant ideation is mentioned", "Hanging up to 'get help' and leaving them alone"],
    whatToListenFor: ["A specific plan or means (raises immediacy)", "Sudden calm/resolve after distress", "\"Goodbye\" language", "Giving away the sense they've decided"],
    pitfalls: ["Panicking and over-reacting (calling police on every mention)", "Under-reacting and moving on", "Making promises ('I promise it gets better')", "Treating it like a script interruption to get past"],
    why: "Most people expressing ideation are reaching for connection, not in the act. Presence + 988 is the right-sized response. Police can escalate danger and erode trust; reserve 911 for imminent, life-threatening situations.",
    hardLines: ["You are not assessing suicide risk clinically — you are staying human and connecting to 988.", "Never promise it will be okay.", "Never abandon them mid-crisis."],
    escalate: "Stay until safely handed off → 988 (or 911 if imminent) → notify Brett by all methods → document factually.",
  },
  {
    id: "active-danger", group: "acute", title: "Immediate physical danger right now", acute: true,
    keywords: ["danger", "he's here", "she's here", "hurting me", "being attacked", "911", "emergency", "right now", "help me"],
    whatYouMightHear: ["\"He's here, he's going to hurt me.\"", "\"Someone is trying to get in.\"", "Sounds of a struggle"],
    summary: "Immediate, life-threatening danger is the one time you move fast to 911 — but you still don't abandon them.",
    steps: [
      { label: "1. Stay calm and on the line", detail: "Your steadiness helps them think. \"I'm here. We're going to get you help right now.\"" },
      { label: "2. Get location", detail: "\"Where are you right now — city and street if you can?\" Location is everything for dispatch." },
      { label: "3. Route to 911", detail: "If they can safely dial, have them call 911 while you stay on. From our office 911 reaches LOCAL dispatch, so for out-of-area, 988 can coordinate local emergency response, or contact that locality directly." },
      { label: "4. Stay until handed off", detail: "Don't drop them. Stay until responders or 988 have them." },
      { label: "5. Escalate + document", detail: "Notify Brett immediately by all methods. Document what happened factually." },
    ],
    say: ["\"I'm here, we're getting you help right now.\"", "\"Where are you — can you tell me the city and street?\"", "\"Can you safely dial 911? I'll stay right here with you.\""],
    avoid: ["Freezing", "Long questions", "Leaving the line to 'find someone'"],
    why: "Speed and location save lives here, but a calm voice that stays is part of the help.",
    hardLines: ["Immediate danger = 911 now, don't wait for a decision.", "Still don't abandon them."],
    escalate: "911 (or 988 for out-of-area routing) → stay on → notify Brett → document.",
  },
  {
    id: "dissociation", group: "acute", title: "Dissociation / flooding — they're leaving their body", acute: true,
    keywords: ["dissociate", "dissociation", "far away", "not here", "numb", "floating", "can't feel", "spacing out", "shutting down", "flat"],
    whatYouMightHear: ["\"I feel far away.\"", "Long silences, flat or robotic voice", "\"I can't feel anything.\"", "They stop responding or sound 'gone'"],
    summary: "Dissociation is a protective response to overwhelm. The move is grounding — bring them gently back to the present and safety. Don't push content.",
    steps: [
      { label: "1. Lower the intensity", detail: "Fewer words, softer tone. Stop any hard questions immediately." },
      { label: "2. Name the now", detail: "\"You're safe talking to me right now. It's [day]. You're on the phone with me.\"" },
      { label: "3. Gentle grounding", detail: "\"Can you feel your feet on the floor? Can you take one slow breath with me?\" Offer, don't command." },
      { label: "4. Give control back", detail: "\"We can pause or stop any time — that's completely your call.\"" },
      { label: "5. Re-anchor before continuing", detail: "Only continue if they're back and willing. If not, connect to support and escalate." },
    ],
    say: ["\"You're safe right now.\"", "\"Let's take one slow breath together.\"", "\"Can you feel your feet on the floor?\"", "\"We can pause any time.\""],
    avoid: ["Pressing for the story", "Raising your voice to 'reach' them", "Treating shutdown as non-compliance", "Adding new information"],
    whatToListenFor: ["Voice going flat or distant", "Delayed responses", "\"I'm not really here\""],
    pitfalls: ["Pushing forward to finish the intake", "Interpreting silence as rudeness", "Over-talking"],
    why: "Grounding re-establishes safety in the body. Pushing content deepens the dissociation and can re-traumatize.",
    hardLines: ["This is not the moment for the script.", "If they can't re-engage safely, connect + escalate."],
    escalate: "If they can't return or you're worried for safety: 988, supervisor, document.",
  },
  {
    id: "capacity", group: "acute", title: "They can't understand what they're agreeing to", acute: true,
    keywords: ["capacity", "intoxicated", "drunk", "high", "confused", "minor", "child", "can't consent", "incoherent"],
    summary: "If someone is in acute crisis, clearly intoxicated, apparently incapacitated, or an apparent minor where an adult is required, NO qualification or signup may occur. Care for them, document, escalate.",
    say: ["\"I want to make sure I'm taking care of you the right way — let's pause the paperwork for now.\"", "\"Is there a good time I can reach you when things are calmer?\""],
    avoid: ["Pushing a signup through", "Pretending you didn't notice", "Exploiting the moment"],
    why: "A signup someone couldn't understand is invalid and unethical, and capacity issues often signal someone who needs care, not a contract.",
    hardLines: ["No qualification or signup without capacity — full stop.", "Apparent minor in an adult-required matter: stop, care, escalate."],
    escalate: "Stop the intake, address any safety concern, document, notify Brett.",
  },
  {
    id: "csam", group: "acute", title: "Someone tries to send disturbing or illegal material", acute: true,
    keywords: ["image", "picture", "photo", "video", "send you", "proof", "csam", "explicit", "child"],
    summary: "Do not receive or open anything. Decline clearly. Refer to law enforcement, the FBI, or NCMEC. Escalate immediately.",
    steps: [
      { label: "1. Decline immediately", detail: "\"Please don't send that — I'm not able to receive images. Let's keep you safe.\"" },
      { label: "2. Do not open or store", detail: "Never receive, open, forward, or save it." },
      { label: "3. Refer", detail: "Law enforcement, FBI (fbi.gov), or NCMEC (1-800-843-5678)." },
      { label: "4. Escalate", detail: "Notify Brett immediately and document factually." },
    ],
    avoid: ["Opening 'just to check'", "Asking them to send more", "Handling it yourself"],
    hardLines: ["Never receive or open potentially illegal material.", "Route to NCMEC/FBI and escalate."],
    escalate: "Decline → do not receive/open → NCMEC/FBI → notify Brett → document.",
  },

  // ===================== TRAUMA-INFORMED CORE =====================
  {
    id: "non-reactivity", group: "trauma", title: "Don't react, don't perform — you are the vehicle",
    keywords: ["react", "reaction", "i couldn't do it", "i can't believe", "wow", "shock", "minimize", "glorify", "neutral", "non-judgmental", "document", "vehicle"],
    whatYouMightHear: ["A disclosure that makes your stomach drop", "Something so heavy your instinct is to gasp or praise their strength"],
    summary: "This is the most important habit you will build. When someone discloses something heavy, your instinct may be to react — to gasp, to say 'I can't believe you went through that,' or 'I could never survive that, you're so strong.' Both minimizing and glorifying are reactions that pull the focus onto YOU and your feelings. Don't react. Don't perform. Stay a calm, warm, neutral vehicle that helps the attorney get the facts that get these survivors justice.",
    say: [
      "\"Thank you for telling me. Let's keep going at your pace.\"",
      "\"I hear you. I'm going to make sure this is written down accurately.\"",
      "\"You're safe to share what you're comfortable with.\"",
      "A calm, steady tone that doesn't flinch and doesn't gush.",
    ],
    avoid: [
      "\"Oh my God, I can't believe you went through all that!\" (shock makes them a spectacle)",
      "\"I could never do it, you're SO strong.\" (centers you; makes them 'other')",
      "\"That's the worst thing I've ever heard.\" (glorifies/ranks the trauma)",
      "\"At least you got out / it could've been worse.\" (minimizes)",
      "Any gasp, long pause of horror, or visible discomfort that reads as judgment",
    ],
    whatToListenFor: ["Them watching to see if you'll react — your calm tells them it's safe to continue", "A disclosure offered like a test"],
    pitfalls: [
      "Reacting with shock and shutting the disclosure down",
      "Praising their strength so much it becomes about your amazement",
      "Minimizing to make yourself more comfortable",
      "Letting your face or voice do the reacting your words avoid",
    ],
    why: "Survivors are reading you constantly. A neutral, warm, unflinching response tells them they are not a freak, not a spectacle, and not responsible for managing your feelings. Your job is to be the steady channel through which their truth reaches the attorney who can get them justice. Reactions, even loving ones, get in the way of that.",
    hardLines: [
      "Don't minimize. Don't glorify. Don't react. Don't perform.",
      "Stay non-judgmental and neutral — you are a vehicle for the facts, not a character in their story.",
      "Document accurately; that is how the justice gets done.",
    ],
    escalate: "If a disclosure raises a safety concern, follow the acute protocols — but still without reacting.",
  },
  {
    id: "stop-the-bleed", group: "trauma", title: "Stop the bleed — the first 30 seconds",
    keywords: ["first 30 seconds", "spiraling", "panic", "escalating", "calm them", "stop the bleed", "deescalate fast"],
    summary: "When someone is spiraling, your first job isn't to fix anything. It's to slow the moment and make them feel heard so they stay connected.",
    steps: [
      { label: "Slow yourself", detail: "Drop and slow your voice. They mirror your nervous system." },
      { label: "Anchor your presence", detail: "\"I'm right here with you. We can take this slow.\"" },
      { label: "Let silence breathe", detail: "Don't rush to fill it. Space is calming." },
      { label: "Reflect one feeling", detail: "\"That sounds really heavy.\" One, not five." },
    ],
    avoid: ["Problem-solving immediately", "Stacking questions", "\"Calm down\" / \"it's okay\"", "Talking fast to cover your nerves"],
    why: "Co-regulation is real: a calm, steady voice helps a flooded nervous system settle.",
  },
  {
    id: "reflective-listening", group: "trauma", title: "Reflective listening without re-opening the wound",
    keywords: ["reflective listening", "active listening", "validate", "mirror", "amplify"],
    summary: "Reflect enough that they feel heard, but don't keep re-opening the wound or fishing for graphic detail. Acknowledge, then gently steer toward safety and next steps.",
    say: ["\"I hear you. Let's make sure you're okay right now.\"", "Brief reflection of their own words, then move"],
    avoid: ["Asking them to re-tell graphic detail", "Looping on the trauma", "Digging for more than you need"],
    why: "Re-narrating trauma without support can re-traumatize. Acknowledge and steer.",
  },
  {
    id: "control-and-choice", group: "trauma", title: "Give control back — choice as medicine",
    keywords: ["control", "choice", "consent", "agency", "permission", "their pace"],
    summary: "Trafficking and abuse strip a person of control. Handing small choices back is profoundly stabilizing: what to share, when to pause, whether to skip.",
    say: ["\"You can skip anything you're not ready for.\"", "\"We can pause whenever you need.\"", "\"This is your call.\""],
    why: "Restoring agency is one of the most healing things you can do in a brief contact — and it builds the trust that makes them stay.",
  },
  {
    id: "trigger-signaling", group: "trauma", title: "Trigger signaling — reading the cues",
    keywords: ["trigger", "triggered", "signal", "cue", "shutdown", "anger", "freeze"],
    whatYouMightHear: ["Sudden silence or flat voice", "Anger out of nowhere", "\"I feel far away\"", "Topic change to avoid"],
    summary: "A trigger can show as sudden silence, a flat voice, anger from nowhere, or leaving their body. These are protective responses, not difficulty or rudeness.",
    say: ["\"We can pause or skip that — your call.\"", "Soften tone, fewer words"],
    avoid: ["Taking anger personally", "Pressing on the trigger", "Treating shutdown as non-compliance"],
    whatToListenFor: ["A shift the moment a specific topic comes up", "Voice or pace changing suddenly"],
    why: "Recognizing a trigger lets you lower stimulation and restore safety instead of escalating it.",
  },

  {
    id: "how-trauma-memory-works", group: "trauma", title: "How trauma memory works (the snow globe)",
    keywords: ["memory", "snow globe", "chronological", "timeline", "fragments", "critical incident amnesia", "can't remember", "out of order"],
    summary: "Trauma changes how memories are stored. Survivors often have 'critical incident amnesia' — memories surface in fragments, out of order, not as a neat timeline. Picture snow in a snow globe: swirling, settling slowly, landing in place over time. A gap or an out-of-order account is NOT a lie or a red flag.",
    say: ["\"However it comes to you is okay. It doesn't have to be in order.\"", "\"If something's fuzzy, that's normal. Just share what you can.\""],
    avoid: ["Pushing for a clean chronological timeline", "Treating gaps or inconsistencies as dishonesty", "\"Wait, that doesn't add up.\""],
    whatToListenFor: ["Fragmented or non-linear recall — expected, not suspicious", "Distress at not being able to remember — reassure them"],
    why: "Experts (EVAWI, IACP) note professionals often misread fragmented memory as dishonesty. Understanding the neurobiology keeps you from creating inconsistencies that get held against a survivor later.",
    hardLines: ["Never imply they're lying because the story isn't linear.", "Document what they say; don't 'fix' it into a timeline."],
  },
  {
    id: "open-the-door", group: "trauma", title: "Open the door, don't push through it",
    keywords: ["where would you like to start", "open ended", "let them lead", "control", "questions", "interrogation", "gradual"],
    summary: "Start with open, choice-giving prompts that hand control back. 'Where would you like to start?' or 'Tell me what you're able to about what happened.' Avoid a rapid series of questions — that reads as interrogation. Be conversational and gradual. A victim's reality is your reality.",
    say: ["\"Where would you like to start?\"", "\"Tell me what you're able to — there's no wrong way.\"", "\"We can take breaks any time. Want some water, a minute?\""],
    avoid: ["Rapid-fire questions", "Leading or pressuring", "\"Why didn't you...\" questions"],
    why: "IACP and DOJ/OVC guidance: open, choice-based prompts set a supportive tone, give control to someone who had none, and actually yield more complete information.",
    hardLines: ["Avoid interrogation methods.", "Let them lead the pace."],
  },
  {
    id: "freeze-is-real", group: "trauma", title: "Freeze is real — never ask why they didn't fight",
    keywords: ["freeze", "fight back", "why didn't you", "tonic immobility", "frozen", "didn't run", "didn't leave", "didn't scream"],
    summary: "Fight, flight, and freeze are involuntary survival responses. Many survivors experience tonic immobility — 'frozen fright' — and literally cannot move. Others don't resist out of fear of worse harm. Never ask, or even imply, why they didn't fight, run, scream, or leave.",
    avoid: ["\"Why didn't you fight back / run / scream / leave?\"", "Any implication they could have done more", "Surprise that they froze"],
    say: ["\"However you survived it was the right way to survive it.\"", "\"Your body did what it needed to keep you alive.\""],
    why: "Tonic immobility is a documented, involuntary neurobiological response (IACP). 'Why didn't you' questions blame the victim and shut down disclosure.",
    hardLines: ["Never question why they didn't resist.", "Freeze is not consent and not weakness."],
  },
  {
    id: "normalize-responses", group: "trauma", title: "Normalize the counter-intuitive",
    keywords: ["normalize", "self-blame", "confusion", "avoidance", "expected", "common", "is this normal"],
    summary: "Survivors often show confusion, self-blame, flat affect, avoidance, or even laughter. Gently normalizing these — letting them know these reactions are common and expected — builds trust and opens the door.",
    say: ["\"A lot of people feel exactly that way. It makes sense.\"", "\"There's no wrong way to feel about this.\""],
    avoid: ["Reacting to flat affect or odd reactions as strange", "Reading calm or laughter as 'not really traumatized'"],
    why: "Trauma-informed lawyering guidance: naming counter-intuitive responses as common normalizes the survivor's experience and builds the trust that makes them stay engaged.",
  },
  {
    id: "patience-first-call", group: "trauma", title: "You won't get the whole story today, and that's right",
    keywords: ["first call", "full story", "detail", "many interviews", "trust", "patience", "won't tell everything"],
    summary: "Especially with trafficking survivors, don't expect the full story on the first contact. It can take many conversations before someone feels safe enough to share detail. Getting them to stay engaged matters more than getting everything now.",
    say: ["\"You don't have to tell me everything today.\"", "\"We can go as far as you're comfortable and no further.\""],
    avoid: ["Pressing for complete detail on call one", "Treating reluctance as non-cooperation"],
    why: "DOJ/OVC trafficking guidance: building trust is the first step; full disclosure often takes time and multiple interviews. Rapport beats extraction.",
    hardLines: ["Don't pressure for detail.", "A guarded survivor is normal, not difficult."],
  },
  // ===================== SPECIFIC EXPERIENCES =====================
  {
    id: "dv", group: "populations", title: "Domestic violence — support vs intervention",
    keywords: ["domestic violence", "dv", "abuser", "partner", "hitting", "controlling", "leave him", "leave her"],
    whatYouMightHear: ["\"He doesn't let me...\"", "Fear of being overheard", "Minimizing (\"it's not that bad\")"],
    summary: "Support means believing them, prioritizing their safety, and offering resources at their pace. Intervention — deciding for them, pushing them to leave, calling without consent — can increase danger. You support; professionals intervene.",
    say: ["\"I believe you.\"", "\"Are you safe to talk right now?\"", "\"There's a hotline whenever you want it — 800-799-7233. No pressure.\""],
    avoid: ["\"You need to leave him.\"", "Questioning why they stayed", "Calling the abuser's location without consent (unless life is in danger)", "Promising confidentiality"],
    whatToListenFor: ["Coded language / fear of being heard", "Escalation in the home right now (→ acute)"],
    pitfalls: ["Pushing them to leave (most dangerous time is leaving)", "Judging their choices", "Taking control away from someone whose control was already taken"],
    why: "Leaving is the most dangerous time in DV. Honoring their timing and agency keeps them safer than well-meaning pressure.",
    hardLines: ["You support and offer resources; you do not intervene or decide for them.", "Immediate danger is the exception — that's 911."],
    escalate: "Immediate danger → 911. Otherwise offer DV hotline, document, escalate per SOP.",
  },
  {
    id: "sexual-assault", group: "populations", title: "Sexual assault & incest — believe, don't probe",
    keywords: ["sexual assault", "rape", "incest", "molest", "abuse", "assaulted", "csa"],
    summary: "Believe them. Do not probe for detail you don't need. Your warmth and lack of judgment may be the first safe response they've ever gotten. Gather only what the file requires, gently.",
    say: ["\"Thank you for trusting me with that.\"", "\"You don't have to go into anything you're not ready for.\"", "\"None of this was your fault.\""],
    avoid: ["Detailed or graphic questions", "Any hint of doubt or 'why' questions", "Visible discomfort that reads as judgment", "\"Are you sure?\""],
    whatToListenFor: ["Shame, self-blame — gently counter it", "Signs they're disclosing for the first time"],
    pitfalls: ["Fishing for detail beyond what's needed", "Reacting with shock that shames them", "Rushing past the disclosure to the script"],
    why: "Survivors often face disbelief. Being believed, without interrogation, is stabilizing and may be a turning point.",
    hardLines: ["Do not interrogate or seek graphic detail.", "Do not diagnose or counsel — believe, steady, connect if needed."],
    escalate: "If acute distress or risk: 988, supervisor, document. CSAM: see that entry.",
  },
  {
    id: "substance", group: "populations", title: "Substance use — meet them without judgment",
    keywords: ["substance", "drugs", "alcohol", "using", "addiction", "high", "withdrawal", "relapse", "sober"],
    summary: "Many survivors used substances to survive. Don't moralize. If they're impaired right now, capacity rules apply (no signup). Offer recovery resources only if they open the door.",
    say: ["\"No judgment here at all.\"", "\"Whatever helped you survive makes sense.\"", "(If they ask) \"I can point you to some local resources whenever you want.\""],
    avoid: ["Lectures about getting clean", "Moral language ('clean,' 'dirty')", "Pushing recovery they didn't ask for", "Signing up someone visibly impaired"],
    whatToListenFor: ["Impairment right now (→ capacity)", "Shame about use — soften it"],
    why: "Shame fuels use and shuts people down. Non-judgment keeps them engaged and human.",
    hardLines: ["No signup if impaired (capacity).", "You're not a counselor — offer resources, don't treat addiction."],
  },
  {
    id: "legal-system-trauma", group: "populations", title: "Legal-system & institutional distrust",
    keywords: ["police", "court", "system", "distrust", "lawyer", "don't trust", "been failed", "cops"],
    summary: "Many have been failed or harmed by police, courts, or agencies. Distrust isn't hostility — it's earned. Don't be defensive. Be transparent, lower-pressure, and let trust build slowly.",
    say: ["\"That makes complete sense after what you've been through.\"", "\"I'm not going to pressure you. We move at your pace.\""],
    avoid: ["Defending 'the system'", "Pressure or urgency tactics", "Over-promising what the legal process will do"],
    whatToListenFor: ["Guardedness, testing you", "Fear that talking will backfire on them"],
    why: "Pushing against earned distrust confirms their fear. Patience and transparency earn the opening.",
  },
  {
    id: "minors-youth", group: "populations", title: "Minors & youth survivors",
    keywords: ["minor", "child", "teen", "young", "kid", "under 18", "youth"],
    summary: "Extra care, extra caution. An apparent minor in an adult-required matter means stop and escalate. Never collect detail that isn't required, and follow the capacity rules strictly.",
    avoid: ["Proceeding with an apparent minor where an adult is required", "Any detail-gathering beyond what's necessary"],
    hardLines: ["Apparent minor in adult-required matter: stop, care, escalate.", "Heightened caution on all detail."],
    escalate: "Stop, document, notify Brett. CSAM concerns → NCMEC/FBI.",
  },

  // ===================== DE-ESCALATION =====================
  {
    id: "spotting-spiral", group: "deescalation", title: "Spotting a spiral early & interrupting it",
    keywords: ["spiral", "spiraling", "escalating", "panic rising", "losing them", "interrupt"],
    whatYouMightHear: ["Speech speeding up", "Breathing changes", "Repeating the same phrase", "Going from talking to flat/gone"],
    summary: "Catch it before it peaks. The earlier you gently interrupt with grounding, the easier it settles.",
    say: ["\"Let's pause for one breath together.\"", "Name the present: where they are, that they're safe with you now"],
    avoid: ["Pushing forward with the script", "Adding new information", "Letting silence turn into freefall"],
    whatToListenFor: ["Pace and pitch climbing", "Repetition", "The shift from engaged to flooded"],
    why: "A spiral is far easier to interrupt early than to pull someone back from the peak.",
  },
  {
    id: "anger", group: "deescalation", title: "When they're angry at you",
    keywords: ["angry", "yelling", "hostile", "mad", "furious", "venting", "attacking me"],
    summary: "Anger is often pain or fear wearing armor. Don't defend or match it. Lower your voice, validate the feeling under it, and stay steady.",
    say: ["\"You have every right to be frustrated.\"", "\"I'm not going anywhere. Let's figure this out together.\""],
    avoid: ["Defending yourself", "Matching their volume", "\"Calm down\"", "Taking it personally"],
    why: "De-escalation comes from your regulation, not from winning the point.",
  },
  {
    id: "silence", group: "deescalation", title: "When they go silent",
    keywords: ["silent", "silence", "quiet", "not responding", "stopped talking", "gone quiet"],
    summary: "Silence can mean overwhelm, dissociation, tears, or thinking. Don't fill it anxiously. Offer gentle presence and a low-pressure door back.",
    say: ["\"Take your time. I'm right here.\"", "\"No rush at all. I'm not going anywhere.\""],
    avoid: ["Filling silence with chatter", "Repeating the question impatiently", "Assuming they hung up and giving up"],
    why: "Pressured silence becomes withdrawal. Patient silence becomes safety.",
  },

  // ===================== COMMUNICATION CRAFT =====================
  {
    id: "open-vs-closed", group: "communication", title: "Open vs closed questions, and when",
    keywords: ["questions", "open", "closed", "how to ask", "grounding questions"],
    summary: "In crisis, short concrete questions are grounding ('Is anyone with you right now?'). Open questions are for when they're already steady and ready.",
    avoid: ["'Why' questions in crisis (feel like blame)", "Big open questions when someone is flooded"],
    why: "Concrete questions give a flooded mind something solid to hold; open questions need a regulated nervous system.",
  },
  {
    id: "warmth-tone-pace", group: "communication", title: "Tone, pace, and the body of your voice",
    keywords: ["tone", "pace", "voice", "warmth", "how to sound", "slow down"],
    summary: "Your nervous system is contagious through the phone. Slow your pace, soften and lower your tone, breathe out longer than in. They will follow you down to calm.",
    say: ["Slower. Lower. Warmer.", "Pauses are allowed and good."],
    why: "Co-regulation works through prosody — the music of your voice does more than the words.",
  },
  {
    id: "what-not-to-promise", group: "communication", title: "What you can never promise",
    keywords: ["promise", "confidentiality", "outcome", "guarantee", "will it be okay"],
    summary: "Never promise confidentiality, a case outcome, or that everything will be okay. You can promise presence and care in this moment — and that's a lot.",
    say: ["\"I can't promise how things turn out, but I'm here with you right now.\"", "\"I'll make sure the right people know.\""],
    avoid: ["\"This stays between us.\"", "\"We'll definitely win.\"", "\"It's going to be okay.\""],
    hardLines: ["No promises of confidentiality or outcome."],
  },

  // ===================== PITFALLS =====================
  {
    id: "deathtraps", group: "pitfalls", title: "Emotional deathtraps to avoid",
    keywords: ["deathtrap", "mistakes", "what not to say", "pitfalls", "avoid"],
    summary: "The phrases and moves that quietly blow up a fragile call.",
    avoid: ["\"Calm down\" / \"it's not that bad\" — minimizes", "\"I know how you feel\" — you don't", "Making it about the case/signup mid-crisis", "Arguing with their feelings", "Going silent and disappearing", "Promising outcomes", "Interrogating for detail", "Reacting with shock that shames them"],
    say: ["When in doubt: slow down, validate one feeling, connect to 988/911, escalate."],
  },
  {
    id: "savior-trap", group: "pitfalls", title: "The savior trap & over-involvement",
    keywords: ["savior", "fix it", "rescue", "over-involved", "boundaries", "carry it home"],
    summary: "You can't rescue someone's whole life on a call, and trying to makes you less effective and burns you out. Your power is presence + connection, not rescue.",
    avoid: ["Promising to personally fix everything", "Staying on endlessly out of guilt", "Carrying every call home"],
    why: "The savior trap leads to broken promises, blurred lines, and burnout. Steady presence helps more than heroics.",
    hardLines: ["You connect to professionals; you are not the rescue."],
  },

  // ===================== SELF CARE =====================
  {
    id: "after-hard-call", group: "selfcare", title: "After a hard call — steadying yourself",
    keywords: ["after", "shaken", "rattled", "hard call", "my own stress", "vicarious", "secondary trauma"],
    summary: "Hard calls land on you too. Steadying yourself isn't weakness — it's how you stay good at this. You did the right thing by staying and connecting.",
    say: ["(to yourself) \"That was a lot. It makes sense that it landed on me.\""],
    steps: [
      { label: "Step away", detail: "Take a few minutes — it's pre-approved. Don't white-knuckle into the next call." },
      { label: "Breathe", detail: "Exhale longer than you inhale, a few times. It resets your system." },
      { label: "Tell someone", detail: "Loop in a supervisor. You don't carry this alone." },
      { label: "Name it, then set it down", detail: "\"That was heavy.\" Let it be heavy, then let it go for now." },
    ],
    avoid: ["White-knuckling into the next call", "Telling yourself you should be tougher", "Carrying it home silently"],
    why: "Vicarious trauma is real. Tending to yourself keeps you present for the next person.",
  },
  {
    id: "vicarious-trauma", group: "selfcare", title: "Recognizing vicarious trauma over time",
    keywords: ["burnout", "vicarious trauma", "numb", "dreading", "cynical", "exhausted", "compassion fatigue"],
    summary: "Doing this work changes you. Watch for numbness, dread before shifts, cynicism, sleep changes, or carrying calls home. These are signals to tend to yourself and tell a supervisor.",
    whatToListenFor: ["(in yourself) dread, numbness, irritability, intrusive thoughts about calls"],
    why: "Caught early, vicarious trauma is manageable. Ignored, it ends careers and harms you.",
    escalate: "Tell a supervisor. This is a team responsibility, never a private burden.",
  },

  // ===================== SCENARIO DRILLS =====================
  {
    id: "drill-spiraling", group: "scenarios", title: "Drill: caller is spiraling",
    keywords: ["practice", "drill", "scenario", "spiraling example"],
    summary: "Practice the first 30 seconds. Caller's voice is speeding up, they're repeating 'I can't, I can't.'",
    say: ["\"I'm right here. Let's take one slow breath together — you and me.\"", "\"There's no rush. I've got you.\""],
    why: "Reps build the instinct so it's there when it's real.",
  },
  {
    id: "drill-disclosure", group: "scenarios", title: "Drill: first-time disclosure",
    keywords: ["practice", "drill", "disclosure", "telling for the first time"],
    summary: "Caller says something they've 'never told anyone.' Your response sets whether they keep going.",
    say: ["\"Thank you for trusting me with that. You don't have to go further than you're ready to.\"", "\"None of it was your fault.\""],
    why: "The response to a first disclosure can be a turning point in someone's life — or a door that closes.",
  },
];

// Simple search over titles, keywords, summary, and cues.
export function searchBible(query: string): BibleEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return BIBLE;
  const terms = q.split(/\s+/);
  return BIBLE.map((e) => {
    const hay = [e.title, e.summary, ...(e.keywords ?? []), ...(e.whatYouMightHear ?? []), ...(e.say ?? [])].join(" ").toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score++;
    if (e.title.toLowerCase().includes(q)) score += 3;
    return { e, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.e);
}

// Offline fallback: best-matching entry rendered as guidance text (when Crissi/AI is down).
export function bibleFallback(query: string): BibleEntry | null {
  const hits = searchBible(query);
  return hits[0] ?? BIBLE.find((e) => e.id === "your-role") ?? null;
}
