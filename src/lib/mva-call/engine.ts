// ============================================================================
// MVA call console engine. Ported from the approved Design-canvas prototype
// (ClaimReach MVA Call Console) so the logic Brett signed off on runs as-is:
// the six lights, branching, completeness, dispo rules and script copy.
//
// One definition: every screen of the call (Guided, Freestyle, Q&A) reads
// renderVals(). The React wrapper (CallConsole) owns the network; this file
// never fetches. Anything that used to be simulated goes through `api`.
// ============================================================================
// Type checking is off for this file on purpose: it is a line-for-line port of
// plain JS that was tested in the prototype harness, and engine.test.ts drives
// every flow. The boundary (CallProps, CallApi, renderVals) is typed where the
// React wrapper and the API routes meet it.
// @ts-nocheck
/* eslint-disable */
import { SOL, stateCodeOf, injuryYears as injuryYearsFor } from './state';
import { INTAKE_SECTIONS, INTAKE_SEQUENCE, INTAKE_OPTIONAL, sectionOf } from './intake';
export { SOL };
export const REBS: any[] = [
  { id: 'report', phase: 'open', group: 'Opening', title: "I was just checking on my police report.", text: "Got it, and that's exactly why we have you. When that report gets requested it comes over to us too. We're the intake center for {FIRM}, and I was reaching out to see what kind of pain you've been dealing with since the accident. Tell me what happened out there." },
  { id: 'info', phase: 'open', group: 'Opening', title: "How did you get my information?", text: "You filled out an accident form, and that comes straight to us here at the firm's intake center. That's all it is. Tell me what happened." },
  { id: 'atwork', phase: 'open', group: 'Opening', title: "I'm at work right now.", text: "Totally understand, I'll be quick, this is a couple of minutes and then I'm out of your hair. Walk me through what happened." },
  { id: 'soreness', phase: 'body', group: 'Minimizing', title: "It's just soreness. It was low impact. I'm fine.", note: "The single most important rebuttal on this campaign.", text: "I hear you, and I'm glad it wasn't worse. Here's the thing though, most of the people we represent are exactly where you are. It's soreness in the neck and back. It's not broken bones and hospital stays. That's the normal file here, not the exception, and soreness after a wreck has a way of showing up worse on day four than it did on day one. So tell me where it's sitting right now, is it the neck, the back, or both?" },
  { id: 'doctor', phase: 'body', group: 'Medical', title: "I haven't been to a doctor.", text: "That's actually pretty common, adrenaline covers a lot for the first few days. We can get you in with somebody local just to get looked at, nothing out of your pocket, and if everything's clean then it's clean and you've got it in writing. What's been bothering you the most since it happened?" },
  { id: 'chiro', phase: 'body', group: 'Medical', title: "I'm not sure I can get to a chiropractor.", text: "Okay, that's fair, let's not pretend your schedule isn't real. The coordinator works around you, evenings and near your work if that's easier, and it's usually one visit to get looked at. If she finds something close to you, are you able to go?" },
  { id: 'offered', phase: 'body', group: 'Insurance', title: "Their insurance already called me. They offered me something.", text: "I'm really glad you didn't take it. That first offer comes fast on purpose, before anybody knows what's actually wrong with you. Once we're on it they talk to us instead of you and you're done taking those calls. Did you give them a statement, or just talk to them?" },
  { id: 'nolicense', phase: 'story', group: 'Insurance', title: "The other driver had no license. I don't think they had insurance.", text: "I'm glad you told me, and I'm not going to pretend that's nothing. It's also very much the kind of thing we deal with, and it's honestly the best reason to have somebody digging into it instead of you making phone calls trying to figure out who this person is. That's ours now, not yours. What insurance company came up on the paperwork, if any?" },
  { id: 'nolawyer', phase: 'story', group: 'Minimizing', title: "I don't need a lawyer for this.", text: "Fair enough, and nobody's telling you that you have to have one. What I'd say is the other side already has one, and their adjuster's job is to close this cheap and fast. Ours is to make sure nobody hands you a bill for a wreck you didn't cause. Were you the one driving?" },
  { id: 'cost', phase: 'money', group: 'Money', title: "What's this going to cost me?", text: "Nothing out of your pocket, not today and not later. We only get paid at the end out of the settlement, and the exact terms are laid out right in the agreement so you can read it yourself. Are you better by text or email?" },
  { id: 'later', phase: 'send', group: 'Stalls', title: "Just send me the information and I'll look at it later.", note: "This is the call killer. Do not accept it.", text: "I can absolutely send it. The only reason I'd rather stay on with you for two minutes is that it's two signatures and I can answer anything that looks funny while you've got me. Otherwise it sits in your texts and that report we're trying to pull gets a week older. Go ahead and put me on speaker, I'll be quick." },
  { id: 'think', phase: 'send', group: 'Stalls', title: "I want to think about it. / Let me talk to my husband.", text: "Of course, and you should. All I'm doing right now is getting it in front of you so you have it, nobody's signing anything they haven't read. Put him on speaker with us if he's there. Is he around?" },
  { id: 'sue', phase: 'send', group: 'Minimizing', title: "I don't want to sue anybody.", text: "Nobody's suing anybody today. This goes to an insurance company, not to that woman's living room. It's her insurance carrier's job to cover exactly this, it's what she pays them for. What I'm doing is getting your file open so those bills don't land on you. What's your date of birth?" },
  { id: 'legit', phase: 'any', group: 'Trust', title: "How do I know you're legit?", text: "Good instinct, you should ask that. {FIRM}, you can look the firm up while we're on the phone, I'll wait. The agreement I'm sending comes from the firm's name, not mine. Want me to send it so you can see it?" },
  { id: 'lawyerq', phase: 'any', group: 'Trust', title: "Are you a lawyer?", text: "No ma'am, I'm the intake center for the firm. I get your file open and get you to your attorney. Anything legal, that's them, and you'll have them on the phone this week. Now tell me about that pain." },
  { id: 'terrible', phase: 'body', group: 'Already has a lawyer', title: "I've got a lawyer already but they've been terrible.", note: "Only after she raises it. Good case only. A fender bender with low limits gets charged back, so let it go.", text: "That's frustrating and I'm sorry. I'm not going to tell you what to do about your attorney, that's between you and them. What I can do is have one of ours call you so you can ask them straight what your options look like. Nothing happens off that call except you get answers. Do you want me to set that up?" },
  { id: 'worth', phase: 'money', group: 'Money', title: "What is my case worth?", text: "I get why that is the first thing on your mind. Nobody can put a number on it this early, and anyone who does is guessing. It comes down to your medical records and how your treatment goes, and that has not happened yet. That is actually why I am asking about the treatment. When were you last seen?" },
  { id: 'lose', phase: 'money', group: 'Money', title: "Do I pay anything if we lose?", note: "Answer this one straight. Ducking it makes you sound like you are hiding something.", text: "No, and I am glad you asked. No recovery, no fee. That is what contingency means and it is in the agreement in writing. Are you on your cell right now, or at a computer?" },
  { id: 'hidden', phase: 'money', group: 'Money', title: "Are there hidden costs?", text: "Fair thing to ask. It is all in one document and you will have it in front of you in about a minute. Are you on your cell or at a computer?" },
  { id: 'scam', phase: 'open', group: 'Trust', title: "How do I know this is not a scam?", text: "Completely fair, and I would rather you ask than not. I am not asking you for money or a card number. You are going to get a document from the firm with their information on it, and you can look them up before you sign a thing. What is the best email for you?" },
  { id: 'neverheard', phase: 'open', group: 'Trust', title: "I have never heard of this firm.", text: "That is alright. Most people have not heard of their doctor before they needed one. What matters is whether they handle cases like yours, and they do. So where are you hurting?" },
  { id: 'shop', phase: 'send', group: 'Stalls', title: "I want to shop around.", text: "You should feel good about who you go with. The only thing I would say is the other side's insurance company is already working on this. Every day without someone on your side is a head start for them. What would you need to hear to feel good about moving today?" },
  { id: 'tomorrow', phase: 'send', group: 'Stalls', title: "Can you call me back tomorrow?", note: "Never end a call without a time. An unscheduled callback is a lost file.", text: "I can do that. Most of what is left I already have in front of me. Is first thing in the morning better for you, or right after work?" },
  { id: 'busy', phase: 'open', group: 'Stalls', title: "I am busy right now.", text: "No problem, I will be quick. Most of this I already have. Were you the driver or the passenger?" },
  { id: 'fender', phase: 'body', group: 'Minimizing', title: "It was just a fender bender.", text: "A lot of the worst injuries come out of low speed wrecks. What matters is what is going on with you, not what the bumper looks like. Where are you having pain?" },
  { id: 'court', phase: 'send', group: 'Minimizing', title: "I do not want to go to court.", text: "Understandable. Most of these never see a courtroom, they get worked out with the insurance company. I cannot tell you how yours goes and I will not guess. Have you been seen by a doctor yet?" },
  { id: 'nicedriver', phase: 'body', group: 'Minimizing', title: "The other driver was nice, I do not want to cause him trouble.", text: "That says something good about him. It does not touch him. His insurance handles it, and that is what he has been paying them for. Did he have insurance, do you know?" },
  { id: 'nohealth', phase: 'body', group: 'Medical', title: "I have no health insurance so I cannot go.", note: "Do not promise treatment, funding, a letter of protection or a specific provider.", text: "That is the most common reason people put it off. It is also something the firm deals with constantly, and it is worth asking them about once you are signed up. If it turned out not to be a barrier, would you be willing to get looked at?" },
  { id: 'notime', phase: 'body', group: 'Medical', title: "I do not have time.", text: "I understand, and I will be straight with you. If nobody documents this there is nothing to show for it later. Even one visit puts it on paper. Could you get in this week?" },
  { id: 'feelfine', phase: 'body', group: 'Medical', title: "I feel fine.", text: "Good. Get looked at anyway. Two days from now is when most people stop feeling fine. Would you be willing to go?" },
  { id: 'stopped', phase: 'body', group: 'Medical', title: "I already stopped treating.", note: "This is the gap problem happening in front of you. The reask is the whole rebuttal.", text: "Okay, that happens. Things come up and people fall off. If a doctor told you to come back in, would you go?" },
  { id: 'hatedocs', phase: 'body', group: 'Medical', title: "I hate doctors.", text: "You are not alone. One visit, and if everything is clear you are done. Would you be willing to do that much?" },
  { id: 'adjnice', phase: 'body', group: 'Insurance', title: "Their adjuster already called and seemed nice.", text: "They usually are. That is the job. The adjuster works for the insurance company, not for you. Whether you hire anybody is entirely your call. Have you signed or given them anything yet?" },
  { id: 'toldno', phase: 'body', group: 'Insurance', title: "They told me I do not need a lawyer.", text: "You will hear that. The adjuster works for the insurance company. Whether you hire anybody is your decision to make, not theirs. Where are you having pain?" },
  { id: 'statement', phase: 'body', group: 'Insurance', title: "They want a recorded statement.", note: "Do not tell them to give one and do not tell them to refuse. That is legal advice.", text: "Let me make a note of that for the attorney. That is something they will want to talk with you about directly. Have you given them one yet?" },
  { id: 'owninsurance', phase: 'body', group: 'Insurance', title: "My own insurance is handling it.", text: "They are handling your car. That is a separate claim from the injury, and your own carrier is not representing you against the other driver. Do you carry uninsured motorist on your policy, do you know?" },
  { id: 'rates', phase: 'body', group: 'Insurance', title: "Will my rates go up?", text: "Fair thing to worry about. You are claiming on the other driver's policy, not your own. Anything that touches your coverage is something the firm can walk you through. Do you know if you carry uninsured motorist?" },
  { id: 'nopoint', phase: 'body', group: 'Insurance', title: "The other guy had no insurance so there is no point.", text: "Not necessarily. A lot of policies carry uninsured motorist coverage that steps in for exactly this situation. Do you know if you have that on yours?" },
  { id: 'howlong', phase: 'send', group: 'Process', title: "How long is this going to take?", text: "Depends on your treatment, and I will not guess at it. Nobody can value it until you are done healing. What I can tell you is it starts moving the day you are signed up. Where are you being treated now?" },
  { id: 'whatdo', phase: 'send', group: 'Process', title: "What do I have to do?", text: "Not much, honestly. Keep your appointments and send us anything that comes in the mail. That is genuinely it. Are you on your cell or at a computer?" },
  { id: 'paperwork', phase: 'send', group: 'Process', title: "I do not want a bunch of paperwork.", text: "There is not much. It is a short agreement and it takes about two minutes on your phone. Are you on your cell right now?" },
  { id: 'noesign', phase: 'send', group: 'Signing', title: "I do not sign things electronically.", text: "I understand that. It is the same as signing on paper and you get your own copy the second you are done. I will stay on the line with you the whole way through. Are you on your cell or at a computer?" },
  { id: 'readfirst', phase: 'send', group: 'Signing', title: "I want to read it first.", text: "Please do. I have read that contract more times than the hot and cold on my own faucet. Take your time, I will wait. Anything on there that is not clear, I will get you an answer. Do you have it in front of you yet?" },
  { id: 'ownlawyer', phase: 'send', group: 'Signing', title: "I want my own lawyer to look at it.", text: "You are welcome to have anyone look at it. It is a short agreement and there is nothing buried in it. Is there a part you want me to walk you through?" },
  { id: 'phone', phase: 'send', group: 'Signing', title: "My phone is acting up.", text: "No problem, I can send it another way. Are you near a computer?" },
  { id: 'otherfirm', phase: 'body', group: 'Already has a lawyer', title: "I already talked to another firm.", note: "A conversation is not representation. Signed paperwork is.", text: "Okay. Did you sign anything with them, or was it just a conversation?" },
  { id: 'cousin', phase: 'body', group: 'Already has a lawyer', title: "My cousin is a lawyer.", text: "Good to have. Does he handle car accident cases himself, or would he be referring it out?" }
];
export const REB_GROUPS: any[] = ['Opening', 'Trust', 'Money', 'Stalls', 'Minimizing', 'Medical', 'Insurance', 'Process', 'Signing', 'Already has a lawyer'];

// Common ground and rambling lines, from the CarCure training page. {NAME} fills with the caller.
export const LINES: any[] = [
  { head: 'Common ground', note: 'It has to be about her. One line, a beat, then back to work. Before the signature only. Never about the accident, never during the injury questions.', items: [
    ['Her car, reliable', 'Those things run forever. My buddy put two hundred thousand on his and it still would not quit.'],
    ['Older truck', 'That body style is the good one. They do not build them like that now.'],
    ['A junker', 'Hey, if you saw some of the junkers I have driven you would feel a lot better about yours.'],
    ['Something nice', 'Holy smokes, good for you. What a beautiful machine.'],
    ['Minivan with kid seats', 'The family hauler. How many do you have back there?'],
    ['A city you do not know', 'I have never been out there. Is it as nice as people say?'],
    ['Somewhere remote', 'I had to look that one up, I will be honest with you. How long have you been out there?'],
    ['A team town', 'Rough year for your guys, huh?'],
    ['A name you like', '{NAME}. That is a good name, you do not hear it much anymore.']
  ] },
  { head: 'She will not stop talking', note: 'Turn it at sixty seconds. Say her name, go up in energy, come in on a breath, double the word. Never anyway, never okay so. Always promise to come back to it.', items: [
    ['Cut in', 'Ope, hang on, hang on, {NAME}, before I forget.'],
    ['Cut in', '{NAME}, real quick, real quick, I gotta get something down before I lose it.'],
    ['Cut in', 'Hey, hold that thought, hold that thought, I do not wanna lose that one.'],
    ['Cut in', 'Ooh, wait, let me ask you this real quick before I forget.'],
    ['Turn it back', 'Hold that thought for me, I do not wanna lose it. Two quick things and it is all yours.'],
    ['Turn it back', 'That is exactly the kind of detail the attorney is gonna want. Let me get you locked in first, then we will get all of it down properly.'],
    ['Turn it back', 'I appreciate that, and we will get every bit of it down. Right now I just need the outline.'],
    ['Turn it back', 'Man, I could do this all day. Let me knock out a couple things first so I am not keeping you on here forever.']
  ] },
  { head: 'Anything legal', note: 'Then reask. Always.', items: [
    ['Say', 'That is exactly the kind of thing the attorney will go over with you. What I can do is get you in front of them today.']
  ] }
];

// Dispositions. One per call, and every reason is a button so reports can count them.
export const DISPOS: any[] = [
  { code: 'signed', label: 'Signed' },
  { code: 'esign', label: 'E-sign sent, not signed', whyHead: "Why she didn't sign", when: true, whenHead: 'Follow up',
    why: ['Tech issue', 'Phone died or dropped', 'Spouse or family', 'Wants to read it (trust)', 'Busy, will sign later', 'Hung up', 'Talking to another firm', 'Other'] },
  { code: 'dq', label: 'Disqualified', whyHead: 'Why',
    why: ['At fault', 'No injury', "Won't treat", '30+ day gap', 'Past the deadline', 'No coverage anywhere', 'Already paid for injury', 'Has an attorney', 'Fender bender, low limits', 'Not in the crash', 'Other'] },
  { code: 'callback', label: 'Call back', whyHead: 'Why', when: true, whenHead: 'When', needWhen: true,
    why: ['At work', 'Driving', 'Wants spouse on', 'Bad connection', 'Needs her papers', 'Other'] },
  { code: 'ni', label: 'Not interested', whyHead: 'Why',
    why: ["Doesn't want a lawyer", 'Handling it herself', 'Not hurt enough', 'Hung up', 'Other'] },
  { code: 'dnc', label: 'Requested DNC' }
];
export const WHEN: any[] = ['In an hour', 'Tonight', 'Tomorrow morning', 'Tomorrow evening', 'Pick a time'];


export const BODYQ: any[] = [
  { key: 'pain', label: 'Pain', multi: true, nextLabel: "That's where it hurts, next", line: "Tell me about the pain you're dealing with from this.", cue: 'Not "were you injured." Not "are you hurt."', opts: ['Neck', 'Back', 'Head', 'Shoulder', 'Arms or hands', 'Knees or legs', 'Chest', "Says she's fine"] },
  { key: 'seen', label: 'Seen by', multi: true, only: 'Not yet', nextLabel: "That's everywhere she's been, next", line: "Have you been seen by anybody yet, ER, urgent care, your own doctor?", cue: 'Tap every place she went. Not yet goes straight to willing.', opts: ['ER', 'Urgent care', 'Own doctor', 'Chiropractor', 'Not yet'] },
  // The 30-day check. Dates, so the engine can do the math for the agent
  // (gapCheck). The quick picks fill the date; the date box takes any other day.
  { key: 'firstAt', label: 'First seen', date: true, line: "When did you first get seen after the wreck?", cue: 'More than 30 days after the wreck is a gap.', opts: ['Same day', 'Not sure'] },
  { key: 'lastAt', label: 'Last seen', date: true, line: "When were you last seen for it?", cue: 'More than 30 days ago is a gap. Flag it, do not close it.', opts: ['Today', 'Yesterday', 'Not sure'] },
  { key: 'stretch', label: 'Month with no visit', line: "Has there been a stretch of more than a month where you didn't see anybody for it?", cue: 'Yes is a gap. Flag it, do not close it.', opts: ['Yes', 'No', 'Not sure'] },
  { key: 'willing', label: 'Will treat', line: "If we get you in with somebody local this week, are you able to go?", soonLine: "Can you get in today or tomorrow?", cue: 'The single best predictor of whether the file survives.', opts: ['Yes', 'Maybe', 'No'] },
  { key: 'work', label: 'Missed work', line: "Have you had to miss any work over this?", cue: '', opts: ['Yes', 'No', 'Not working'] },
  { key: 'exchanged', label: 'Exchanged info', line: "Did you and the other driver exchange information out there?", cue: 'Never ask "did the other driver have insurance."', opts: ['Yes', 'No', 'Police handled it', 'Hit and run'] },
  { key: 'coverage', label: 'Her coverage', line: "And do you carry full coverage on your own car, or just liability?", cue: '', opts: ['Full coverage', 'Just liability', 'No insurance', 'Not sure'] },
  { key: 'uim', label: 'UM/UIM', line: "Do you have uninsured or underinsured motorist coverage on your own policy?", cue: 'Most people do not know. Not sure is not a no. Keep going.', opts: ['Yes', 'No', 'Not sure'] },
  { key: 'check', label: 'Injury check', line: "Have you accepted any settlement or payment for your injuries? Not for the vehicle, for the injuries.", cue: 'The second sentence is the question. Payment for the car is routine. Payment for the injury closes the claim.', opts: ['No', 'Only for the car', 'Yes, for injuries'] },
  { key: 'rep', label: 'Signed elsewhere', line: "Has anybody else already had you sign anything on this, another firm or an attorney?", cue: 'Say it flat and warm, same pace as her zip code.', opts: ['No', 'Yes'] }
];

function fmtPhone(raw) {
  var d = String(raw || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : (raw || 'her phone');
}
function fmtWhen(iso) {
  var t = iso ? new Date(iso) : null;
  if (!t || isNaN(t.getTime())) return '';
  var h = t.getHours(), m = t.getMinutes();
  return (t.getMonth() + 1) + '/' + t.getDate() + ' ' + ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
}
export const FINE = "Says she's fine";
export const SEATS: any[] = ['Driver', 'Passenger', 'Pedestrian', 'Other'];
// Short single-choice answers render as a segmented control when the words fit; everything else is an iOS check list.
// "2026-09-14" -> "09/14/2026"
function mdy(iso: any) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[2] + '/' + m[3] + '/' + m[1] : String(iso || '');
}
// Calendar-day math on local dates, so "3 days ago" never drifts with the clock.
function isoOf(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayNo(iso: any) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return isNaN(t) ? null : Math.round(t / 86400000);
}
function todayNo() { return dayNo(isoOf(new Date())); }
function isoFromNo(n: number) { return new Date(n * 86400000).toISOString().slice(0, 10); }
// "Oct 3"
function shortDay(n: number) {
  return new Date(n * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function daysWord(n: number) { return n === 1 ? '1 day' : n + ' days'; }
// The date of the wreck from Story, "2026-09-14", or '' when there is none yet.
// One definition: the days-ago math, the agreement's on/around blank and the
// preview all read it.
export function crashIsoOf(st: any): string {
  if (!st) return '';
  if (st.when === 'Today') return isoFromNo(todayNo());
  if (st.when === 'Yesterday') return isoFromNo(todayNo() - 1);
  if (st.when === 'Pick a date') {
    var n = dayNo(st.date);
    if (n != null && n >= dayNo('1990-01-01') && n <= todayNo()) return st.date;
  }
  return '';
}
// "09/14/2026" for the agreement, or ''.
export function doiOf(st: any): string { return mdy(crashIsoOf(st)) || ''; }

function chipsCls(opts: any, multi: any) {
  var room = { 2: 16, 3: 12, 4: 10 }[opts.length];
  var seg = !multi && !!room && opts.every((o) => o.length <= room);
  return seg ? 'chips seg' : 'chips list';
}


export interface CallProps {
  callerName: string;
  callerPhone?: string;
  callerEmail?: string;
  /** The campaign and file number, shown on the caller card on a computer or iPad. */
  campaign?: string;
  leadNo?: string;
  canHear?: boolean;
  /** TMP's split is only shown on TMP campaigns. */
  showFees?: boolean;
  agentName: string;
  firmSpoken: string;
  textFrom: string;
  startedAt: number;
  saved?: any;
  reasons: { esign: Reason[]; dq: Reason[]; callback: Reason[]; ni: Reason[] };
  notifyDefaults: { who: string; how: string }[];
  esign: { status: string; configured: boolean; pax: Record<string, string> };
  /** What the marketer sent, shown on Story so the agent confirms instead of re-asking. */
  lead?: { from: string; said: string; tags: string[] } | null;
  now?: number;
}
export interface Reason { key: string; label: string }
export interface CallApi {
  sendAgreement(): void;
  sendPax(i: number): void;
  completeAgreement(): void;
  resendLink(): void;
  sendText(body: string): void;
  saveDispo(): void;
  home(): void;
  ask(text: string): void;
}

export class CallEngine {
  props: CallProps;
  api: CallApi;
  state: any;
  dispos: any[];
  onChange: (s: any) => void = () => {};

  constructor(props: CallProps, api: CallApi) {
    this.props = props;
    this.api = api;
    this.dispos = DISPOS.map((d: any) => (d.why ? Object.assign({}, d, { why: (props.reasons as any)[d.code] || [] }) : d));
    this.state = this.seed(props.saved);
  }

  setState(patch: any) {
    this.state = Object.assign({}, this.state, patch);
    this.onChange(this.state);
  }

  // Swap the firm token in rebuttal copy for the firm on this campaign.
  firmText(t: string): string {
    return String(t || '').replace(/\{FIRM\}/g, this.props.firmSpoken);
  }

  // What autosave keeps. Never the SSN, never screen state like open sheets.
  persistable() {
    var s = this.state;
    var file = Object.assign({}, s.file);
    delete file.ssn;
    return {
      phase: s.phase, free: s.free, bare: s.bare, visited: s.visited,
      // Where the agent is working, so the same call opened on another device
      // (phone to iPad) lands on the same section. A screen position, not an answer.
      at: s.fi.sec || null,
      // The crash date leaves the building as a DATE. "Today" saved as the
      // word made the incident move a day every day the file was reopened
      // (Astra review, Sep 27). On screen the chip stays Today/Yesterday;
      // in the record it is the calendar date it meant.
      story: (s.story.when === 'Today' || s.story.when === 'Yesterday')
        ? Object.assign({}, s.story, { when: 'Pick a date', date: crashIsoOf(s.story) })
        : s.story,
      body: s.body, car: s.car,
      send: { via: s.send.via, client: s.send.client, who: s.send.who, injured: s.send.injured, phone: s.send.phone, email: s.send.email },
      file: file
    };
  }

  seed(saved: any) {
    var s = {
      phase: 'open', free: false, bare: false, view: 'guided', modeMenu: false, visited: {}, sheet: false, reb: null, openRow: null, elapsed: 0, saved: false,
      // Full Intake screen state: the open section, the question being changed,
      // the one "Next" pointed at, the quick note. Never saved with the call.
      fi: { sec: 'incident', seen: { incident: true }, edit: null, flash: null, whenPick: false, quick: false, draft: '', lights: false, carrierQ: '', prov: '', jump: 0, target: null, finishAsk: false, cq: null, note: false },
      story: { fault: null, seat: null, seatOther: '', police: null, when: null, date: '', city: '', text: '' },
      helpTab: 'now', askText: '', askOut: null, lineFocus: 'common',
      text: { open: false, draft: '', thread: [] },
      dispo: { open: false, pick: null, list: true, why: [], auto: false, when: null, at: '', note: '', add: '', saved: false, notify: this.props.notifyDefaults.map((n) => ({ who: n.who, how: n.how, on: true })) },
      storyOpen: null, leadOpen: false,
      body: { pain: [], seen: [], providers: [], done: {}, last: null, firstAt: null, lastAt: null, stretch: null, willing: null, work: null, exchanged: null, coverage: null, uim: null, check: null, rep: null, repUnhappy: null, repKind: null, focus: null },
      car: { justMe: false, people: [] },
      send: { via: 'Text', status: this.props.esign.status || 'ready', client: this.props.callerName || '', phone: this.props.callerPhone || '', email: this.props.callerEmail || '', error: '', who: 'Same as signer', injured: '' },
      file: { step: 'agreement', dob: '', ssn: '', agreement: 'open', addr: '', dl: '', ecName: '', ecPhone: '', ecRel: null, carrier: 'Pick one', report: '', vYear: 'Year', vMake: '', vModel: '', pax: Object.assign({}, this.props.esign.pax) }
    };
    if (saved && typeof saved === 'object') {
      ['phase', 'free', 'bare', 'visited'].forEach((k) => { if (saved[k] != null) s[k] = saved[k]; });
      // Freestyle became Full Intake: a call saved in it opens there.
      s.view = s.bare ? 'qa' : (s.free ? 'full' : 'guided');
      if (s.view === 'full') s.free = false;
      ['story', 'body', 'car', 'send', 'file'].forEach((k) => { if (saved[k] && typeof saved[k] === 'object') s[k] = Object.assign({}, s[k], saved[k]); });
      // Back on the section she was in. restoredAt keeps it until Guided moves the call on.
      if (saved.at === 'retainer' || INTAKE_SECTIONS.some((x) => x.id === saved.at)) s.fi = Object.assign({}, s.fi, { sec: saved.at, seen: { [saved.at]: true }, restoredAt: s.phase });
      s.send.status = this.props.esign.status || 'ready';
      s.file.pax = Object.assign({}, this.props.esign.pax);
      s.file.ssn = '';
    }
    return s;
  }

  // Call ended: open the dispo screen, guessing the obvious answer from the send status.
  openDispo() {
    var s = this.state, st = s.send.status;
    var pick = s.dispo.pick || (st === 'signed' ? 'signed' : st !== 'ready' ? 'esign' : null);
    this.setState({ dispo: Object.assign({}, s.dispo, { open: true, pick: pick, list: !pick }), sheet: false, modeMenu: false });
  }

  // Disqualified pre-checks whatever the red lights already say.
  dqFromCall() {
    var g = this.gates(), b = this.state.body, out: string[] = [];
    var bad = (label: string) => (g.find((x: any) => x.label === label) || { cls: '' }).cls.indexOf('bad') >= 0;
    [['Fault', 'at_fault'], ['Treat', 'no_treatment'], ['Gap', 'treatment_gap'], ['SOL', 'sol'], ['Ins', 'no_coverage'], ['Check', 'settled']]
      .forEach((x) => { if (bad(x[0])) out.push(x[1]); });
    if (b.rep === 'Yes' && !this.repGood(b)) out.push('already_rep');
    var known = (this.props.reasons.dq || []).map((r) => r.key);
    return out.filter((k) => known.indexOf(k) >= 0);
  }

  dispoPick(code: any) {
    var d = this.state.dispo;
    // Collapsed to the pick: tapping it opens the full list again.
    if (!d.list) return this.setState({ dispo: Object.assign({}, d, { list: true }) });
    if (d.pick === code) return this.setState({ dispo: Object.assign({}, d, { list: false }) });
    var why = code === 'dq' ? this.dqFromCall() : [];
    this.setState({ dispo: Object.assign({}, d, { pick: code, list: false, why: why, auto: why.length > 0, when: null, at: '' }) });
  }

  sendText(body: string) {
    if (!body) return;
    this.api.sendText(body);
  }


  set(group: any, key: any, val: any) {
    var g = Object.assign({}, this.state[group]);
    g[key] = val;
    var patch = {};
    patch[group] = g;
    this.setState(patch);
  }

  pick(group: any, key: any, val: any) {
    this.set(group, key, this.state[group][key] === val ? null : val);
  }

  toggle(group: any, key: any, val: any) {
    var arr = (this.state[group][key] || []).slice();
    var i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    this.set(group, key, arr);
  }

  chips(group: any, key: any, opts: any, warnVal: any, small: any) {
    var cur = this.state[group][key];
    return opts.map((o) => ({
      label: o,
      cls: 'chip' + (small ? ' sm' : '') + (o === warnVal ? ' warn' : '') + (cur === o ? ' on' : ''),
      pick: () => this.pick(group, key, o)
    }));
  }

  field(group: any, key: any) {
    return { value: this.state[group][key] || '', set: (e: any) => this.set(group, key, e.target.value) };
  }

  go(phase: any) {
    var visited = Object.assign({}, this.state.visited);
    visited[this.state.phase] = true;
    this.setState({ phase: phase, sheet: false, visited: visited });
  }

  // One definition of "is this part of the call filled in". Tabs, jump links,
  // body pills, story labels and Q&A rows all read it.
  sections() {
    var s = this.state, st = s.story, b = s.body, f = s.file;
    var gaps = (pairs: any) => pairs.filter((x) => !x[1]).map((x) => x[0]);
    var live = BODYQ.filter((q) => this.applies(b, q));
    var open = (keys: any) => live.filter((q) => keys.indexOf(q.key) >= 0 && !this.answered(b, q)).map((q) => q.key);
    var injKeys = ['pain', 'seen', 'firstAt', 'lastAt', 'stretch', 'willing', 'work'], covKeys = ['exchanged', 'coverage', 'uim', 'check', 'rep'];
    var touched = (keys: any) => keys.some((k) => Array.isArray(b[k]) ? b[k].length > 0 : b[k] != null);
    var sec = {
      story: { missing: gaps([['fault', st.fault], ['seat', st.seat && (st.seat !== 'Other' || st.seatOther)], ['police', st.police], ['when', st.when && (st.when !== 'Pick a date' || st.date)], ['city', st.city]]),
               started: !!(st.fault || st.seat || st.police || st.when || st.city) },
      injury: { missing: open(injKeys), started: touched(injKeys) },
      cover: { missing: open(covKeys), started: touched(covKeys) },
      car: { missing: s.car.justMe ? [] : (s.car.people.length ? s.car.people.filter((p) => !p.age || !p.hurt).map((p, i) => 'p' + i) : ['who']),
             started: s.car.justMe || s.car.people.length > 0 },
      send: { missing: s.send.status === 'signed' ? [] : ['signed'], started: s.send.status !== 'ready' },
      file: { missing: gaps([['dob', f.dob], ['ssn', f.ssn], ['addr', f.addr]]), started: !!(f.dob || f.ssn || f.addr || f.dl || f.ecName) },
      close: { missing: s.saved ? [] : ['saved'], started: !!s.saved }
    };
    sec.body = { missing: sec.injury.missing.concat(sec.cover.missing), started: sec.injury.started || sec.cover.started };
    sec.open = { missing: [], started: true };
    sec.money = { missing: [], started: true };
    return sec;
  }

  // Tab state for a list of section keys in call order: done (green check),
  // missing (amber, left behind with a blank), current, or not reached yet.
  // Guided flags what the agent walked past; Freestyle and Q&A flag what sits
  // blank behind a later section that already has answers.
  tabStates(keys: any, current: any) {
    var sec = this.sections(), v = this.state.visited || {}, cur = keys.indexOf(current);
    var later = (i: any) => keys.slice(i + 1).some((k) => sec[k] && sec[k].started);
    return keys.map((k, i) => {
      var x = sec[k], quiet = k === 'open' || k === 'money';
      var reached = current ? (i < cur || v[k]) : later(i);
      var full = quiet ? reached : x.missing.length === 0;
      var miss = !full && !quiet && (reached || (!current && x.started && later(i)));
      return { key: k, full: full, miss: miss && k !== current };
    });
  }

  setPerson(i: any, key: any, val: any) {
    var people = this.state.car.people.map((p, j) => (j === i ? Object.assign({}, p, { [key]: val }) : p));
    this.setState({ car: Object.assign({}, this.state.car, { people: people, justMe: false }) });
  }

  // One definition of "which state was the wreck in". The agreement and the SOL light
  // both read it. Takes "Houston, TX" or "Houston, Texas".
  stateCode(city: any) { return stateCodeOf(city); }

  agreementFor(city: any) {
    var code = this.stateCode(city);
    if (!code) return null;
    if (code === 'TX') return 'Texas';
    if (code === 'FL') return 'Florida';
    return 'All other states (AL/GA)';
  }

  crashDate() {
    var d = this.daysAgo();
    if (d == null) return null;
    var t = new Date(); t.setHours(12, 0, 0, 0);
    return new Date(t.getTime() - d * 86400000);
  }

  injuryYears(code: any, when: any) { return injuryYearsFor(code, when); }

  // The SOL light: which state, how many years, how many days left.
  sol() {
    var code = this.stateCode(this.state.story.city);
    var r = code ? SOL.find((x) => x[0] === code) : null;
    if (!r) return { has: false, daysLeft: null, text: '' };
    var when = this.crashDate();
    var yrs = this.injuryYears(code, when);
    var span = yrs + (yrs === 1 ? ' year' : ' years');
    if (!when) return { has: true, daysLeft: null, text: r[1] + ': ' + span + ' to file. Needs the crash date.' };
    var dl = new Date(when.getTime()); dl.setFullYear(dl.getFullYear() + yrs);
    var left = Math.floor((dl.getTime() - Date.now()) / 86400000);
    var day = dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return { has: true, daysLeft: left, text: r[1] + ': ' + span + '. Deadline ' + day + (left < 0 ? ', already passed.' : ', ' + left + ' days left.') };
  }

  // Calendar days, so a wreck yesterday is 1 day ago at any hour.
  daysAgo() {
    var n = dayNo(crashIsoOf(this.state.story));
    return n == null ? null : Math.max(0, todayNo() - n);
  }

  // She has an attorney, she said first that she's unhappy, and it sounds like a good case.
  // A fender bender with low limits gets charged back, so it stays a no.
  repGood(b) { return b.rep === 'Yes' && !!b.repUnhappy && b.repKind === 'Good case'; }

  seenYes(b) { return b.seen.length > 0 && b.seen.indexOf('Not yet') < 0; }
  seenNo(b) { return b.seen.indexOf('Not yet') >= 0; }

  answered(b: any, q: any) {
    if (q.key === 'seen') return this.seenNo(b) || (!!b.done.seen && b.seen.length > 0);
    if (q.multi) return !!b.done[q.key];
    if (q.date) return b[q.key] === 'unsure' || b[q.key] === 'same' || this.visitNo(b, q.key) != null;
    return b[q.key] != null;
  }

  // The crash as a day number (see dayNo), or null when there is no date yet.
  crashNo() {
    var d = this.daysAgo();
    return d == null ? null : todayNo() - d;
  }

  // A visit date that makes sense: on or after the wreck, not in the future.
  // "same" is the quick pick Same day, which follows the crash date.
  visitNo(b: any, key: any) {
    var raw = b[key];
    if (raw === 'same') return this.crashNo();
    var n = dayNo(raw);
    if (n == null || n > todayNo() || n < dayNo('2000-01-01')) return null;
    var c = this.crashNo();
    return c != null && n < c ? null : n;
  }

  // Branching for the 30-day check. Every question here is a date or a yes/no
  // the calculator (gapCheck) needs, and only when the math can need it:
  //   first visit: the wreck was more than 30 days ago (or no date yet)
  //   last visit: 25+ days, so a gap coming up inside 5 days is caught
  //   a month with no visit: first to last visit spans more than 30 days,
  //     and the dates do not already show a gap
  //   willing: not seen, a gap, a not sure, or under 5 days left
  applies(b: any, q: any) {
    var days = this.daysAgo();
    if (q.key === 'firstAt') return this.seenYes(b) && (days == null || days > 30);
    if (q.key === 'lastAt') return this.seenYes(b) && (days == null || days >= 25);
    if (q.key === 'stretch') {
      if (!this.seenYes(b)) return false;
      var fa = this.visitNo(b, 'firstAt'), la = this.visitNo(b, 'lastAt'), c = this.crashNo();
      // A gap the dates already show needs no more asking.
      if (la != null && todayNo() - la > 30) return false;
      if (fa != null && c != null && fa - c > 30) return false;
      if (fa != null && la != null) return la - fa > 30;
      return days != null && days > 60;
    }
    if (q.key === 'willing') { var g = this.gapCheck(b); return this.seenNo(b) || g.bad || g.unsure || g.urgent; }
    if (q.key === 'uim') return b.coverage !== 'No insurance';
    return true;
  }

  // The 30-day calculator. From the crash date and her visits it works out
  // whether there is a gap anywhere (wreck to first visit, between visits,
  // last visit to today), when the next visit is due, and whether that is
  // close enough (under 5 days) to ask about today or tomorrow.
  gapCheck(b?: any) {
    b = b || this.state.body;
    var days = this.daysAgo(), crash = this.crashNo(), today = todayNo();
    var r: any = { head: '', hint: '', dueLine: '', lines: [], bad: false, unsure: false, urgent: false, dueNo: null, left: null, visits: 0, status: '' };
    var ago = (n: any) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : daysWord(n) + ' ago');
    var line = (t: any, tone: any) => r.lines.push({ t: t, tone: tone || '' });
    var bad = (t: any) => { r.bad = true; line(t, 'bad'); };
    var dueText = (left: any) => (left === 0 ? 'today is the last day' : daysWord(left) + ' left');
    if (days != null) r.visits = Math.max(0, Math.ceil(days / 30) - 1);
    var many = r.visits >= 2 ? ' With no gap she has been seen at least ' + r.visits + ' times, never more than 30 days apart.' : '';
    var complete = false;

    if (this.seenNo(b)) {
      if (days == null) r.head = 'Needs the crash date to know how long she has to get seen.';
      else {
        r.dueNo = crash + 30; r.left = r.dueNo - today;
        r.head = 'Wreck was ' + ago(days) + '.';
        if (r.left < 0) bad('Not seen in ' + daysWord(days) + '. That is a gap.');
        else { line('Has to be seen by ' + shortDay(r.dueNo) + ', ' + dueText(r.left) + '.', r.left < 5 ? 'warn' : ''); r.urgent = r.left < 5; r.dueLine = 'Has to be seen by ' + shortDay(r.dueNo) + '.'; }
        complete = true;
      }
    } else if (this.seenYes(b)) {
      r.head = days == null ? 'Needs the crash date to check her first visit.' : 'Wreck was ' + ago(days) + '.' + many;
      var fa = this.visitNo(b, 'firstAt'), la = this.visitNo(b, 'lastAt');
      if (days == null || days > 30) {
        if (b.firstAt === 'unsure') { r.unsure = true; line('Not sure when she was first seen.', 'warn'); }
        else if (fa != null && crash != null && fa - crash > 30) bad('First visit was ' + daysWord(fa - crash) + ' after the wreck. That is a gap.');
      }
      if (days == null || days >= 25) {
        if (b.lastAt === 'unsure') { r.unsure = true; line('Not sure when she was last seen.', 'warn'); }
        else if (la != null) {
          var since = today - la;
          if (since > 30) bad('Last visit was ' + daysWord(since) + ' ago. That is a gap.');
          else {
            r.dueNo = la + 30; r.left = r.dueNo - today; r.urgent = r.left < 5;
            line('Next visit due by ' + shortDay(r.dueNo) + ', ' + dueText(r.left) + '.', r.urgent ? 'warn' : '');
            r.dueLine = 'Next visit by ' + shortDay(r.dueNo) + '.';
          }
        } else if (b.last === 'Over 30 days ago') bad('Last visit was more than 30 days ago. That is a gap.');
      }
      if (this.applies(b, { key: 'stretch' })) {
        if (b.stretch === 'Yes') bad('She went more than a month with no visit. That is a gap.');
        if (b.stretch === 'Not sure') { r.unsure = true; line('Not sure about a month with no visit.', 'warn'); }
      }
      complete = ['firstAt', 'lastAt', 'stretch'].every((k) => !this.applies(b, { key: k }) || this.answered(b, BODYQ.find((x) => x.key === k)));
    } else if (days != null) {
      // Not asked yet: say what the date means so the agent knows what is coming.
      r.head = 'Wreck was ' + ago(days) + '. ' + (days <= 30 ? 'If she has not been seen yet, she needs to be by ' + shortDay(crash + 30) + '.' : (r.visits >= 2 ? 'She needs to have been seen at least ' + r.visits + ' times' : 'She needs to have been seen') + ', never more than 30 days apart.');
    }
    // The same thing in one line for Story, under the crash date.
    if (days != null) r.hint = days <= 30 ? 'If she has not been seen yet, she needs to be by ' + shortDay(crash + 30) + '.'
      : (r.visits >= 2 ? 'She needs to have been seen at least ' + r.visits + ' times' : 'She needs to have been seen') + ', never more than 30 days apart.';
    r.status = r.bad ? 'bad' : r.unsure ? 'flag' : r.urgent ? (b.willing === 'Yes' ? 'ok' : 'flag') : complete ? 'ok' : '';
    r.tone = r.bad ? 'bad' : (r.unsure || (r.urgent && b.willing !== 'Yes')) ? 'warn' : r.status === 'ok' ? 'ok' : '';
    return r;
  }

  // The 30-day check as the screen shows it.
  // A row like the others: the short answer on the right, the why under it.
  gapView() {
    var gc = this.gapCheck();
    var value = gc.bad ? 'Gap' : gc.left != null ? (gc.left === 0 ? 'Last day today' : daysWord(gc.left) + ' left') : gc.unsure ? 'Not sure' : gc.status === 'ok' ? 'No gap' : '';
    // The days left are already on the right, so the line under it says the date and any problem.
    var sub = [gc.head, gc.dueLine].concat(gc.lines.filter((l) => l.tone === 'bad' || /^Not sure/.test(l.t)).map((l) => l.t)).filter(Boolean).join(' ');
    return {
      show: !!(gc.head || gc.lines.length),
      cls: 'frow gaprow' + (gc.tone ? ' ' + gc.tone : ''),
      value: value, sub: sub,
      head: gc.head, lines: gc.lines
    };
  }

  // What a body question says out loud right now. Under 5 days to a gap, the
  // willing question becomes today or tomorrow.
  lineOf(q: any, b?: any) {
    if (q.key === 'willing' && q.soonLine && this.gapCheck(b).urgent) return q.soonLine;
    return q.line;
  }

  // The six basics, in Brett's order: not at fault, some coverage, no check for the
  // injury yet, willing to treat, no 30 day gap, inside the deadline.
  gates() {
    var st = this.state.story, b = this.state.body;
    var toBody = (key: any) => () => this.setState({ phase: 'body', sheet: false, body: Object.assign({}, this.state.body, { focus: key }) });
    var gate = (label: any, status: any, go: any, what: any, href: any) => ({ label: label, cls: 'gate' + (status ? ' ' + status : ''), go: go, href: href, aria: what + ': ' + (status === 'ok' ? 'good' : status === 'bad' ? 'problem' : status === 'flag' ? 'check' : 'not yet') });
    var fault = st.fault === 'Other driver' ? 'ok' : st.fault === 'Caller' ? 'bad' : st.fault ? 'flag' : '';
    // Insurance is never a pre-sign gate: red only when every source is a no.
    var exOk = b.exchanged === 'Yes' || b.exchanged === 'Police handled it';
    var exNo = b.exchanged === 'No' || b.exchanged === 'Hit and run';
    var covNo = b.coverage === 'Just liability' || b.coverage === 'No insurance';
    var umNo = b.uim === 'No' || b.coverage === 'No insurance';
    var cov = exOk || b.coverage === 'Full coverage' || b.uim === 'Yes' ? 'ok' : (exNo && covNo && umNo ? 'bad' : (b.exchanged || b.coverage || b.uim ? 'flag' : ''));
    var check = b.check === 'No' || b.check === 'Only for the car' ? 'ok' : b.check === 'Yes, for injuries' ? 'bad' : '';
    var gc = this.gapCheck(b);
    var gap = gc.status;
    // Under 5 days, the willing question is "today or tomorrow". A no there is
    // not a refusal to treat, it is a gap coming, so it flags instead of going red.
    var treat = b.willing === 'Yes' ? 'ok' : b.willing === 'No' ? (gc.urgent && !gc.bad ? 'flag' : 'bad') : b.willing === 'Maybe' ? 'flag'
      : (this.seenYes(b) && gap === 'ok' ? 'ok' : '');
    var sol = this.sol();
    var solS = sol.daysLeft != null ? (sol.daysLeft < 0 ? 'bad' : sol.daysLeft <= 90 ? 'flag' : 'ok') : (st.when || st.city ? 'flag' : '');
    return [
      gate('Fault', fault, () => this.go('story'), 'Not at fault', '#fs-story'),
      gate('Ins', cov, toBody('exchanged'), 'Some coverage', '#fs-body'),
      gate('Check', check, toBody('check'), 'No injury check yet', '#fs-body'),
      gate('Treat', treat, toBody('willing'), 'Willing to treat', '#fs-body'),
      gate('Gap', gap, toBody('seen'), 'No 30 day gap', '#fs-body'),
      gate('SOL', solS, () => this.go('story'), 'Inside the deadline', '#fs-story')
    ];
  }

  // What to ask if she did not say it while telling the story. One wording,
  // used by the "ask next" line on each fact row.
  storyAsks(): Record<string, string> {
    return {
      city: 'What city and state was that in?',
      when: 'And what day was that?',
      seat: 'Were you driving, or were you a passenger?',
      police: 'Did the police come out to the scene?',
    };
  }

  storyGaps() {
    var st = this.state.story, out = [], a = this.storyAsks();
    if (!this.stateCode(st.city)) out.push(a.city);
    if (!st.when || (st.when === 'Pick a date' && !st.date)) out.push(a.when);
    if (!st.seat) out.push(a.seat);
    if (!st.police) out.push(a.police);
    return out;
  }

  // The five facts, in the order that matters: where first (it picks the
  // agreement and the deadline), then when, then how. Each shows what was
  // captured, or what to ask.
  storyFacts() {
    var st = this.state.story, a = this.storyAsks(), days = this.daysAgo();
    var whenVal = !st.when ? '' : st.when !== 'Pick a date' ? st.when : (st.date ? mdy(st.date) + (days != null ? ', ' + (days === 1 ? '1 day ago' : days + ' days ago') : '') : '');
    var rows = [
      { key: 'city', label: 'Where', value: String(st.city || '').trim().replace(/,\s*$/, ''), done: !!this.stateCode(st.city), ask: a.city },
      { key: 'when', label: 'When', value: whenVal, done: !!whenVal, ask: a.when },
      { key: 'seat', label: 'She was', value: st.seat === 'Other' ? ('Other' + (st.seatOther ? ', ' + st.seatOther : '')) : (st.seat || ''), done: !!st.seat && (st.seat !== 'Other' || !!st.seatOther), ask: a.seat },
      { key: 'fault', label: 'Fault', value: st.fault || '', done: !!st.fault, ask: '' },
      { key: 'police', label: 'Police', value: st.police || '', done: !!st.police, ask: a.police },
    ];
    var next = rows.find((r) => !r.done);
    return rows.map((r) => Object.assign(r, { next: !!next && r.key === next.key }));
  }

  // Story as one list. One row open at a time: the one the agent tapped, or
  // else the first fact still missing. A tap that finishes a row closes it
  // and opens the next missing one, so the agent just follows the list.
  storyRows() {
    var s = this.state, st = s.story, facts = this.storyFacts();
    var auto = facts.find((r) => !r.done);
    var openKey = s.storyOpen === 'none' ? null : (s.storyOpen || (auto ? auto.key : null));
    var visited = !!(s.visited || {}).story;
    var gc = this.gapCheck();
    var sol = this.sol();
    return facts.map((r) => {
      var open = r.key === openKey;
      var bad = (r.key === 'fault' && st.fault === 'Caller') || (r.key === 'when' && sol.daysLeft != null && sol.daysLeft < 0);
      var sub = '';
      if (r.key === 'when' && r.done && !open) sub = gc.hint;
      if (r.key === 'city' && r.done && !open) sub = 'Agreement: ' + this.agreementFor(st.city);
      return {
        key: r.key, label: r.label, open: open, done: r.done,
        value: open ? '' : (r.value || (visited ? 'Missing' : 'Not yet')),
        sub: sub,
        cls: 'frow' + (open ? ' open' : '') + (r.done && !open ? ' done' : '') + (!r.done && !open && visited ? ' miss' : '') + (bad && !open ? ' warn' : ''),
        ask: !r.done && r.ask ? r.ask : '',
        toggle: () => this.setState({ storyOpen: open ? 'none' : r.key }),
        isCity: r.key === 'city', isWhen: r.key === 'when', isSeat: r.key === 'seat', isFault: r.key === 'fault', isPolice: r.key === 'police'
      };
    });
  }

  // A tap on a Story answer. Finishing the row moves the list on; Other (she
  // was) and Pick a date keep it open for the next bit.
  storyPick(key: any, val: any) {
    var st = Object.assign({}, this.state.story);
    st[key] = st[key] === val ? null : val;
    var stay = (key === 'seat' && st.seat === 'Other') || (key === 'when' && st.when === 'Pick a date' && this.storyDateOk(st.date) == null);
    this.setState({ story: st, storyOpen: stay ? key : null });
  }

  storyDateOk(iso: any) {
    var n = dayNo(iso);
    return n != null && n >= dayNo('1990-01-01') && n <= todayNo() ? n : null;
  }

  storyDate(value: any) {
    var st = Object.assign({}, this.state.story, { date: value || '' });
    this.setState({ story: st, storyOpen: this.storyDateOk(st.date) != null ? null : 'when' });
  }

  // Typing in Where keeps the row open. A Google match or a state pick
  // finishes it (storyWhereDone).
  storyCity(text: any) {
    this.setState({ story: Object.assign({}, this.state.story, { city: text }), storyOpen: 'city' });
  }

  storyWhereDone() {
    if (this.stateCode(this.state.story.city)) this.setState({ storyOpen: null });
  }

  currentQ() {
    var b = this.state.body;
    if (b.rep === 'Yes' && !this.repGood(b)) return null;
    if (b.focus) { var f = BODYQ.find((q) => q.key === b.focus); if (f) return f; }
    return BODYQ.find((q) => this.applies(b, q) && !this.answered(b, q)) || null;
  }

  // Q&A mode: the whole intake as plain label and answer rows. No script, no pointers.
  // Same state and same branching as Guided and Freestyle, so switching modes loses nothing.
  bareRows() {
    var s = this.state, b = s.body, st = s.story;
    var G = (id: any, label: any) => ({ isGroup: true, id: 'q-' + id, label: label });
    var sec = this.sections();
    var flagged = {};
    this.tabStates(['story', 'injury', 'cover', 'car', 'send', 'file'], null).forEach((t) => { if (t.miss) sec[t.key].missing.forEach((k) => { flagged[k] = true; }); });
    var lc = (key: any) => 'q-l' + (flagged[key] ? ' miss' : '');
    var C = (label: any, group: any, key: any, opts: any, warn: any) => ({ isChips: true, label: label, lcls: lc(key), chipsCls: chipsCls(opts, false), chips: this.chips(group, key, opts, warn, true) });
    var I = (label: any, group: any, key: any, ph: any, type: any, mode: any) => {
      var f = this.field(group, key);
      return { isInput: true, label: label, lcls: lc(key), ph: ph || '', type: type || 'text', mode: mode || 'text', value: f.value, set: f.set };
    };
    var S = (label: any, group: any, key: any, options: any) => ({ isSelect: true, label: label, value: s[group][key], set: this.field(group, key).set, options: options });
    var byKey = (k: any) => BODYQ.find((x) => x.key === k);
    var Q = (k: any) => {
      var x = byKey(k);
      return { isChips: true, label: x.label, lcls: lc(k), chipsCls: chipsCls(x.opts, x.multi), chips: x.opts.map((o) => ({
        label: o,
        cls: 'chip sm' + (o === FINE ? ' warn' : '') + ((x.multi ? b[k].indexOf(o) >= 0 : b[k] === (x.date ? this.quickDate(o) : o)) ? ' on' : ''),
        pick: () => this.bodyPick(x, o, true)
      })) };
    };
    var D = (k: any) => {
      var x = byKey(k), dv = this.dateBox(b, x);
      return { isInput: true, label: 'Or the date', lcls: 'q-l', ph: '', type: 'date', mode: 'text', value: dv.value, set: dv.set };
    };
    var years = ['Year'];
    for (var y = 2027; y >= 1990; y--) years.push(String(y));
    var rows = [];

    rows.push(G('crash', 'Crash'));
    rows.push(C('Fault', 'story', 'fault', ['Other driver', 'Caller', 'Not clear'], 'Caller'));
    rows.push(C('She was', 'story', 'seat', SEATS));
    if (st.seat === 'Other') rows.push(I('Explain', 'story', 'seatOther', 'What was she doing'));
    rows.push(C('Police came', 'story', 'police', ['Came out', 'No', 'Not sure']));
    rows.push(C('Date of wreck', 'story', 'when', ['Today', 'Yesterday', 'Pick a date']));
    if (st.when === 'Pick a date') rows.push(I('Date', 'story', 'date', '', 'date'));
    rows.push(I('City, State', 'story', 'city', 'City, State'));

    rows.push(G('injury', 'Injury'));
    ['pain', 'seen', 'firstAt', 'lastAt', 'stretch', 'willing', 'work'].forEach((k) => {
      if (!this.applies(b, byKey(k))) return;
      rows.push(Q(k));
      if (byKey(k).date) rows.push(D(k));
      if (k === 'seen') { var gv = this.gapView(); if (gv.show) rows.push({ isGap: true, g: gv }); }
    });

    rows.push(G('cover', 'Coverage'));
    ['exchanged', 'coverage', 'uim', 'check', 'rep'].forEach((k) => { if (this.applies(b, byKey(k))) rows.push(Q(k)); });
    if (b.rep === 'Yes') {
      rows.push(C('Unhappy with her attorney', 'body', 'repUnhappy', ["She said so"]));
      if (b.repUnhappy) rows.push(C('Case', 'body', 'repKind', ['Good case', 'Fender bender, low limits'], 'Fender bender, low limits'));
    }

    rows.push(G('car', 'Others in the car'));
    rows.push({ isChips: true, label: 'Passengers', lcls: lc('who'), chipsCls: 'chips list', chips: [
      { label: 'Just me', cls: 'chip sm' + (s.car.justMe ? ' on' : ''), pick: () => this.setState({ car: { justMe: !this.state.car.justMe, people: [] } }) },
      { label: 'Add passenger', cls: 'chip add', pick: () => this.setState({ car: { justMe: false, people: this.state.car.people.concat([{ name: '', rel: null, age: null, hurt: null }]) } }) }
    ] });
    s.car.people.forEach((p, i) => {
      var opt = (key: any, pairs: any) => pairs.map((v) => ({ label: v[1], cls: 'chip sm' + (p[key] === v[0] ? ' on' : ''), pick: () => this.setPerson(i, key, p[key] === v[0] ? null : v[0]) }));
      rows.push({ isPerson: true, p: {
        name: p.name, setName: (e: any) => this.setPerson(i, 'name', e.target.value),
        remove: () => this.setState({ car: Object.assign({}, this.state.car, { people: this.state.car.people.filter((x, j) => j !== i) }) }),
        ages: opt('age', [['Under 18', 'Under 18'], ['Adult', 'Adult']]),
        hurts: opt('hurt', [['Yes', 'Hurt'], ['No', 'Not hurt']])
      } });
    });

    rows.push(G('send', 'Agreement'));
    rows.push({ isInfo: true, label: 'Agreement', value: this.agreementFor(st.city) || 'Needs city and state' });
    rows.push(I('Signer full name', 'send', 'client', ''));
    rows.push(C('Injured person', 'send', 'who', ['Same as signer', 'Someone else']));
    if (s.send.who === 'Someone else') rows.push(I('Injured full name', 'send', 'injured', ''));
    rows.push(C('Send by', 'send', 'via', ['Text', 'Email']));
    if (s.send.status !== 'ready') rows.push({ isSteps: true, steps: this.stepsFor(s.send.status) });

    rows.push(G('after', 'After she signs'));
    rows.push(I('Date of birth', 'file', 'dob', 'MM/DD/YYYY', 'text', 'numeric'));
    rows.push(I('SSN', 'file', 'ssn', 'Last 4 or all 9', 'text', 'numeric'));
    var signed = s.send.status === 'signed';
    if (s.file.agreement === 'open') rows.push({ isButton: true, label: signed ? 'Complete the agreement' : 'Unlocks after she signs', disabled: !signed, go: () => { if (this.state.send.status === 'signed') this.api.completeAgreement(); } });
    else rows.push({ isInfo: true, label: 'Agreement', value: s.file.agreement === 'done' ? 'Complete' : 'QA in the morning' });
    rows.push(I('Home address', 'file', 'addr', ''));
    rows.push(I("Driver's license", 'file', 'dl', ''));
    rows.push(I('Emergency contact', 'file', 'ecName', 'Name'));
    rows.push(I('Emergency phone', 'file', 'ecPhone', '', 'tel', 'tel'));
    rows.push(C('Relationship', 'file', 'ecRel', ['Spouse or partner', 'Parent', 'Child', 'Sibling', 'Friend', 'Other']));
    rows.push(S("Other driver's insurance", 'file', 'carrier', ['Pick one', 'Not sure yet', 'State Farm', 'GEICO', 'Progressive', 'Allstate', 'USAA', 'Farmers', 'Liberty Mutual', 'Nationwide', 'Travelers', 'American Family', 'Other']));
    rows.push(I('Police report number', 'file', 'report', ''));
    rows.push(S('Vehicle year', 'file', 'vYear', years));
    rows.push(I('Vehicle make', 'file', 'vMake', ''));
    rows.push(I('Vehicle model', 'file', 'vModel', ''));
    var kinds = { isGroup: false, isChips: false, isInput: false, isSelect: false, isInfo: false, isSteps: false, isButton: false, isPerson: false, isGap: false };
    return rows.map((r) => Object.assign({}, kinds, r));
  }

  // One definition of what tapping a body answer does, used by both modes.
  // Guided: a multi answer waits for its Next button; a single answer moves on.
  // Freestyle: nothing moves; a multi answer counts once anything is tapped.
  bodyPick(q: any, o: any, free: any) {
    var nb = Object.assign({}, this.state.body);
    if (q.multi) {
      var arr = nb[q.key].slice();
      if (q.only && o === q.only) {
        arr = arr.indexOf(o) >= 0 ? [] : [o];
        nb.done = Object.assign({}, nb.done, { [q.key]: arr.length > 0 });
        nb.focus = null;
      } else {
        arr = arr.filter((v) => v !== q.only);
        var i = arr.indexOf(o);
        if (i >= 0) arr.splice(i, 1); else arr.push(o);
        nb.done = Object.assign({}, nb.done, { [q.key]: free ? arr.length > 0 : false });
      }
      nb[q.key] = arr;
      if (q.key === 'seen') { nb.last = null; nb.firstAt = null; nb.lastAt = null; nb.stretch = null; nb.willing = null; }
    } else {
      var val = q.date ? this.quickDate(o) : o;
      nb[q.key] = nb[q.key] === val ? null : val;
      nb.focus = null;
      if (q.key === 'rep' && nb.rep !== 'Yes') { nb.repUnhappy = null; nb.repKind = null; }
    }
    this.settleBody(nb);
    this.setState({ body: nb });
  }

  // A quick pick on a visit date, stored the way gapCheck reads it.
  quickDate(o: any) {
    if (o === 'Same day') return 'same';
    if (o === 'Not sure') return 'unsure';
    if (o === 'Today') return isoFromNo(todayNo());
    if (o === 'Yesterday') return isoFromNo(todayNo() - 1);
    return o;
  }

  // The date box on a visit question. A full, sensible date answers it (and
  // Guided moves on); half-typed years do not.
  bodyDate(q: any, value: any) {
    var nb = Object.assign({}, this.state.body);
    nb[q.key] = value || null;
    if (this.visitNo(nb, q.key) != null) nb.focus = null;
    this.settleBody(nb);
    this.setState({ body: nb });
  }

  // The date box for a visit question: what it shows, its limits, and what is
  // wrong with a date that does not fit (before the wreck, in the future).
  dateBox(b: any, q: any) {
    var raw = b[q.key], crash = this.crashNo(), today = todayNo();
    var value = raw === 'same' ? (crash != null ? isoFromNo(crash) : '') : (dayNo(raw) != null ? raw : '');
    var n = dayNo(raw), why = '';
    if (n != null && this.visitNo(b, q.key) == null && n >= dayNo('2000-01-01')) why = n > today ? 'That date is in the future.' : 'That date is before the wreck.';
    return {
      value: value, why: why,
      min: crash != null ? isoFromNo(crash) : '', max: isoFromNo(today),
      set: (e: any) => this.bodyDate(q, e && e.target ? e.target.value : e)
    };
  }

  // What a body answer reads as in the list: "Neck, Back", "Oct 3, 12 days ago".
  bodyValue(b: any, q: any) {
    var v = b[q.key];
    if (Array.isArray(v)) return v.join(', ');
    if (!q.date) return v == null ? '' : String(v);
    if (v === 'same') return 'Same day as the wreck';
    if (v === 'unsure') return 'Not sure';
    var n = this.visitNo(b, q.key);
    if (n == null) return '';
    var crash = this.crashNo(), today = todayNo();
    if (q.key === 'firstAt' && crash != null) return shortDay(n) + ', ' + (n === crash ? 'same day' : daysWord(n - crash) + ' after');
    return shortDay(n) + ', ' + (n === today ? 'today' : daysWord(today - n) + ' ago');
  }

  // An answer that no longer applies is dropped, so it can never turn a light
  // red from a question nobody is asking anymore.
  settleBody(nb: any) {
    ['stretch', 'willing'].forEach((k) => { if (nb[k] != null && !this.applies(nb, { key: k })) nb[k] = null; });
  }

  backLine() {
    var s = this.state, P = s.phase;
    if (s.free) {
      var gaps = this.storyGaps(), cq = this.currentQ();
      return gaps.length ? gaps[0] : (cq ? this.lineOf(cq) : 'Who else was in the car with you?');
    }
    if (P === 'open') return 'Tell me what happened.';
    if (P === 'story') { var g = this.storyGaps(); return g.length ? g[0] : 'Tell me what happened.'; }
    if (P === 'body') { var q = this.currentQ(); return q ? this.lineOf(q) : "Who else was in the car with you?"; }
    if (P === 'car') return 'Who else was in the car with you?';
    if (P === 'money') return "Let me tell you real quick how we work, because people always want to know.";
    if (P === 'send') return s.send.status === 'ready' ? 'Are you better by text or by email?' : "Go ahead and put me on speaker and I'll walk you through it, it's short.";
    if (P === 'file') return "What's your date of birth?";
    return 'I appreciate your time today. I hope you start feeling better.';
  }

  sendAgreement() { this.api.sendAgreement(); }

  sendPax(i: number) { this.api.sendPax(i); }

  stepsFor(status: any) {
    var order = ['sent', 'opened', 'signed'];
    var at = order.indexOf(status);
    return [['Sent', 0], ['Opened', 1], ['Signed', 2]].map((x) => ({ label: x[0], cls: 'step' + (x[1] <= at ? ' done' : (x[1] === at + 1 ? ' now' : '')) }));
  }

  callerFirst(): string {
    return String(this.state.send.client || this.props.callerName || '').trim().split(' ')[0] || 'the caller';
  }

  // ==========================================================================
  // Views. One engine, one set of answers; a view only changes what is drawn.
  // Guided walks the call step by step, Full Intake is the whole intake on one
  // page, Q&A is plain rows. Switching never touches an answer.
  // ==========================================================================
  onViewChange: (view: string) => void = () => {};

  /** Where a guided call is right now, as a Full Intake section. */
  guidedSection() {
    var s = this.state, P = s.phase;
    if (P === 'car') return 'vehicle';
    if (P === 'body') { var q = this.currentQ(); return (q && sectionOf(q.key)) || 'injury'; }
    if (P === 'story' && s.storyOpen && s.storyOpen !== 'none') return 'incident';
    return 'incident';
  }

  setView(view: any) {
    var s = this.state;
    var patch: any = { view: view, modeMenu: false, free: view === 'qa', bare: view === 'qa' };
    // Full Intake and Simple Chorelist share one position (fi.sec), so moving
    // between them, or between phone, iPad and desktop, never loses the spot.
    var onePage = (x: any) => x === 'full' || x === 'chore' || x === 'convo' || x === 'quick';
    if (onePage(view)) {
      var keep = onePage(s.view) || (!!s.fi.restoredAt && s.fi.restoredAt === s.phase);
      var sec = keep ? s.fi.sec : this.guidedSection();
      if (view === 'chore' && !onePage(s.view) && ['money', 'send', 'file', 'close'].indexOf(s.phase) >= 0) sec = 'retainer';
      patch.fi = Object.assign({}, s.fi, { sec: sec, edit: null, flash: null, target: null, jump: (s.fi.jump || 0) + 1, finishAsk: false, restoredAt: null });
      if (view === 'full' && s.fi.sec === 'retainer' && ['open', 'story', 'body', 'car'].indexOf(s.phase) >= 0) patch.phase = 'send';
      // Conversation and Quick Capture ask one question at a time: the one the
      // agent was on, else the next one still open in her section, else the next open one.
      if (view === 'convo' || view === 'quick') {
        var keepQ = (s.view === 'convo' || s.view === 'quick') ? s.fi.cq : null;
        patch.fi.cq = keepQ || s.fi.target || (sec && sec !== 'retainer' ? this.fiNext(sec) : null) || this.fiNext();
      }
    } else if (view === 'guided' && onePage(s.view) && s.fi.sec === 'retainer' && ['open', 'story', 'body', 'car'].indexOf(s.phase) >= 0) {
      patch.phase = 'send';
    } else if (view === 'guided' && onePage(s.view) && ['open', 'story', 'body', 'car'].indexOf(s.phase) >= 0) {
      // Land on the part of the intake the agent was working in.
      var sec2 = s.fi.sec || 'incident';
      var ph = sec2 === 'vehicle' ? 'car' : (sec2 === 'injury' || sec2 === 'treatment' || sec2 === 'insurance') ? 'body' : 'story';
      patch.phase = ph;
      patch.storyOpen = null;
      if (ph === 'body') {
        var first = this.fiNext(sec2);
        patch.body = Object.assign({}, s.body, { focus: first && BODYQ.some((q) => q.key === first) ? first : null });
      }
    }
    this.setState(patch);
    this.onViewChange(view);
  }

  setFi(patch: any) {
    var fi = Object.assign({}, this.state.fi, patch);
    // A section the agent has been in and left with blanks shows as left behind.
    if (patch.sec) fi.seen = Object.assign({}, this.state.fi.seen, { [patch.sec]: true });
    this.setState({ fi: fi });
  }

  // Everything Full Intake needs to know about one question: does it apply,
  // is it answered, what it reads as, and whether it is a problem.
  fiInfo(id: any) {
    var s = this.state, st = s.story, b = s.body, f = s.file, car = s.car;
    var optional = INTAKE_OPTIONAL.has(id);
    var bq = BODYQ.find((q) => q.key === id);
    if (bq) {
      var applies = this.applies(b, bq), answered = applies && this.answered(b, bq);
      var gc = this.gapCheck(b);
      var tone = '';
      if (id === 'pain' && b.pain.length === 1 && b.pain[0] === FINE) tone = 'warn';
      if (id === 'check' && b.check === 'Yes, for injuries') tone = 'bad';
      if (id === 'rep' && b.rep === 'Yes' && !this.repGood(b)) tone = 'bad';
      if (id === 'stretch' && b.stretch === 'Yes') tone = 'bad';
      if (id === 'willing' && b.willing === 'No') tone = gc.urgent && !gc.bad ? 'warn' : 'bad';
      return { id: id, label: bq.label, ask: this.lineOf(bq, b), applies: applies, answered: answered, optional: false, value: answered ? this.bodyValue(b, bq) : '', tone: tone };
    }
    var fact = this.storyFacts().find((r) => r.key === id);
    if (fact) {
      var fv = fact.value;
      if (id === 'when' && fact.done) {
        var dn = dayNo(crashIsoOf(st)), ago = todayNo() - dn;
        fv = shortDay(dn) + ', ' + (ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago');
      }
      return { id: id, label: fact.label, ask: fact.ask, applies: true, answered: fact.done, optional: false, value: fv, tone: id === 'fault' && st.fault === 'Caller' ? 'bad' : '' };
    }
    var one = (label: any, answered: any, value: any, applies?: any) => ({ id: id, label: label, ask: '', applies: applies !== false, answered: !!answered, optional: optional, value: answered ? value : '', tone: '' });
    if (id === 'report') return one('Report number', String(f.report || '').trim(), String(f.report || '').trim());
    if (id === 'providers') { var pv = (b.providers || []).filter(Boolean); return one('Where she was seen', pv.length, pv.join(', '), this.seenYes(b) || pv.length > 0); }
    if (id === 'carrier') return one("Other driver's insurance", f.carrier && f.carrier !== 'Pick one', f.carrier);
    if (id === 'people') {
      var ok = car.justMe || (car.people.length > 0 && car.people.every((p) => p.age && p.hurt));
      return one('Passengers', ok, car.justMe ? 'Just her' : car.people.length === 1 ? '1 passenger' : car.people.length + ' passengers');
    }
    if (id === 'car') { var cv = [f.vYear !== 'Year' ? f.vYear : '', f.vMake, f.vModel].filter(Boolean).join(' '); return one('Her car', cv, cv); }
    if (id === 'notes') { var nt = String(st.text || '').trim(); return one('Notes', nt, nt); }
    return one(id, false, '');
  }

  /** The next unanswered question in call order, optionally only inside one section. */
  fiNext(sec?: any) {
    for (var i = 0; i < INTAKE_SEQUENCE.length; i++) {
      var id = INTAKE_SEQUENCE[i];
      if (sec && sectionOf(id) !== sec) continue;
      var x = this.fiInfo(id);
      if (x.applies && !x.answered && !x.optional) return id;
    }
    return null;
  }

  // After an answer: the row closes (a multi-pick stays open for more taps),
  // and the "Next" highlight clears once its question is answered.
  fiAfter(id: any, keepOpen?: any) {
    var fi = this.state.fi;
    var patch: any = { edit: keepOpen ? id : (fi.edit === id ? null : fi.edit) };
    if (fi.flash && this.fiInfo(fi.flash).answered) patch.flash = null;
    this.setFi(patch);
  }

  fullIntake(pre: any) {
    var s = this.state, st = s.story, b = s.body, f = s.file, fi = s.fi;
    var today = todayNo();
    // Simple Chorelist draws every question with its answers showing, like a
    // paper form. Same questions, same answers, same controls.
    var allOpen = s.view === 'chore';
    var info: any = {};
    INTAKE_SECTIONS.forEach((sec) => sec.questions.forEach((id) => { info[id] = this.fiInfo(id); }));

    var chip = (label: any, on: any, pick: any, sub?: any) => ({ label: label, sub: sub || '', on: !!on, pick: pick });
    var storyChip = (key: any, opts: any) => opts.map((o) => chip(o, st[key] === o, () => { this.storyPick(key, o); this.fiAfter(key); }));
    var bodyChips = (q: any) => q.opts.map((o) => {
      var on = q.multi ? b[q.key].indexOf(o) >= 0 : b[q.key] === (q.date ? this.quickDate(o) : o);
      var sub = '';
      if (q.date && o === 'Today') sub = shortDay(today);
      if (q.date && o === 'Yesterday') sub = shortDay(today - 1);
      return chip(o, on, () => { this.bodyPick(q, o, true); this.fiAfter(q.key, q.multi); }, sub);
    });

    var control = (id: any) => {
      var bq = BODYQ.find((q) => q.key === id);
      if (bq && bq.date) {
        var dv = this.dateBox(b, bq);
        return { kind: 'visit', opts: bodyChips(bq), date: { value: dv.value, min: dv.min, max: dv.max, why: dv.why, set: (e: any) => { this.bodyDate(bq, e.target.value); if (this.visitNo(this.state.body, id) != null) this.fiAfter(id); } } };
      }
      if (bq) return { kind: bq.multi ? 'multi' : 'chips', opts: bodyChips(bq), done: () => this.setFi({ edit: null }) };
      if (id === 'city') return { kind: 'where', where: { value: st.city || '', set: (t: any) => this.storyCity(t), done: () => this.fiAfter('city') } };
      if (id === 'when') {
        // One tap for any day in the last week ("last Thursday"), or pick a date.
        var iso = crashIsoOf(st);
        var picked = iso ? dayNo(iso) : null;
        var opts = [
          chip('Today', st.when === 'Today', () => { this.setState({ story: Object.assign({}, this.state.story, { when: 'Today', date: '' }) }); this.setFi({ whenPick: false }); this.fiAfter('when'); }),
          chip('Yesterday', st.when === 'Yesterday', () => { this.setState({ story: Object.assign({}, this.state.story, { when: 'Yesterday', date: '' }) }); this.setFi({ whenPick: false }); this.fiAfter('when'); }),
        ];
        for (var d = 2; d <= 6; d++) {
          ((n) => {
            var dayIso = isoFromNo(today - n);
            opts.push(chip(new Date((today - n) * 86400000).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) + ' ' + new Date((today - n) * 86400000).getUTCDate(),
              st.when === 'Pick a date' && st.date === dayIso && !fi.whenPick,
              () => { this.setState({ story: Object.assign({}, this.state.story, { when: 'Pick a date', date: dayIso }) }); this.setFi({ whenPick: false }); this.fiAfter('when'); }));
          })(d);
        }
        var earlier = fi.whenPick || (st.when === 'Pick a date' && (picked == null || today - picked > 6));
        opts.push(chip('Earlier', earlier, () => { this.setState({ story: Object.assign({}, this.state.story, { when: 'Pick a date' }) }); this.setFi({ whenPick: true }); }));
        return { kind: 'crashdate', opts: opts, date: { show: earlier, value: st.date || '', max: isoFromNo(today), set: (e: any) => { this.storyDate(e.target.value); if (this.storyDateOk(e.target.value) != null) { this.setFi({ whenPick: false }); this.fiAfter('when'); } } } };
      }
      if (id === 'seat') return { kind: 'chips', opts: storyChip('seat', SEATS), other: st.seat === 'Other' ? { value: st.seatOther || '', set: (e: any) => this.set('story', 'seatOther', e.target.value), ph: 'What was she doing' } : null };
      if (id === 'fault') return { kind: 'chips', opts: storyChip('fault', ['Other driver', 'Caller', 'Not clear']), cue: st.fault === 'Caller' ? 'Do not go hunting.' : '' };
      if (id === 'police') return { kind: 'chips', opts: storyChip('police', ['Came out', 'No', 'Not sure']) };
      if (id === 'report') return { kind: 'text', field: { value: f.report || '', set: (e: any) => this.set('file', 'report', e.target.value), ph: 'If she has it' } };
      if (id === 'providers') {
        var list = (b.providers || []);
        var add = () => {
          var t = String(this.state.fi.prov || '').trim();
          if (!t) return;
          this.setState({ body: Object.assign({}, this.state.body, { providers: (this.state.body.providers || []).concat([t]) }) });
          this.setFi({ prov: '' });
        };
        return { kind: 'providers', items: list.map((name, i) => ({ label: name, remove: () => this.setState({ body: Object.assign({}, this.state.body, { providers: this.state.body.providers.filter((x, j) => j !== i) }) }) })),
          draft: { value: fi.prov || '', set: (e: any) => this.setFi({ prov: e.target.value }), ph: 'Hospital or clinic' }, add: add };
      }
      if (id === 'carrier') {
        var q = String(fi.carrierQ || '').trim().toLowerCase();
        var all = pre.carriers.filter((c) => c !== 'Pick one' && c !== 'Other');
        var hits = q ? all.filter((c) => c.toLowerCase().indexOf(q) >= 0) : all.slice(0, 6);
        var typed = String(fi.carrierQ || '').trim();
        var exact = all.some((c) => c.toLowerCase() === q);
        var pickC = (c: any) => { this.set('file', 'carrier', this.state.file.carrier === c ? 'Pick one' : c); this.setFi({ carrierQ: '' }); this.fiAfter('carrier'); };
        return { kind: 'carrier', query: { value: fi.carrierQ || '', set: (e: any) => this.setFi({ carrierQ: e.target.value }), ph: 'Type to search' },
          opts: hits.map((c) => chip(c, f.carrier === c, () => pickC(c))).concat(typed && !exact ? [chip('Use "' + typed + '"', false, () => pickC(typed))] : []) };
      }
      if (id === 'people') return { kind: 'people', justMe: chip('Just her', s.car.justMe, pre.justMe), add: pre.addPerson, people: pre.people };
      if (id === 'car') return { kind: 'car', year: { value: f.vYear, set: (e: any) => this.set('file', 'vYear', e.target.value), options: pre.years }, make: { value: f.vMake || '', set: (e: any) => this.set('file', 'vMake', e.target.value) }, model: { value: f.vModel || '', set: (e: any) => this.set('file', 'vModel', e.target.value) } };
      if (id === 'notes') return { kind: 'notes', field: { value: st.text || '', set: (e: any) => this.set('story', 'text', e.target.value), ph: 'Anything she said worth keeping' } };
      return { kind: 'none' };
    };

    // Short words for the section summaries.
    var word: any = {
      fault: { 'Other driver': 'Other driver at fault', Caller: 'She was at fault', 'Not clear': 'Fault not clear' },
      police: { 'Came out': 'Police came', No: 'No police' },
      work: { Yes: 'Missed work', No: 'No missed work', 'Not working': 'Not working' },
      exchanged: { Yes: 'Exchanged info', 'Police handled it': 'Police took info', 'Hit and run': 'Hit and run' },
    };
    var summaryOf = (sec: any) => {
      var v = (id: any) => (info[id] && info[id].answered ? info[id].value : '');
      var parts: any[] = [];
      if (sec === 'incident') parts = [v('city'), info.when.answered ? shortDay(dayNo(crashIsoOf(st))) : '', v('seat'), word.fault[st.fault] || '', word.police[st.police] || ''];
      if (sec === 'injury') parts = [b.pain.join(', '), word.work[b.work] || ''];
      if (sec === 'treatment') parts = [b.seen.join(', '), (b.providers || []).join(', '), info.lastAt.answered ? 'Last seen ' + info.lastAt.value.split(',')[0] : ''];
      if (sec === 'insurance') parts = [f.carrier && f.carrier !== 'Pick one' ? f.carrier : '', word.exchanged[b.exchanged] || '', b.coverage || '', b.rep === 'Yes' ? 'Has an attorney' : ''];
      if (sec === 'vehicle') parts = [v('people'), v('car')];
      if (sec === 'notes') parts = [String(st.text || '').trim().split('\n')[0].slice(0, 90)];
      return parts.filter(Boolean).join(', ');
    };

    var sections = INTAKE_SECTIONS.map((sec) => {
      var live = sec.questions.filter((id) => info[id].applies);
      var need = live.filter((id) => !info[id].optional);
      var done = need.filter((id) => info[id].answered).length;
      var any = live.some((id) => info[id].answered);
      var leftBehind = !!(fi.seen || {})[sec.id] && fi.sec !== sec.id;
      var status = need.length === 0 ? (any ? 'done' : 'empty')
        : done === need.length ? 'done'
        : leftBehind ? 'missing'
        : any ? 'partial' : 'empty';
      var bad = live.some((id) => info[id].tone === 'bad');
      var open = fi.sec === sec.id;
      return {
        id: sec.id, label: sec.label, open: open, status: status, bad: bad,
        count: need.length ? done + '/' + need.length : '',
        summary: summaryOf(sec.id) || (status === 'empty' ? 'Nothing yet' : ''),
        toggle: () => this.setFi(open ? { sec: null, edit: null } : { sec: sec.id, edit: null, target: null, jump: (this.state.fi.jump || 0) + 1 }),
        gap: sec.id === 'treatment' && pre.gapCard.show ? pre.gapCard : null,
        questions: live.map((id) => {
          var x = info[id];
          var editing = allOpen || fi.edit === id || !x.answered;
          return Object.assign({}, x, {
            editing: editing, flash: fi.flash === id,
            showAsk: !x.answered && !!x.ask,
            edit: () => this.setFi({ edit: fi.edit === id ? null : id, flash: null }),
            c: editing ? control(id) : { kind: 'none' },
            rep: id === 'rep' && b.rep === 'Yes'
          });
        })
      };
    });

    var seqLive = INTAKE_SEQUENCE.filter((id) => this.fiInfo(id).applies);
    var total = seqLive.length;
    var doneN = seqLive.filter((id) => this.fiInfo(id).answered).length;
    var nextId = this.fiNext();
    // Open a question's section and point at it (Next, and the missing list).
    var goTo = (id: any) => this.setFi({ sec: sectionOf(id), flash: id, edit: null, target: id, cq: id, jump: (this.state.fi.jump || 0) + 1 });
    // Everything still needed, section by section. The same rule as each
    // section's count: a question that applies, is required, and has no answer.
    var missing: any[] = [];
    sections.forEach((x) => x.questions.forEach((q: any) => {
      if (!q.answered && !q.optional) missing.push({ id: q.id, label: q.label, sec: x.id, secLabel: x.label, go: () => goTo(q.id) });
    }));

    // Conversation and Quick Capture: one question at a time, in call order.
    // Same questions and the same controls as the page above; an answer moves
    // on to the next one still open, Previous and Skip move by hand.
    var one: any = null;
    if (s.view === 'convo' || s.view === 'quick') {
      var liveSeq = () => INTAKE_SEQUENCE.filter((id) => this.fiInfo(id).applies);
      var seqA = liveSeq();
      var curId = fi.cq && seqA.indexOf(fi.cq) >= 0 ? fi.cq : nextId;
      var pos = curId ? seqA.indexOf(curId) : seqA.length;
      var openAfter = (from: any) => {
        var list = liveSeq(), k = list.indexOf(from);
        for (var j = k + 1; j < list.length; j++) if (!this.fiInfo(list[j]).answered) return list[j];
        for (var j2 = 0; j2 < k; j2++) if (!this.fiInfo(list[j2]).answered) return list[j2];
        return null;
      };
      var goQ = (id: any) => this.setFi({ cq: id, sec: id ? sectionOf(id) : this.state.fi.sec, edit: null, flash: null, note: false });
      var advance = (id: any) => { if (this.fiInfo(id).answered) goQ(openAfter(id)); };
      var q1: any = null;
      if (curId) {
        var x1 = info[curId];
        var c1: any = control(curId);
        var bq1 = BODYQ.find((q) => q.key === curId);
        var multi1 = c1.kind === 'multi';
        var wrap = (o: any) => Object.assign({}, o, { pick: () => { o.pick(); if (!multi1 && !(curId === 'rep' && this.state.body.rep === 'Yes') && !(curId === 'seat' && this.state.story.seat === 'Other')) advance(curId); } });
        if (c1.opts) c1 = Object.assign({}, c1, { opts: c1.opts.map(wrap) });
        if (c1.date) { var ds = c1.date.set; c1 = Object.assign({}, c1, { date: Object.assign({}, c1.date, { set: (e: any) => { ds(e); advance(curId); } }) }); }
        if (c1.where) { var wd = c1.where.done; c1 = Object.assign({}, c1, { where: Object.assign({}, c1.where, { done: () => { wd(); advance(curId); } }) }); }
        if (c1.kind === 'people') { var jm = c1.justMe; c1 = Object.assign({}, c1, { justMe: Object.assign({}, jm, { pick: () => { jm.pick(); if (this.state.car.justMe) advance(curId); } }) }); }
        var secL = (INTAKE_SECTIONS.find((z) => z.id === sectionOf(curId)) || { label: '' }).label;
        q1 = {
          id: curId, label: x1.label, ask: x1.ask, cue: bq1 ? bq1.cue || '' : '', sec: sectionOf(curId), secLabel: secL,
          answered: x1.answered, tone: x1.tone, c: c1, isDate: !!(bq1 && bq1.date) || curId === 'when',
          // Some answers need more than one tap: every place it hurts, a passenger, "Other", an attorney.
          needDone: multi1 || c1.kind === 'people' || (curId === 'rep' && b.rep === 'Yes') || (curId === 'seat' && st.seat === 'Other'),
          done: () => { if (this.fiInfo(curId).answered) goQ(openAfter(curId)); },
          rep: curId === 'rep' && b.rep === 'Yes',
          gap: sectionOf(curId) === 'treatment' && pre.gapCard.show ? pre.gapCard : null
        };
      }
      // What was just said: the last answer before this question, or the open.
      var before: any = null;
      for (var pb = Math.min(pos, seqA.length) - 1; pb >= 0; pb--) { var xb = info[seqA[pb]]; if (xb && xb.answered) { before = { label: xb.label, ask: xb.ask, value: xb.value }; break; } }
      one = {
        n: Math.min(pos + 1, seqA.length), total: seqA.length, q: q1, before: before,
        prev: pos > 0 ? () => goQ(seqA[pos - 1]) : null,
        skip: curId ? () => { var nx = openAfter(curId); goQ(nx && nx !== curId ? nx : (seqA[pos + 1] || null)); } : null,
        facts: [
          { id: 'where', label: 'Where', value: info.city.answered ? info.city.value : '' },
          { id: 'when', label: 'Wreck date', value: info.when.answered ? shortDay(dayNo(crashIsoOf(st))) : '' },
          { id: 'fault', label: 'Fault', value: info.fault.answered ? (({ 'Other driver': 'Other driver', Caller: 'Hers', 'Not clear': 'Not clear' } as any)[st.fault] || info.fault.value) : '' },
        ].map((f) => Object.assign(f, { go: () => goQ(f.id === 'where' ? 'city' : f.id) })),
        note: {
          open: !!fi.note,
          toggle: () => this.setFi({ note: !this.state.fi.note })
        }
      };
    }

    // Simple Chorelist: seven numbered sections, the six above plus Retainer,
    // each with a plain status. Worked out from the same answers and the same
    // position (fi.sec, fi.seen) Full Intake uses.
    var chore: any = null;
    if (allOpen) {
      var sendSt = s.send.status;
      var plainLabel: any = { vehicle: 'Vehicle / Property' };
      var rows = sections.map((x) => {
        var need = x.questions.filter((q: any) => !q.optional);
        var any = x.questions.some((q: any) => q.answered);
        return { id: x.id, label: plainLabel[x.id] || x.label, finished: need.length ? need.every((q: any) => q.answered) : any, loose: need.length === 0 };
      });
      rows.push({ id: 'retainer', label: 'Retainer', finished: sendSt === 'signed', loose: false });
      // Nothing required in it (Notes): finished once every section above it is.
      rows.forEach((r, i) => { if (r.loose && !r.finished) r.finished = rows.slice(0, i).every((y) => y.finished); });
      var waiting = sendSt === 'sending' || sendSt === 'sent' || sendSt === 'opened';
      var at = rows.findIndex((r) => r.id === fi.sec);
      // Do this now: the agreement while she is signing, else the section the
      // agent is working in, else the first one not finished.
      var nowI = waiting ? rows.length - 1 : (at >= 0 && !rows[at].finished) ? at : rows.findIndex((r) => !r.finished);
      var seenMap = fi.seen || {};
      var words: any = { done: 'DONE', now: 'DO THIS NOW', needs: 'NEEDS AN ANSWER', todo: 'NOT STARTED' };
      var fin = rows.filter((r) => r.finished).length, left = rows.length - fin;
      var many = (n: any) => n + (n === 1 ? ' section' : ' sections');
      var unfinished = rows.map((r, i) => (r.finished ? '' : (i + 1) + '. ' + r.label)).filter(Boolean);
      chore = {
        rows: rows.map((r, i) => {
          var stt = r.finished ? 'done' : i === nowI ? 'now' : seenMap[r.id] ? 'needs' : 'todo';
          var nxt = rows[i + 1];
          return {
            id: r.id, n: i + 1, label: r.label, status: stt, statusText: words[stt],
            // Working anywhere in a section makes it the one she is in.
            enter: () => { if (this.state.fi.sec !== r.id) this.setFi({ sec: r.id }); },
            go: () => this.setFi({ sec: r.id, edit: null, flash: null, target: null, finishAsk: false, jump: (this.state.fi.jump || 0) + 1 }),
            nextLabel: nxt ? (i + 2) + '. ' + nxt.label : '',
            next: nxt ? () => this.setFi({ sec: nxt.id, edit: null, flash: null, target: null, finishAsk: false, jump: (this.state.fi.jump || 0) + 1 }) : null
          };
        }),
        progress: { text: many(fin) + ' finished, ' + many(left) + ' left', pct: Math.round((fin / rows.length) * 100) },
        nextText: nowI >= 0 ? 'Next section: ' + rows[nowI].label : 'Every section is finished.',
        finish: {
          ask: !!fi.finishAsk && unfinished.length > 0,
          askText: 'Not finished yet: ' + unfinished.join(', ') + '. Press Finish intake again to end the call anyway.',
          go: () => {
            if (unfinished.length && !this.state.fi.finishAsk) return this.setFi({ finishAsk: true });
            this.setFi({ finishAsk: false });
            this.openDispo();
          }
        }
      };
    }
    var bad = pre.gates.filter((g) => g.cls.indexOf('bad') >= 0);
    var now = new Date();
    var stamp = ((now.getHours() % 12) || 12) + ':' + String(now.getMinutes()).padStart(2, '0') + (now.getHours() < 12 ? ' AM' : ' PM');
    return {
      sections: sections,
      bookmarks: sections.map((x) => ({ id: x.id, label: x.label, status: x.status, on: x.open,
        go: () => this.setFi({ sec: x.id, edit: null, target: null, cq: this.fiNext(x.id) || INTAKE_SEQUENCE.find((id) => sectionOf(id) === x.id && this.fiInfo(id).applies) || this.state.fi.cq, jump: (this.state.fi.jump || 0) + 1 }) })),
      progress: { done: doneN, total: total, pct: total ? Math.round((doneN / total) * 100) : 0, text: doneN + ' of ' + total },
      jump: fi.jump || 0, target: fi.target, openSec: fi.sec,
      next: nextId ? {
        label: 'Next: ' + this.fiInfo(nextId).label,
        ask: this.fiInfo(nextId).ask, sec: sectionOf(nextId),
        cue: (BODYQ.find((q) => q.key === nextId) || { cue: '' }).cue || '',
        go: () => goTo(nextId)
      } : null,
      missing: missing,
      chore: chore,
      one: one,
      finish: { label: 'Next: How we work', go: () => this.go('money') },
      lights: {
        text: bad.length ? bad.map((g) => g.label).join(', ') : (pre.gates.filter((g) => g.cls.indexOf('ok') >= 0).length + ' of 6'),
        bad: bad.length > 0, open: !!fi.lights,
        toggle: () => this.setFi({ lights: !this.state.fi.lights }),
        rows: pre.gates.map((g) => ({ label: { Fault: 'Not at fault', Ins: 'Some coverage', Check: 'No injury payment yet', Treat: 'Willing to treat', Gap: 'No 30-day gap', SOL: 'Inside the deadline' }[g.label] || g.label, state: g.cls.indexOf('bad') >= 0 ? 'bad' : g.cls.indexOf('ok') >= 0 ? 'ok' : g.cls.indexOf('flag') >= 0 ? 'flag' : '' }))
      },
      quick: {
        open: !!fi.quick,
        toggle: () => this.setFi({ quick: !this.state.fi.quick }),
        draft: { value: fi.draft || '', set: (e: any) => this.setFi({ draft: e.target.value }) },
        save: () => {
          var t = String(this.state.fi.draft || '').trim();
          if (!t) return this.setFi({ quick: false });
          var prev = String(this.state.story.text || '').trim();
          this.setState({ story: Object.assign({}, this.state.story, { text: (prev ? prev + '\n' : '') + stamp + ': ' + t }) });
          this.setFi({ quick: false, draft: '' });
        }
      },
      lead: pre.lead,
      viewLabel: allOpen ? 'All questions' : s.view === 'convo' ? 'Conversation' : s.view === 'quick' ? 'Quick Capture' : 'Collapsible'
    };
  }

  renderVals(): any {
    var s = this.state, P = s.phase, st = s.story, b = s.body;
    var sec = Math.max(0, Math.floor(((this.props.now || Date.now()) - this.props.startedAt) / 1000));
    var two = (n: any) => (n < 10 ? '0' : '') + n;
    var targets = { open: 15, story: 75, body: 135, money: 165, send: 180 };
    var names = { open: 'Open', story: 'Story', body: 'Body', car: 'Car', money: 'How we work', send: 'Send', file: 'File', close: 'Close' };
    var tgt = s.free ? 180 : targets[P];
    var phases = ['open', 'story', 'body', 'car', 'money', 'send', 'file', 'close'];
    var idx = phases.indexOf(P);
    var tabLabels = ['Open', 'Story', 'Body', 'Car', 'Money', 'Send', 'File', 'Close'];

    var hurtPax = s.car.people.map((p, i) => ({ p: p, i: i })).filter((x) => x.p.hurt === 'Yes');
    var agreement = this.agreementFor(st.city);
    var gates = this.gates();
    var anyBad = gates.some((g) => g.cls.indexOf('bad') >= 0);

    var q = this.currentQ();
    var days = this.daysAgo();
    var sol = this.sol();
    var fs = s.free && !s.bare;
    var live = BODYQ.filter((x) => this.applies(b, x));
    var gc = this.gapCheck(b);
    var chipOn = (x: any, o: any) => (x.multi ? b[x.key].indexOf(o) >= 0 : b[x.key] === (x.date ? this.quickDate(o) : o));
    var cueFor = (x: any) => {
      if (x.key === 'willing' && gc.bad) return 'She has a gap. Willing to go back in is what keeps this file alive.';
      if (x.key === 'willing' && gc.urgent) return 'Her 30 days run out ' + (gc.left === 0 ? 'today' : 'in ' + daysWord(gc.left)) + '. Getting her in now keeps the file clean.';
      return x.cue;
    };
    // One view of a body question: what to say, the answers, the date box.
    // Guided shows it inside the open row; Freestyle shows every one.
    var qView = (x: any, free: any) => {
      var dv = x.date ? this.dateBox(b, x) : null;
      return {
        key: x.key, line: this.lineOf(x, b), cue: cueFor(x),
        multi: !!x.multi && !(x.only && b[x.key].indexOf(x.only) >= 0),
        chipsCls: chipsCls(x.opts, x.multi),
        nextLabel: x.nextLabel || 'Next',
        next: () => {
          var nb = Object.assign({}, this.state.body);
          nb.done = Object.assign({}, nb.done, { [x.key]: true });
          nb.focus = null;
          this.setState({ body: nb });
        },
        chips: x.opts.map((o) => ({
          label: o,
          cls: 'chip' + (free ? ' sm' : '') + (o === FINE ? ' warn' : '') + (chipOn(x, o) ? ' on' : ''),
          pick: () => this.bodyPick(x, o, free)
        })),
        isDate: !!x.date,
        date: dv ? { value: dv.value, set: dv.set, min: dv.min, max: dv.max } : { value: '', set: () => {}, min: '', max: '' },
        dateWhy: dv ? dv.why : ''
      };
    };
    // Body as one list: every live question is a row with its answer on the
    // right. The question being asked is open in place; tap any row to open it.
    var qAt = q ? live.indexOf(q) : live.length;
    var bodyRows = live.map((x, i) => {
      var now = !!q && x.key === q.key, done = this.answered(b, x);
      var miss = !now && !done && (i < qAt || !!(s.visited || {}).body);
      var val = done ? this.bodyValue(b, x) : '';
      var warn = (x.key === 'pain' && b.pain.indexOf(FINE) >= 0) || (x.key === 'stretch' && b.stretch === 'Yes')
        || (x.key === 'willing' && b.willing === 'No') || (x.key === 'check' && b.check === 'Yes, for injuries');
      return {
        key: x.key, label: x.label, now: now, done: done, miss: miss,
        value: now ? '' : (val || (miss ? 'Missing' : 'Not yet')),
        cls: 'frow' + (now ? ' open' : '') + (done && !now ? ' done' : '') + (miss ? ' miss' : '') + (warn && !now ? ' warn' : ''),
        open: () => this.set('body', 'focus', x.key),
        q: now ? qView(x, false) : null
      };
    });
    // Freestyle: every live body question at once, answer in any order.
    var bodyAll = live.map((x) => Object.assign(qView(x, true), { cls: 'item' + (this.answered(b, x) ? ' done' : '') }));
    var qv = q ? Object.assign(qView(q, false), { step: 'Ask ' + (Math.max(0, live.indexOf(q)) + 1) + ' of ' + live.length })
      : { step: '', line: '', cue: '', multi: false, nextLabel: '', chipsCls: 'chips', chips: [], next: () => {}, isDate: false, date: { value: '', set: () => {}, min: '', max: '' }, dateWhy: '' };
    var gapCard = this.gapView();

    var rowToggle = (id: any) => () => this.setState({ openRow: this.state.openRow === id ? null : id });
    var rowList = (ids: any) => ids.map((id) => {
      var r = REBS.find((x) => x.id === id);
      return { title: r.title, text: this.firmText(r.text), open: s.openRow === id, hint: s.openRow === id ? 'Hide' : 'Show reply', cls: 'rb' + (s.openRow === id ? ' now' : ''), toggle: rowToggle(id) };
    });

    // Rebuttals in groups: what fits this step first, then everything else by topic.
    var rebs = [];
    var addGroup = (head: any, list: any) => {
      if (!list.length) return;
      rebs.push({ isHead: true, isItem: false, label: head, title: '', tag: '', tagCls: '', pick: () => {},
        cls: 'rb-h' + (rebs.length === 0 ? ' first' : '') + (head === 'Right now' ? ' gold' : '') });
      list.forEach((r, i) => rebs.push({
        isHead: false, isItem: true, label: '', title: r.title,
        tag: r.phase === 'locked' ? 'Needs TMP OK' : '',
        tagCls: r.phase === 'locked' ? 'rb-lock' : 'rb-tag',
        cls: 'rb ' + (list.length === 1 ? 'solo' : i === 0 ? 'top' : i === list.length - 1 ? 'bot' : 'mid'),
        pick: () => this.setState({ reb: r.id })
      }));
    };
    // Right now is a shortcut, the top four for this step. Groups always hold everything.
    addGroup('Right now', REBS.filter((r) => r.phase === P).slice(0, 4));
    REB_GROUPS.forEach((g) => addGroup(g, REBS.filter((r) => r.group === g)));

    // Lines tab. The section she tapped into comes first. {NAME} is the caller's first name.
    var first = this.callerFirst();
    var lines = (s.lineFocus === 'ramble' ? [1, 0, 2] : [0, 1, 2]).map((k, j) => {
      var sct = LINES[k];
      return {
        head: sct.head, note: sct.note, hcls: 'rb-h' + (j === 0 ? ' first' : ''),
        items: sct.items.map((it, i) => ({
          k: it[0], t: it[1].replace(/\{NAME\}/g, first),
          showK: i === 0 || sct.items[i - 1][0] !== it[0],
          cls: 'ln' + (i === sct.items.length - 1 ? ' end' : '')
        }))
      };
    });

    // Dispo screen.
    var d = s.dispo, dd = this.dispos.find((x: any) => x.code === d.pick) || null;
    var needWhy = !!(dd && dd.why);
    var atText = (() => {
      var t = d.at ? new Date(d.at) : null;
      if (!t || isNaN(t.getTime())) return '';
      var h = t.getHours(), m = t.getMinutes();
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getDay()] + ' ' + (t.getMonth() + 1) + '/' + t.getDate() + ' at ' + ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
    })();
    var whenText = d.when === 'Pick a time' ? atText : d.when;
    var saveLabel = !dd ? 'Pick how it ended' : (needWhy && !d.why.length) ? 'Pick a reason' : (dd.needWhen && !whenText) ? 'Pick a time' : 'Save dispo';
    var emailed = d.notify.filter((n) => n.on).map((n) => n.who);
    var dispoSummary = dd ? [{ k: 'Dispo', v: dd.label }] : [];
    if (d.why.length) dispoSummary.push({ k: 'Why', v: d.why.map((k: string) => ((dd && dd.why ? dd.why : []).find((r: any) => r.key === k) || { label: k }).label).join(', ') });
    if (dd && dd.when && whenText) dispoSummary.push({ k: dd.whenHead, v: whenText });
    if (d.pick === 'signed') dispoSummary.push({ k: 'Emailed', v: emailed.length ? emailed.join(', ') : 'Nobody' });
    if (String(d.note || '').trim()) dispoSummary.push({ k: 'Note', v: d.note });
    var savedNote = d.pick === 'signed' ? (emailed.length ? 'Case emailed to ' + emailed.join(', ') + '.' : 'Saved to the file.')
      : d.pick === 'dnc' ? 'Her number is off every list.'
      : (dd && dd.when && whenText) ? 'On the call back list for ' + (d.when === 'Pick a time' ? whenText : whenText.toLowerCase()) + '.'
      : 'Logged for reports.';
    var picked = REBS.find((r) => r.id === s.reb) || { title: '', text: '', note: '' };

    var repBlock = b.rep === 'Yes' && !this.repGood(b);
    var herDigits = String(this.props.callerPhone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    var herOk = herDigits.length === 10;
    var sendDigits = String(s.send.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    var toOther = !herOk || (s.send.toOther != null ? !!s.send.toOther : sendDigits !== herDigits);
    var contactMissing = s.send.via === 'Email' ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.send.email || '').trim()) : String(s.send.phone || '').replace(/\D/g, '').length < 10;
    var noDoi = !crashIsoOf(st);
    var sendBlocked = repBlock || !agreement || noDoi || !String(s.send.client || '').trim() || !this.props.esign.configured || contactMissing || s.send.status === 'sending';
    // Everything still missing, said once, so nobody has to guess why Send is grey.
    var needs: string[] = [];
    if (!agreement) needs.push('the state where the wreck happened');
    if (noDoi) needs.push('the date of the wreck');
    if (!String(s.send.client || '').trim()) needs.push('her full name');
    if (contactMissing) needs.push(s.send.via === 'Email' ? 'her email' : 'her 10-digit cell number');
    var needText = needs.length === 1 ? needs[0] : needs.slice(0, -1).join(', ') + ' and ' + needs[needs.length - 1];
    var sendWarnText = repBlock ? 'She has an attorney. Only a good case she is unhappy about gets sent.'
      : !this.props.esign.configured ? 'E-sign is not set up for this campaign yet. An admin sets it up once.'
      : needs.length ? 'To send it, add ' + needText + '.'
      : anyBad ? 'A gate is red. Send only if you are sure, it gets flagged for review.' : '';

    var fileSteps = [['agreement', 'Agreement'], ['info', 'Her info'], ['crash', 'Crash']];
    if (hurtPax.length) fileSteps.push(['pax', 'Passengers']);
    var fIdx = fileSteps.findIndex((x) => x[0] === s.file.step);

    var years = ['Year'];
    for (var y = 2027; y >= 1990; y--) years.push(String(y));

    // Send is never a dead grey button. Tapping it while something is missing
    // says what, right above the button, and it clears the moment it is fixed.
    var sendNext = {
      label: 'Send agreement', disabled: s.send.status === 'sending', muted: sendBlocked,
      go: sendBlocked ? () => this.setState({ sendNudge: Date.now() }) : () => this.sendAgreement()
    };
    var next: any;
    if (s.free) {
      // Freestyle: the one button is always the thing that matters most, the agreement.
      if (s.send.status === 'ready') next = sendNext;
      else if (s.send.status !== 'signed') next = { label: 'Waiting for her signature', disabled: true, go: () => {} };
      else next = { label: s.saved ? 'Saved. Call ended.' : 'End call and save', disabled: s.saved, go: () => this.openDispo() };
    } else if (P === 'send') {
      if (s.send.status === 'ready') next = sendNext;
      else if (s.send.status !== 'signed') next = { label: 'Waiting for her signature', disabled: true, go: () => {} };
      else next = { label: 'Collect the file', disabled: false, go: () => this.go('file') };
    } else if (P === 'file') {
      if (fIdx < fileSteps.length - 1) next = { label: 'Next: ' + fileSteps[fIdx + 1][1], disabled: false, go: () => this.set('file', 'step', fileSteps[fIdx + 1][0]) };
      else next = { label: 'Next: Close', disabled: false, go: () => this.go('close') };
    } else if (P === 'close') {
      next = { label: s.saved ? 'Saved. Call ended.' : 'End call and save', disabled: s.saved, go: () => this.openDispo() };
    } else {
      var np = phases[idx + 1];
      next = { label: P === 'open' ? "She's talking: Story" : 'Next: ' + names[np], disabled: false, go: () => this.go(np) };
    }

    var f = {};
    ['date', 'city', 'text', 'seatOther'].forEach((k) => { f[k] = this.field('story', k); });
    ['client', 'injured', 'email', 'phone'].forEach((k) => { f[k] = this.field('send', k); });
    ['dob', 'ssn', 'addr', 'dl', 'ecName', 'ecPhone', 'carrier', 'report', 'vYear', 'vMake', 'vModel'].forEach((k) => { f[k] = this.field('file', k); });

    var out: any = {
      callerName: this.props.callerName || 'New caller',
      callerFirst: this.callerFirst(),
      callerPhone: this.props.callerPhone ? fmtPhone(this.props.callerPhone) : '',
      callerEmail: this.props.callerEmail || '',
      campaignName: this.props.campaign || '',
      leadNo: this.props.leadNo || '',
      agentFirst: String(this.props.agentName || '').trim().split(' ')[0] || 'your intake specialist',
      firmSpoken: this.props.firmSpoken,
      textFrom: this.props.textFrom || 'your JustCall number',
      // The intake pace clock: time since this intake opened, against the
      // targets above. It is not a phone call timer. Past an hour it means
      // the file was reopened later, so it is not shown.
      clockText: sec >= 3600 ? '' : two(Math.floor(sec / 60)) + ':' + two(sec % 60),
      clockOver: !!(tgt && sec > tgt && sec < 3600),
      clockCls: 'clock' + (tgt && sec > tgt ? ' over' : ''),
      targetText: s.free ? 'Agreement by 3:00' : (tgt ? names[P] + ' by ' + Math.floor(tgt / 60) + ':' + two(tgt % 60) : (P === 'close' ? 'Wrap under 3 min' : names[P])),
      gates: s.bare ? gates.map((g) => Object.assign({}, g, { href: { Fault: '#q-crash', SOL: '#q-crash', Ins: '#q-cover', Check: '#q-cover' }[g.label] || '#q-injury' })) : gates,
      tabs: this.tabStates(phases, P).map((t, i) => ({ label: tabLabels[i], cls: 'tab' + (t.key === P ? ' on' : '') + (t.full ? ' full' : (t.miss ? ' miss' : '')), go: () => this.go(t.key) })),
      jumps: s.bare
        ? this.tabStates(['story', 'injury', 'cover', 'car', 'send', 'file'], null).map((t, i) => ({ label: ['Crash', 'Injury', 'Cover', 'Car', 'Send', 'After'][i], href: '#q-' + ['crash', 'injury', 'cover', 'car', 'send', 'after'][i], cls: 'tab' + (t.full ? ' full' : (t.miss ? ' miss' : '')) }))
        : this.tabStates(phases, null).map((t, i) => ({ label: tabLabels[i], href: '#fs-' + t.key, cls: 'tab' + (t.full ? ' full' : (t.miss ? ' miss' : '')) })),
      labCls: (() => {
        var sec = this.sections(), t = this.tabStates(phases, s.free ? null : P).find((x) => x.key === 'story');
        // Coming back to Story after leaving blanks lights them up too.
        var flag = t.miss || (!s.free && P === 'story' && !!(s.visited || {}).story && sec.story.missing.length > 0), out = {};
        ['fault', 'seat', 'police', 'when', 'city'].forEach((k) => { out[k] = 'lab' + (flag && sec.story.missing.indexOf(k) >= 0 ? ' miss' : ''); });
        return out;
      })(),
      guided: !s.free, free: s.free,
      bare: s.bare,
      view: s.view,
      // Three views while the agents try them (Brett, Sep 27): Guided, one step
      // at a time; Collapsible, every section on one page, one open at a time;
      // All questions, the whole intake open as one numbered form.
      modeLabel: ({ qa: 'Q&A', full: 'Collapsible', chore: 'All questions', convo: 'Conversation', quick: 'Quick Capture' } as any)[s.view] || 'Guided',
      modeMenuOpen: !!s.modeMenu,
      toggleModeMenu: () => this.setState({ modeMenu: !this.state.modeMenu }),
      modes: [['Guided', 'guided'], ['Collapsible', 'full'], ['All questions', 'chore']].map((m) => ({
        key: m[1],
        label: m[0],
        on: s.view === m[1],
        cls: 'menu-b' + (s.view === m[1] ? ' on' : ''),
        go: () => this.setView(m[1])
      })),
      bareRows: s.bare ? this.bareRows() : [],
      isOpen: P === 'open', isStory: P === 'story', isBody: P === 'body', isCar: P === 'car', isMoney: P === 'money', isSend: P === 'send', isFile: P === 'file', isClose: P === 'close',
      showOpen: fs || (!s.free && P === 'open'), showStory: fs || (!s.free && P === 'story'), showCar: fs || (!s.free && P === 'car'), showMoney: fs || (!s.free && P === 'money'),
      showSend: fs || (!s.free && P === 'send'), showFile: fs || (!s.free && P === 'file'), showClose: fs || (!s.free && P === 'close'),
      showBodyGuided: !s.free && P === 'body', showBodyFree: fs,
      bodyRows: bodyRows, bodyAll: bodyAll, gapCard: gapCard,
      storyRows: this.storyRows(),
      storyWhere: { value: st.city || '', set: (t: string) => this.storyCity(t), done: () => this.storyWhereDone() },
      storyWhen: {
        chips: ['Today', 'Yesterday', 'Pick a date'].map((o) => ({ label: o, cls: 'chip' + (st.when === o ? ' on' : ''), pick: () => this.storyPick('when', o) })),
        pickDate: st.when === 'Pick a date',
        date: { value: st.date || '', set: (e: any) => this.storyDate(e.target.value), max: isoFromNo(todayNo()) }
      },
      storySeat: SEATS.map((o) => ({ label: o, cls: 'chip sm' + (st.seat === o ? ' on' : ''), pick: () => this.storyPick('seat', o) })),
      storyFault: ['Other driver', 'Caller', 'Not clear'].map((o) => ({ label: o, cls: 'chip' + (o === 'Caller' ? ' warn' : '') + (st.fault === o ? ' on' : ''), pick: () => this.storyPick('fault', o) })),
      storyPolice: ['Came out', 'No', 'Not sure'].map((o) => ({ label: o, cls: 'chip sm' + (st.police === o ? ' on' : ''), pick: () => this.storyPick('police', o) })),
      leadOpen: !!s.leadOpen,
      toggleLead: () => this.setState({ leadOpen: !this.state.leadOpen }),
      sayingFineFree: b.pain.indexOf(FINE) >= 0 && b.pain.length === 1,
      f: f,
      // TMP's split, straight from each agreement's paragraph 3. Only said when she insists.
      showFees: !!this.props.showFees,
      hasLead: !!(this.props.lead && (this.props.lead.said || this.props.lead.tags.length || this.props.lead.from)),
      leadFrom: this.props.lead?.from || '',
      leadSaid: this.props.lead?.said || '',
      leadTags: (this.props.lead?.tags || []).map((t) => ({ label: t })),
      fees: agreement === 'Florida'
        ? [{ k: 'Before they answer a lawsuit', v: '33 1/3%' }, { k: 'After they answer', v: '40%' }]
        : [{ k: 'First 90 days', v: '33 1/3%' }, { k: 'After 90 days, or suit or mediation', v: '40%' }, { k: 'From 90 days before trial', v: '45%' }],
      feeNote: agreement === 'Florida' ? 'Florida agreement. Lower on anything over $1 million.' : (agreement ? agreement + ' agreement.' : 'Texas and all other states. Florida is different, add the state on Story.'),
      openers: rowList(['report', 'info', 'atwork']),
      fault: this.chips('story', 'fault', ['Other driver', 'Caller', 'Not clear'], 'Caller'),
      faultCaller: st.fault === 'Caller',
      seat: this.chips('story', 'seat', SEATS, null, true),
      seatOther: st.seat === 'Other',
      police: this.chips('story', 'police', ['Came out', 'No', 'Not sure'], null, true),
      when: this.chips('story', 'when', ['Today', 'Yesterday', 'Pick a date']),
      pickDate: st.when === 'Pick a date',
      hasDays: days != null && st.when === 'Pick a date',
      daysCls: 'cue',
      daysText: days == null ? '' : (days === 1 ? '1 day ago' : days + ' days ago'),
      hasGap: this.storyGaps().length > 0,
      noGap: this.storyGaps().length === 0,
      gapNext: this.storyGaps()[0] || '',
      storyFacts: this.storyFacts(),
      gapMore: this.storyGaps().length > 1 ? (this.storyGaps().length - 1) + ' more after this' : '',
      hasQ: !!q, q: qv,
      repYes: b.rep === 'Yes',
      rep: {
        cls: this.repGood(b) ? 'reb' : 'stop',
        head: this.repGood(b) ? 'Unhappy with her attorney, good case. We help.' : 'She has an attorney',
        plain: !(b.repUnhappy && b.repKind === 'Good case'),
        isUnhappy: !!b.repUnhappy,
        fender: !!(b.repUnhappy && b.repKind === 'Fender bender, low limits'),
        good: this.repGood(b),
        unhappy: this.chips('body', 'repUnhappy', ["She says she's unhappy with them"], null, true),
        kind: this.chips('body', 'repKind', ['Good case', 'Fender bender, low limits'], 'Fender bender, low limits', true)
      },
      sayingFine: b.pain.indexOf(FINE) >= 0 && !b.done.pain,
      soreness: this.firmText(REBS.find((r: any) => r.id === 'soreness').text),
      bodyComplete: !q && (b.rep !== 'Yes' || this.repGood(b)),
      justMeCls: 'chip' + (s.car.justMe ? ' on' : ''),
      justMe: () => this.setState({ car: { justMe: !this.state.car.justMe, people: [] } }),
      addPerson: () => this.setState({ car: { justMe: false, people: this.state.car.people.concat([{ name: '', rel: null, age: null, hurt: null }]) } }),
      people: s.car.people.map((p, i) => ({
        title: p.name ? p.name : 'Passenger ' + (i + 1),
        name: p.name,
        setName: (e: any) => this.setPerson(i, 'name', e.target.value),
        remove: () => this.setState({ car: Object.assign({}, this.state.car, { people: this.state.car.people.filter((x, j) => j !== i) }) }),
        rels: ['Child', 'Spouse or partner', 'Friend', 'Family', 'Other'].map((r) => ({ label: r, cls: 'chip sm' + (p.rel === r ? ' on' : ''), pick: () => this.setPerson(i, 'rel', p.rel === r ? null : r) })),
        ages: ['Under 18', 'Adult'].map((r) => ({ label: r, cls: 'chip sm' + (p.age === r ? ' on' : ''), pick: () => this.setPerson(i, 'age', p.age === r ? null : r) })),
        hurts: ['Yes', 'No'].map((r) => ({ label: r, cls: 'chip sm' + (p.hurt === r ? ' on' : ''), pick: () => this.setPerson(i, 'hurt', p.hurt === r ? null : r) })),
        ownFile: p.hurt === 'Yes'
      })),
      sendReady: s.send.status === 'ready',
      sendLive: s.send.status !== 'ready',
      notSigned: s.send.status !== 'signed',
      signed: s.send.status === 'signed',
      sendSteps: this.stepsFor(s.send.status),
      agreement: agreement ? agreement : 'Needs the state',
      needState: !agreement,
      needDoi: noDoi,
      injuredWho: this.chips('send', 'who', ['Same as signer', 'Someone else']),
      injuredOther: s.send.who === 'Someone else',
      via: this.chips('send', 'via', ['Text', 'Email']),
      viaNote: !this.props.esign.configured ? 'E-sign is not set up for this campaign yet. An admin sets it up once.' : (s.send.via === 'Text' ? (sendDigits.length === 10 ? 'Texts the signing link to ' + fmtPhone(sendDigits) + ' from ' + this.props.textFrom + '.' : 'Texts the signing link from ' + this.props.textFrom + '.') : 'Emails her the signing link.'),
      // Text it to her cell on file by default, or to another number (a spouse
      // signing while she is on the line).
      textTo: herOk ? [
        { label: 'Her cell ' + fmtPhone(herDigits), cls: 'chip' + (!toOther ? ' on' : ''), pick: () => this.setState({ send: Object.assign({}, this.state.send, { toOther: false, phone: herDigits }) }) },
        { label: 'Another number', cls: 'chip' + (toOther ? ' on' : ''), pick: () => this.setState({ send: Object.assign({}, this.state.send, { toOther: true, phone: '' }) }) },
      ] : [],
      textToOther: !herOk || toOther,
      herPhoneOk: herOk,
      viaEmail: s.send.via === 'Email', viaText: s.send.via === 'Text',
      hasSendError: !!s.send.error, sendError: s.send.error || '',
      hasFileError: !!s.file.error, fileError: s.file.error || '',
      saveBad: !!(s.net && s.net.saveError), saveError: (s.net && s.net.saveError) || '',
      hasTextError: !!(s.text && s.text.error), textError: (s.text && s.text.error) || '',
      canHear: !!this.props.canHear,
      callsList: (s.calls || []).map((c) => ({ when: fmtWhen(c.occurred_at), what: (c.direction === 'inbound' ? 'Inbound' : 'Outbound') + (c.channel === 'voicemail' ? ' voicemail' : ' call') + (c.duration_sec ? ', ' + Math.floor(c.duration_sec / 60) + ':' + String(c.duration_sec % 60).padStart(2, '0') : ''), agent: c.agent_name || '', rec: c.recording_url || '', hasRec: !!(this.props.canHear && c.recording_url), summary: c.jc_summary || '', hasSummary: !!c.jc_summary })),
      hasCalls: (s.calls || []).length > 0,
      sendWarn: !!sendWarnText, sendWarnText: sendWarnText,
      nudge: s.sendNudge && sendBlocked && sendWarnText && s.send.status === 'ready' ? sendWarnText : '',
      fileTabs: fileSteps.map((x) => ({ label: x[1], cls: 'chip sm' + (x[0] === s.file.step ? ' on' : ''), pick: () => this.set('file', 'step', x[0]) })),
      fsAgreement: fs || s.file.step === 'agreement', fsInfo: fs || s.file.step === 'info', fsCrash: fs || s.file.step === 'crash', fsPax: (fs && hurtPax.length > 0) || s.file.step === 'pax',
      agreementOpen: s.file.agreement === 'open',
      agreementClosed: s.file.agreement !== 'open',
      // Parked is a pause, not a wall: the agent (or QA in the morning) can
      // reopen it and finish (Astra audit, Sep 27: parked hid Complete with
      // no way back).
      agreementParked: s.file.agreement === 'qa',
      reopenAgreement: () => this.set('file', 'agreement', 'open'),
      agreementNote: s.file.agreement === 'done' ? 'Agreement complete. Goes to QA, then to the firm.' : 'Parked. QA finishes it in the morning.',
      completeAgreement: () => { if (this.state.send.status === 'signed') this.api.completeAgreement(); },
      agreementLocked: s.send.status !== 'signed',
      completeLabel: s.send.status === 'signed' ? 'Complete the agreement' : 'Unlocks after she signs',
      leaveForQa: () => this.set('file', 'agreement', 'qa'),
      ecRel: this.chips('file', 'ecRel', ['Spouse or partner', 'Parent', 'Child', 'Sibling', 'Friend', 'Other'], null, true),
      carriers: ['Pick one', 'Not sure yet', 'State Farm', 'GEICO', 'Progressive', 'Allstate', 'USAA', 'Farmers', 'Liberty Mutual', 'Nationwide', 'Travelers', 'American Family', 'Other'],
      years: years,
      missedWork: b.work || 'Not asked',
      paxSend: hurtPax.map((x) => {
        var status = s.file.pax[x.i];
        var minor = x.p.age === 'Under 18';
        var nm = x.p.name || 'Passenger ' + (x.i + 1);
        return {
          title: nm + (minor ? ', under 18' : ''),
          note: minor ? this.callerFirst() + ' signs as parent or guardian. ' + nm + ' goes on the HIPAA pages.' : nm + ' signs their own agreement.',
          button: 'Send ' + nm + "'s agreement",
          ready: !status, live: !!status,
          send: () => this.sendPax(x.i),
          steps: this.stepsFor(status)
        };
      }),
      summary: [
        { k: this.callerFirst(), v: s.send.status === 'signed' ? 'Signed' : 'Not signed' },
        { k: 'Agreement', v: agreement || 'No state yet' },
        { k: 'Passenger files', v: String(hurtPax.length) },
        { k: 'Attorney', v: this.repGood(b) ? 'Switching, she was unhappy' : (b.rep === 'Yes' ? 'Has one' : 'None') },
        { k: 'DOB and SSN', v: s.file.agreement === 'done' ? 'Done' : s.file.agreement === 'qa' ? 'QA in the morning' : 'Still open' }
      ],
      next: next,
      solHas: sol.daysLeft != null && sol.daysLeft <= 90, solText: sol.text,
      solCls: 'cue' + (sol.daysLeft != null && sol.daysLeft <= 90 ? ' red' : ''),
      solClose: sol.daysLeft != null && sol.daysLeft >= 0 && sol.daysLeft <= 90,
      // Help on a phone: Now (what to say, reminders, what's missing) first.
      helpTabs: [['now', 'Now'], ['reb', 'Rebuttals'], ['lines', 'Lines'], ['ask', 'Ask']].map((x) => ({ label: x[1], cls: 'htab' + (s.helpTab === x[0] ? ' on' : ''), go: () => this.setState({ helpTab: x[0], reb: null }) })),
      isNowTab: s.helpTab === 'now', isRebTab: s.helpTab === 'reb', isAsk: s.helpTab === 'ask', isLines: s.helpTab === 'lines',
      lines: lines,
      openCommon: () => this.setState({ sheet: true, reb: null, helpTab: 'lines', lineFocus: 'common' }),
      openRamble: () => this.setState({ sheet: true, reb: null, helpTab: 'lines', lineFocus: 'ramble' }),
      openDispo: () => this.openDispo(),
      openText: () => this.setState({ text: Object.assign({}, this.state.text, { open: true }), textUnread: 0, sheet: false, modeMenu: false }),
      textUnread: s.textUnread || 0, textBadge: (s.textUnread || 0) > 0 && !s.text.open,
      closeText: () => this.set('text', 'open', false),
      textOpen: !!s.text.open,
      textEmpty: s.text.thread.length === 0,
      texts: s.text.thread.map((m) => ({ body: m.body, status: m.status || '', hasStatus: !!m.status, cls: 'bub ' + m.from })),
      textDraft: this.field('text', 'draft'),
      textCantSend: !String(s.text.draft || '').trim(),
      sendText: () => this.sendText(String(this.state.text.draft || '').trim()),
      canResend: s.send.status === 'sent' || s.send.status === 'opened',
      resendLink: () => this.api.resendLink(),
      dispoOpen: !!d.open,
      dispo: {
        back: () => this.set('dispo', 'open', false),
        editing: !d.saved, saved: !!d.saved,
        opts: (() => {
          var shown = (d.list || !dd) ? this.dispos : [dd];
          return shown.map((x, i) => ({
            label: x.label, on: d.pick === x.code,
            showCheck: d.pick === x.code && shown.length > 1, showChange: shown.length === 1,
            cls: 'drow' + (d.pick === x.code ? ' on' : '') + (x.code === 'dnc' ? ' dnc' : '') + (i === shown.length - 1 ? ' end' : ''),
            pick: () => this.dispoPick(x.code)
          }));
        })(),
        hasPick: !!dd,
        hasWhy: needWhy, whyHead: dd && dd.whyHead ? dd.whyHead : '',
        fromCall: d.pick === 'dq' && d.auto && d.why.length > 0,
        why: needWhy ? dd.why.map((w: any, i: number) => ({ label: w.label, on: d.why.indexOf(w.key) >= 0, cls: 'drow' + (d.why.indexOf(w.key) >= 0 ? ' on' : '') + (i === dd.why.length - 1 ? ' end' : ''), pick: () => this.toggle('dispo', 'why', w.key) })) : [],
        hasWhen: !!(dd && dd.when), whenHead: dd && dd.whenHead ? dd.whenHead : '',
        when: WHEN.map((w, i) => ({ label: w, on: d.when === w, cls: 'drow' + (d.when === w ? ' on' : '') + (i === WHEN.length - 1 ? ' end' : ''), pick: () => this.pick('dispo', 'when', w) })),
        pickTime: d.when === 'Pick a time',
        at: this.field('dispo', 'at'),
        isSigned: d.pick === 'signed', isDnc: d.pick === 'dnc',
        notify: d.notify.map((n, i) => ({
          who: n.who, how: n.how, on: n.on,
          cls: 'drow' + (n.on ? ' on' : '') + (i === d.notify.length - 1 ? ' end' : ''),
          toggle: () => this.set('dispo', 'notify', this.state.dispo.notify.map((x, j) => (j === i ? Object.assign({}, x, { on: !x.on }) : x)))
        })),
        add: this.field('dispo', 'add'),
        addGo: () => {
          var dd2 = this.state.dispo, em = String(dd2.add || '').trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return;
          this.setState({ dispo: Object.assign({}, dd2, { add: '', notify: dd2.notify.concat([{ who: em, how: 'Added on this call', on: true }]) }) });
        },
        note: this.field('dispo', 'note'),
        cantSave: saveLabel !== 'Save dispo' || !!d.saving, saveLabel: d.saving ? 'Saving' : saveLabel,
        save: () => this.api.saveDispo(),
        saving: !!d.saving, error: d.error || '', hasError: !!d.error,
        edit: () => this.set('dispo', 'saved', false),
        nextCall: () => this.api.home(),
        summary: dispoSummary, savedNote: d.serverNote || savedNote
      },
      askField: { value: s.askText, set: (e: any) => this.setState({ askText: e.target.value, askOut: null }) },
      doAsk: () => this.api.ask(String(this.state.askText || '')),
      asked: !!s.askOut,
      askBusy: s.askOut === 'busy',
      askAnswer: s.askOut && typeof s.askOut === 'object' && s.askOut.answer ? s.askOut.answer : '',
      askError: s.askOut && typeof s.askOut === 'object' && s.askOut.error ? s.askOut.error : '',
      openSheet: () => this.setState({ sheet: true, reb: null, helpTab: 'now' }),
      openRebuttals: () => this.setState({ sheet: true, reb: null, helpTab: 'reb' }),
      closeSheet: () => this.setState({ sheet: false, reb: null }),
      clearPick: () => this.setState({ reb: null }),
      sheetOpen: s.sheet,
      sheetTitle: s.reb ? 'Say this' : 'Rebuttals',
      rebPicked: !!s.reb, rebList: !s.reb,
      rebs: rebs,
      picked: { title: picked.title, text: this.firmText(picked.text), note: picked.note || '', hasNote: !!picked.note },
      backLine: this.backLine()
    };
    // Full Intake reads the same answers through the same pieces as the other views.
    out.fullView = s.view === 'full' && ['open', 'story', 'body', 'car'].indexOf(P) >= 0;
    // Conversation and Quick Capture: one question at a time, over the same intake.
    out.oneQ = (s.view === 'convo' || s.view === 'quick') && ['open', 'story', 'body', 'car'].indexOf(P) >= 0;
    out.oneKind = s.view;
    if (out.fullView || out.oneQ) { out.showOpen = false; out.showStory = false; out.showBodyGuided = false; out.showCar = false; }
    // Simple Chorelist is the whole call on one numbered form, at every step.
    out.choreView = s.view === 'chore';
    // The one Send button, for any view that draws its own.
    out.sendNext = sendNext;
    // Every view reads it: the side panels (caller, helper) are the same in all of them.
    out.fi = this.fullIntake({
      people: out.people, justMe: out.justMe, addPerson: out.addPerson, years: out.years, carriers: out.carriers,
      gates: gates, gapCard: gapCard,
      lead: out.hasLead ? { tags: out.leadTags.map((t) => t.label).join(', ') || out.leadFrom, said: out.leadSaid, from: out.leadFrom, open: out.leadOpen, toggle: out.toggleLead } : null
    });
    return out;
  }
}
