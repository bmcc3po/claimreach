// ============================================================================
// CAMPAIGN TRAINING — per-case playbooks agents certify on before taking live
// calls. Each campaign = posture, criteria board (sign / DQ / firm review),
// call flow, technique blocks, landmines, quiz, and a role-play drill.
//
// Completion is written to training_progress under module_id "cmp-<id>".
// Content here mirrors the live intake forms. When a form changes, change this.
// ============================================================================

import type { QuizQ } from "./course";

export interface CampaignBlock {
  heading: string;
  body?: string;
  bullets?: string[];
  say?: string[];
  avoid?: string[];
}

export interface VerdictLabels { sign: string; dq: string; review: string }

// Rapid-fire fact patterns. The agent calls the verdict; the drill scores it.
// This is the "do you actually know what qualifies" test, separate from the
// multiple-choice certification.
export interface Scenario {
  id: string;
  text: string;
  verdict: "sign" | "dq" | "review";
  why: string;
}

export interface Campaign {
  id: string;
  name: string;
  client: string;
  status: "live" | "pilot" | "paused";
  updated: string;
  posture: string;          // what kind of call this is, in one line
  headline: string;         // why it matters right now
  mission: string[];        // your job on this call
  sign: string[];           // must all be true
  dq: string[];             // hard kills
  review: string[];         // escalate, never decline
  flow: { step: string; detail: string }[];
  blocks: CampaignBlock[];
  landmines: string[];
  verdicts: VerdictLabels;
  scenarios: Scenario[];
  quiz: QuizQ[];
  drill: { setup: string; crissiRole: string };
}

export const CAMPAIGNS: Campaign[] = [
  // =========================================================================
  // CALIFORNIA WOMEN'S PRISON ABUSE
  // =========================================================================
  {
    id: "ca-womens-prison",
    name: "California Women's Prison Abuse",
    client: "Firm review campaign",
    status: "live",
    updated: "2026-08-12",
    posture: "Live leads. Cold prospects who submitted an inquiry. You qualify them and you sign them on this call.",
    headline:
      "These are new leads and we are first in. Nobody has talked to them yet, nobody has signed them yet, and the difference between a signed retainer and a lost file is the next fifteen minutes.",
    mission: [
      "Confirm she is unrepresented and has never signed with anyone on this.",
      "Confirm the four criteria that decide the case: female, one of the four facilities, staff perpetrator, and a qualifying act.",
      "Establish that the perpetrator can be identified in at least one of the four accepted ways.",
      "Sign the retainer on the call, then collect the remaining detail.",
    ],
    sign: [
      "Female.",
      "Incarcerated at CCWF (Chowchilla), VSPW (Chowchilla, closed 2012), CIW (Chino), or Folsom Women's Facility (Represa).",
      "Sexually abused at one of those facilities.",
      "Abuse was by a corrections officer, guard, or other prison staff.",
      "The act includes at least one of: vaginal penetration, anal penetration, oral sex, or masturbation.",
      "Majority of the abuse is 2009 or later.",
      "She can identify the perpetrator by at least one accepted route (see the identification rule).",
      "No current attorney and no prior signed retainer on this matter.",
    ],
    dq: [
      "Currently represented by another attorney on this matter.",
      "Previously signed a contract or retainer with another firm on this matter.",
      "Not female.",
      "Not held at one of the four listed facilities.",
      "Inmate-on-inmate abuse with no staff involvement.",
      "Over-clothing contact only.",
      "Incidental touching or grazing during a shower, search, or the officer's job duties.",
      "Touching of bare buttocks only.",
      "No physical contact at all.",
      "Physical abuse only, not sexual.",
      "She has no idea who the perpetrator was and cannot describe them at all.",
    ],
    review: [
      "Signed with a firm for abuse at a DIFFERENT facility — get the facility and firm name, send to the attorneys, do not decline.",
      "Inmate-on-inmate abuse that a staff member coerced or set up.",
      "Over-clothing vaginal contact that was excessive, sexual in nature, not a pat-down, and repeated by the same perpetrator.",
      "Age 40 or older — needs management approval, this is not a decline.",
      "Most of the abuse occurred before 2009.",
      "A facility not on the list — set up a callback after firm approval.",
    ],
    flow: [
      { step: "Open on a recorded line", detail: "Identify yourself and the Legal Intake Center, reference the inquiry she submitted about the facility, and confirm she can talk now. If she can't, set the callback and stop." },
      { step: "Clear the representation gates", detail: "Attorney now? Spoken to another attorney? Signed anything with another firm? Two of these must be no. A yes on 'spoken to' alone is not fatal — capture the detail." },
      { step: "Identify the parties", detail: "Injured party name, caller name, and the caller's relationship if it isn't self. Self, conservator, POA, EOE, spouse, or next of kin." },
      { step: "Confirm facility and gender", detail: "Which of the four facilities. Any other facility, adult or juvenile, with rough years. Confirm the injured party is female." },
      { step: "Set the frame", detail: "Read the framing paragraph. What you do, that nothing gets judged, that the questions are structured, and that she can pause. This is the single highest-value thirty seconds on the call." },
      { step: "Establish the perpetrator", detail: "Staff or inmate. Name, last name especially. Would she recognize the name if she heard it. Would she recognize a photo. Did she file a report at the time. At least one must land." },
      { step: "Establish the act", detail: "Ask the categories clinically. Vaginal penetration, anal penetration, oral, masturbation. Skin-to-skin. Then confirm none of the excluded-only scenarios is the only contact." },
      { step: "Establish timing and count", detail: "DOB, age at the time, how many staff involved, how many separate incidents, first date, most recent date. Real dates, not buckets." },
      { step: "Qualify and close", detail: "Give the good-news close, move to the Contact tab, verify everything, come back, and text the agreement to the confirmed number." },
      { step: "Collect the rest", detail: "Perpetrator description, emergency contact, alternate contacts, prison ID, aliases, disclosures, treatment records, reporting attempts. After the signature, not before." },
    ],
    blocks: [
      {
        heading: "The identification rule — read this twice",
        body:
          "She does not need the perpetrator's full name. She needs ONE of four routes. Agents lose signable files by hearing 'I don't remember his name' and treating it as the end.",
        bullets: [
          "She can give the full last name, OR",
          "She would recognize a photo, OR",
          "She would recognize the name if she heard it, OR",
          "She filed a report at the time AND can give a detailed description.",
        ],
        say: [
          "\"You don't need to remember the name. If I showed you a photo, would you know him?\"",
          "\"If somebody read you a list of names, would one of them jump out?\"",
          "\"Did you ever put in a grievance or a report about it?\"",
        ],
        avoid: ["Accepting the first 'I don't know' and moving on", "Asking her to guess at a name"],
      },
      {
        heading: "Describe the person, not the event",
        body:
          "The perpetrator description block is long on purpose and it is the safest part of the call. Sex, age, race, accent, height, build, hair, facial hair, eyes, glasses, marks, tattoos, gloves, where in the facility she'd run into him, what his job was. None of that requires her back inside the incident. Spend your time here, not in the narrative.",
        say: [
          "\"Now I just need to describe him for the file. Tall or short?\"",
          "\"Where in the facility would you usually run into him?\"",
        ],
      },
      {
        heading: "The one narrative question",
        body:
          "There is exactly one open narrative prompt on this form. You need enough to show the severity and nature: the act, how often, how long, where, whether anyone else was present, anything he said. Ask it once, let her answer, confirm the elements you still need, and stop. Do not run it as an interview inside the interview.",
        say: [
          "\"Walk me through what happened. As specific as you can, and you can stop whenever.\"",
          "\"That's what the attorney needs. I'm going to move to some quick description questions.\"",
        ],
        avoid: ["Following up for more color once the elements are met", "Asking her to repeat any part of it"],
      },
      {
        heading: "The exclusion check is an agent task, not a question",
        body:
          "You confirm to yourself that over-clothing only, incidental contact during a search or shower, bare-buttocks only, no contact, or physical abuse only is not the whole story. You do not read that list to her. Reading it teaches her which answers work.",
        avoid: ["Reading the DQ list aloud", "Asking 'was it more than over the clothes?' in a leading way"],
      },
      {
        heading: "Age is not a decline",
        body:
          "39 and under is clean. 40 and over needs management approval. Same for abuse that is mostly pre-2009. Both go to review. Neither ends the call, and neither gets mentioned to the caller.",
      },
      {
        heading: "Prison ID",
        body: "Ask for the CDCR number or whether she still has her ID badge. Unknown is not a disqualifier. Capture whatever she has and move.",
      },
    ],
    landmines: [
      "Treating 'I don't remember his name' as a DQ. Three other routes exist.",
      "Reading the disqualifier list to the caller.",
      "Telling her she qualifies or doesn't. That is the firm's call, not yours.",
      "Collecting descriptive detail before the retainer is signed. Sign, then collect.",
      "Free-texting a date bucket instead of capturing the real month and year.",
      "Letting 'he messed with me' stand as the answer on the act category.",
      "Missing that she signed with a firm for a DIFFERENT facility — that is a review, and a good one.",
      "Skipping the emergency contact because the call ran long.",
    ],
    verdicts: { sign: "Sign", dq: "Disqualify", review: "Escalate" },
    scenarios: [
      { id: "p1", verdict: "sign", text: "Female. CCWF, 2014. A guard on her unit. Oral sex, multiple times. She remembers his last name. No attorney, never signed anything.", why: "Every criterion is met and the perpetrator is named outright." },
      { id: "p2", verdict: "sign", text: "Female. CIW, 2011. Vaginal penetration by an officer. She cannot remember his name at all, but says she would know his face anywhere.", why: "Photo recognition is one of the four accepted identification routes. The name is not required." },
      { id: "p3", verdict: "sign", text: "Female. Folsom Women's, 2015. A counselor, not a guard. Masturbation. She filed a grievance at the time and can describe him in detail.", why: "Other prison staff counts, not just guards. A report at the time plus a detailed description is an accepted identification route." },
      { id: "p4", verdict: "dq", text: "Female. VSPW, 2010. An officer repeatedly grabbed at her over her jumpsuit. Nothing ever went further than that.", why: "Over-clothing contact only is an express disqualifier unless it was excessive vaginal contact by the same perpetrator outside of searches." },
      { id: "p5", verdict: "dq", text: "Female. CCWF, 2013. She was assaulted by another inmate. No staff member was involved in any way.", why: "Inmate-on-inmate with no staff involvement is a hard disqualifier." },
      { id: "p6", verdict: "review", text: "Female. CCWF, 2013. Another inmate assaulted her, but an officer arranged it and forced it to happen.", why: "Staff-coerced inmate-on-inmate abuse goes to firm review. It is not the same as the plain inmate-on-inmate disqualifier." },
      { id: "p7", verdict: "dq", text: "The injured party is a man who was held at a men's facility in California.", why: "The campaign requires the injured party to be female and held at one of the four listed women's facilities." },
      { id: "p8", verdict: "review", text: "Female. Sexually abused by a guard, but at a county jail that is not on the list of four facilities.", why: "A facility off the list is not an automatic decline. Set up a callback after firm approval." },
      { id: "p9", verdict: "review", text: "Female. CCWF, 2012, penetration by a guard. She already signed a retainer with another firm, but that was for abuse at a different facility.", why: "Get the facility and the firm name and send it to the attorneys. This is one of the most expensive files to send home." },
      { id: "p10", verdict: "dq", text: "Female. CIW, 2014, penetration by an officer. She already has a lawyer representing her on this exact matter.", why: "Current representation on this matter is a hard disqualifier." },
      { id: "p11", verdict: "review", text: "Female, age 44. CCWF, 2013. Vaginal penetration by a guard she can name.", why: "Forty and over needs management approval. It is explicitly not a decline, and she never hears about it." },
      { id: "p12", verdict: "dq", text: "Female. CCWF, 2015. An officer grabbed her bare buttocks on several occasions. Nothing else ever happened.", why: "Touching of bare buttocks only is an express disqualifier." },
      { id: "p13", verdict: "review", text: "Female. CCWF, 2014. The same officer rubbed her vagina over her clothing many times, clearly sexual, never during a pat-down or a search.", why: "Excessive over-clothing vaginal contact by the same perpetrator, outside of procedural searches, goes to review rather than a decline." },
      { id: "p14", verdict: "review", text: "Female. CCWF. Penetration by a guard she can identify. All of it happened between 2005 and 2007.", why: "Mostly pre-2009 goes to review. Do not decline it on the call." },
      { id: "p15", verdict: "dq", text: "Female. CCWF. She believes she was assaulted while she was asleep. She has no idea who did it and cannot describe them at all.", why: "No identification and no description is a disqualifier. She has to know generally who it was." },
      { id: "p16", verdict: "sign", text: "Female. CCWF, 2016. Penetration by a named officer. She has no idea what her CDCR number was and lost her ID badge years ago.", why: "The prison ID is a nice-to-have. Unknown is not a disqualifier. Capture what she has and move." },
      { id: "p17", verdict: "sign", text: "Female. CIW, 2012. Oral sex forced by a member of the medical staff. She would recognize his name if she heard it.", why: "Other prison staff qualifies, not just corrections officers, and name recognition is an accepted identification route." },
      { id: "p18", verdict: "dq", text: "Female. CCWF, 2013. Officers beat her badly on more than one occasion. There was never any sexual contact.", why: "Physical abuse only, with no sexual contact, is a disqualifier for this campaign." },
      { id: "p19", verdict: "sign", text: "Female. CCWF, 2014, penetration by a named guard. She called another law firm about it last year and talked to someone, but never signed anything.", why: "Speaking with another attorney is not fatal. Only current representation or a prior signed retainer is. Capture the detail and keep going." },
      { id: "p20", verdict: "sign", text: "Female. CCWF, 2016. Penetration by an officer whose last name she remembers. She never reported it and never got any counseling or treatment for it.", why: "Reporting and treatment are captured when they exist but are not required. Identification and the qualifying act carry the file." },
    ],
    quiz: [
      {
        q: "A caller was abused at CCWF by a guard. She cannot remember his name at all. What do you do?",
        options: [
          "Disqualify — the perpetrator must be named",
          "Ask whether she'd recognize a photo, recognize the name if she heard it, or filed a report at the time",
          "Ask her to guess a last name so the file has something",
          "Transfer to a supervisor immediately",
        ],
        answer: 1,
        explain: "The name is only one of four accepted identification routes. Work all four before anyone calls it dead.",
      },
      {
        q: "The caller says she signed a retainer with another firm — but for abuse at a facility that is not on our list. What is that?",
        options: ["Hard DQ", "Firm review — capture the facility and the firm name and send it up", "Sign her anyway", "Tell her she can't be helped"],
        answer: 1,
        explain: "A prior signing at a different facility is an escalation, not a decline. Get the facility, get the firm, send to the attorneys.",
      },
      {
        q: "She is 44 years old. What happens?",
        options: [
          "DQ, the campaign caps at 39",
          "Sign without comment, age is irrelevant",
          "Continue the intake and flag for management approval",
          "End the call politely",
        ],
        answer: 2,
        explain: "40+ needs management approval. It is explicitly not a decline, and you never mention it to her.",
      },
      {
        q: "Which contact qualifies on its own?",
        options: [
          "Touching over clothing",
          "Grazing during a documented pat-down search",
          "Oral sex",
          "Touching of bare buttocks only",
        ],
        answer: 2,
        explain: "The qualifying categories are vaginal penetration, anal penetration, oral sex, and masturbation. The other three listed are express disqualifiers when they are the only contact.",
      },
      {
        q: "You need the act category. She says 'he messed with me in the shower.' Best next line?",
        options: [
          "\"Can you describe exactly what he did?\"",
          "\"I have to ask this clinically. Did it include vaginal penetration, anal, oral, or masturbation?\"",
          "\"Okay, I'll put down inappropriate touching.\"",
          "\"Take all the time you need to tell me the whole story.\"",
        ],
        answer: 1,
        explain: "Name the clinical categories so she doesn't have to. A vague answer in the note gets the file declined and forces a callback.",
      },
      {
        q: "Another inmate abused her, but a corrections officer set it up and forced it. Correct handling?",
        options: ["DQ, inmate-on-inmate", "Firm review", "Automatic sign", "Reclassify as physical abuse"],
        answer: 1,
        explain: "Inmate-on-inmate is a DQ only when there is no staff involvement. Staff coercion sends it to firm review.",
      },
      {
        q: "When do you collect the perpetrator's height, tattoos, and accent?",
        options: ["Before the qualifying questions", "Immediately after the narrative", "After the retainer is signed", "Never, the firm handles it"],
        answer: 2,
        explain: "Verify criteria, sign, then collect details. Description work after the signature is safe time; before it, it is risk.",
      },
      {
        q: "She hits a disqualifier halfway through. What does she hear from you?",
        options: [
          "\"Unfortunately you don't qualify for this case.\"",
          "\"The criteria require X, and you said Y.\"",
          "A normal close: everything goes to the legal team for review and someone will follow up",
          "Nothing, you end the call quickly",
        ],
        answer: 2,
        explain: "You are not the decision maker. Close level, never state a decision, and never explain the criteria — that invites a corrected story on the next call.",
      },
    ],
    drill: {
      setup: "Run a full qualification on a caller who is guarded, vague on the name, and prone to going long.",
      crissiRole:
        "You play a woman in her late thirties who submitted an inquiry about abuse at CCWF. She is guarded, tests whether the agent will judge her, does not remember the officer's last name but would recognize him, and tends to drift into long stories about other things that happened inside. Do not produce graphic detail — keep disclosures brief and clinical. Reward the agent for working all four identification routes, naming the clinical act categories, containing the drift without scolding, and staying level after a disclosure. Coach if they probe for unnecessary detail, react with shock, read criteria aloud, or state a qualification decision.",
    },
  },

  // =========================================================================
  // MOTEL 6 MDL — SECONDARY INTERVIEW
  // =========================================================================
  {
    id: "motel6",
    name: "Motel 6 MDL — Secondary Interview",
    client: "Turnbull, Moak & Pendergrass",
    status: "live",
    updated: "2026-08-12",
    posture: "These callers are ALREADY retained by TMP. You are not qualifying them and you are not selling anything. You are running the secondary interview.",
    headline:
      "The whole value of this call is hotel knowledge. What the property saw, what the staff did, and what they let keep happening. That is the case. The trauma narrative is not.",
    mission: [
      "Confirm she is in a safe place to speak before anything else.",
      "Identify every specific property, visually confirmed, one record per hotel.",
      "Capture hotel operations and staff awareness in detail — this is the point of the call.",
      "Complete the entire interview regardless of what any answer suggests, and say nothing about qualification.",
    ],
    sign: [
      "Victim of sex trafficking or forced prostitution at a hotel or motel.",
      "The claimant can identify at least one specific hotel or motel where it occurred.",
      "The property is recalled as Motel 6 brand — capture the remembered brand and the current brand both.",
      "If the caller is not the injured party, POA or next-of-kin authority is confirmed.",
    ],
    dq: [
      "Did not occur at a hotel or motel — record it, do NOT end the call, complete the full intake anyway.",
      "Cannot identify any specific property — call a supervisor before proceeding.",
    ],
    review: [
      "Claimant recalls a brand other than Motel 6 — capture it and continue, the attorney decides.",
      "Caller is not the legal representative — stop and have the legal rep call us directly.",
      "Claimant is not in a safe place to speak — schedule a callback, do not proceed.",
    ],
    flow: [
      { step: "Safety gate", detail: "Read the intro verbatim and ask if she is in a safe place to speak. Not safe means callback, full stop. Nothing else happens first." },
      { step: "Reassurance script", detail: "Read it verbatim. Confidential, no judgment, she can pause or skip, no right or wrong answers. This is what makes the rest of the call possible." },
      { step: "Threshold", detail: "Trafficking at a hotel or motel, occurred at a hotel or motel, and can identify at least one specific property." },
      { step: "Parties and contact", detail: "Injured party, caller, relationship, mailing address, and the emergency contact with the verbatim EC script and permission flag." },
      { step: "Properties", detail: "One record per property. Use cross-streets and landmarks, confirm visually with the building photo and Street View, capture name as recalled and remembered brand, dates, duration, room and floor, age at the time, whether under 18." },
      { step: "Hotel knowledge", detail: "Who booked and paid, payment method, volume, whether she asked staff for help and whom, whether police or EMTs were ever called." },
      { step: "Hotel operations", detail: "Repeat bookings, specific rooms requested, room-change frequency, whether visitors checked in at the desk, men waiting in lobby or lot, housekeeping entry, towel and sheet changes, long-running Do Not Disturb, visible condoms." },
      { step: "Staff awareness", detail: "Staff interaction with the trafficker and with her, attempted intervention, violence in public areas, visible paraphernalia, staff witnessing drug use. Then the open question: anything else that made it obvious the motel knew." },
      { step: "Control, recruitment, money, trafficker ID", detail: "Structured sections. Keep to the questions. This is where calls run away." },
      { step: "Close", detail: "Safe contact preferences, then the closing block. No opinion on the case, ever." },
    ],
    blocks: [
      {
        heading: "The safety gate is not a formality",
        body:
          "Some of these callers are still in unsafe situations. 'Are you in a safe place to speak right now' is a real question with a real branch. If the answer is no, or if it sounds coached, book the callback and end. A completed interview taken in front of the wrong person is worse than no interview.",
        say: ["\"Before we start — are you in a safe place to speak right now?\"", "\"No problem at all. When's a better time to reach you?\""],
        avoid: ["Rushing past it as boilerplate", "Continuing because she says 'it's fine' in a flat voice"],
      },
      {
        heading: "Property identification is the skill",
        body:
          "This is not a free-text box. Work the cross-streets, the landmarks she remembers, what was across the road. Then confirm visually with the building photo and Street View. Capture the name she recalls AND the brand she remembers it as — properties change brands and the attorney needs both.",
        say: [
          "\"What was near it? A gas station, a highway exit, anything across the street?\"",
          "\"I'm looking at a photo of it now — does this look like the place?\"",
        ],
        avoid: ["Accepting a city name as an identification", "Skipping the visual confirmation because she sounded sure"],
      },
      {
        heading: "Ask about the hotel, not the abuse",
        body:
          "Almost every question that wins this case is about the building and the people who worked in it. How often the sheets got changed. Whether housekeeping came in. Whether men waited in the lobby. Whether anyone at the desk ever said anything. You can build a devastating file without asking her to relive a single act.",
        say: [
          "\"Did housekeeping ever come into the room while you were there?\"",
          "\"Were men ever waiting in the lobby or the parking lot?\"",
          "\"Did anyone at the front desk ever say anything to you?\"",
        ],
      },
      {
        heading: "Do not let them ramble",
        body:
          "This is written into the form on the Control and Coercion section for a reason. These are long interviews with a lot of required fields. A call that drifts does not get finished, and an unfinished secondary interview means she gets called again to do it a second time. Containment here is the kind option.",
        say: ["\"I hear you. Let me get this in the right place — who paid for the rooms?\"", "\"We'll have a spot at the end for anything I didn't ask.\""],
      },
      {
        heading: "You never render a verdict",
        body:
          "If she says something that doesn't fit the campaign, you record it and you keep going. You complete the entire intake. Your notes and the firm decide, not that one answer, and she never hears a word about it either way. She is already a client of the firm. Acting like a gatekeeper on that call is out of bounds.",
        avoid: ["\"That might be a problem for your case\"", "Wrapping up early once something doesn't fit", "Any comment on case value or strength"],
      },
      {
        heading: "One record per property",
        body:
          "Every hotel gets its own property record with its own dates, rooms, and operations answers. If the trafficker or the control method was different at one of them, flag the variance rather than copying the first property's answers forward.",
      },
    ],
    landmines: [
      "Skipping or soft-pedaling the safe-to-speak gate.",
      "Ending the call when an answer doesn't fit the campaign. Complete it. Always.",
      "Telling the claimant anything about whether her case qualifies.",
      "Logging a property without visual confirmation.",
      "Letting the narrative eat the operations and staff-awareness sections, which are the actual case.",
      "Forgetting the emergency contact permission flag.",
      "Proceeding when the caller is not the legal representative instead of routing to the rep.",
    ],
    verdicts: { sign: "Continue the intake", dq: "Stop the call", review: "Supervisor" },
    scenarios: [
      { id: "m1", verdict: "sign", text: "Ten minutes in, she says the trafficking happened at a friend's apartment, not at a hotel or motel.", why: "Record it and complete the entire interview. She is already retained. Your notes and the firm decide, and she hears nothing about it." },
      { id: "m2", verdict: "review", text: "She says it was a motel somewhere off the highway outside Bakersfield. No cross streets, no landmarks, nothing that comes up on Street View.", why: "No identifiable property is a supervisor gate. Never guess a property into the record." },
      { id: "m3", verdict: "dq", text: "You ask if she is in a safe place to speak. There is a long pause, and she says quietly that someone is in the room but it is fine.", why: "That is a no. Book the callback and end the call. A completed interview taken in front of the wrong person is worse than no interview." },
      { id: "m4", verdict: "dq", text: "The caller is the claimant's cousin. He is not her power of attorney and not her legal representative.", why: "No authority, no interview. Stop and have the legal representative call us directly." },
      { id: "m5", verdict: "sign", text: "She is certain the property was a Super 8, not a Motel 6.", why: "Capture the name as she recalls it and the remembered brand. Properties rebrand. The attorney makes that call, not you." },
      { id: "m6", verdict: "sign", text: "She was sixteen years old during part of the time at the property.", why: "Continue and make sure the under-18 flag is set on that property record. It matters enormously to the file." },
      { id: "m7", verdict: "sign", text: "At the third property, it was a different trafficker using different control methods than the first two.", why: "Continue and flag the variance on that property record rather than copying the first property's answers forward." },
      { id: "m8", verdict: "sign", text: "Halfway through she asks you whether her case is a strong one and what it might be worth.", why: "Continue the interview and give her no opinion on strength, value, or timing. Redirect to the firm and keep going." },
      { id: "m9", verdict: "sign", text: "She says she never once asked hotel staff for help, and does not think any of them ever noticed anything.", why: "A no is data. Record it and continue. Staff awareness is built from many answers, not one." },
      { id: "m10", verdict: "sign", text: "She names the property, remembers the gas station across the street, and confirms the building when you show her the photo.", why: "That is a clean property identification. Log it with the remembered brand and the current brand." },
      { id: "m11", verdict: "sign", text: "The caller is the claimant's mother and her power of attorney, and the authority is confirmed in the file.", why: "Confirmed POA or next-of-kin authority means you run the interview with her." },
      { id: "m12", verdict: "dq", text: "Forty minutes in she says she cannot do any more of this today and asks to stop.", why: "Take yes for an answer. Note where you stopped, schedule the rest, and end. Pushing through costs you the rest of the interview and the caller." },
    ],
    quiz: [
      {
        q: "The claimant says the trafficking happened at a friend's apartment, not a hotel. What do you do?",
        options: [
          "End the call, it doesn't qualify",
          "Record it and complete the entire intake, saying nothing about qualification",
          "Tell her it won't work for this case but you'll try",
          "Transfer her to another campaign",
        ],
        answer: 1,
        explain: "She is already retained by the firm. Record the answer, finish the whole interview, and let the notes and the firm decide. She hears no opinion from you.",
      },
      {
        q: "First question of the call, in every case?",
        options: ["Her date of birth", "Which hotel it happened at", "Whether she's in a safe place to speak", "Who her trafficker was"],
        answer: 2,
        explain: "The safety gate comes first. Not safe means callback, and nothing else happens.",
      },
      {
        q: "She remembers the property as a Super 8, not a Motel 6. Correct handling?",
        options: [
          "DQ",
          "Correct her — it must have been a Motel 6",
          "Capture the remembered brand and continue; the attorney decides",
          "Leave the brand blank",
        ],
        answer: 2,
        explain: "Capture the name as recalled and the remembered brand both. Properties rebrand. That call belongs to the attorney.",
      },
      {
        q: "Which set of answers does the most work on this case?",
        options: [
          "Detailed description of the assaults",
          "Sheet and towel change frequency, housekeeping entry, men waiting in the lobby, staff interaction with the trafficker",
          "Her medical history",
          "The trafficker's criminal record",
        ],
        answer: 1,
        explain: "Hotel operations and staff awareness are the case. You can build a strong file without asking her to relive an act.",
      },
      {
        q: "She cannot identify any specific hotel or motel. What now?",
        options: ["Complete the intake normally", "Call a supervisor before proceeding", "Pick the nearest Motel 6 to her old address", "End the call"],
        answer: 1,
        explain: "No identifiable property is a supervisor gate. Never guess a property into the record.",
      },
      {
        q: "The caller is the claimant's cousin and is not her legal representative. You should:",
        options: [
          "Take the interview anyway",
          "Stop and instruct the legal representative to call us directly",
          "Take partial information and note it",
          "Ask the cousin to put the claimant on speakerphone",
        ],
        answer: 1,
        explain: "No authority, no interview. Route to the legal rep.",
      },
    ],
    drill: {
      setup: "Run the property identification and hotel-knowledge sections on a claimant who is vague on locations and keeps drifting into the narrative.",
      crissiRole:
        "You play an already-retained TMP claimant doing her secondary interview. She is cooperative but foggy on which motel was which, remembers landmarks better than street names, and keeps drifting from operations questions back into what happened to her. Keep any disclosure brief and non-graphic. Reward the agent for opening with the safety gate, working landmarks and cross-streets to pin the property, staying on operations and staff-awareness questions, and containing drift with a bridge rather than a correction. Coach if they skip the safety gate, accept a vague location, offer any opinion on the case, or let the call run away.",
    },
  },
];

export function campaignById(id: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.id === id);
}

// Module ids used in training_progress. Certification and the qualifier drill
// are tracked separately — passing the multiple choice is not the same as being
// able to call a verdict live.
export function campaignModuleId(id: string): string {
  return `cmp-${id}`;
}

export function drillModuleId(id: string): string {
  return `drill-${id}`;
}
