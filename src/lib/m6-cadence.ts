// Motel 6 last-touch cadence. ONE definition of the run sheet:
// https://tmpm6.netlify.app/ — stages, scripts, ALWAYS rules, gates, walker.
// Seeded into drip_rules / escalation_ladder. Do not invent a second script list.

export const M6_SENDING_NUMBER = "+12562075828";
export const M6_CADENCE_CAMPAIGN = "motel6";

export const M6_QUIET_START = "08:00";
export const M6_QUIET_END = "20:00";

export const HEARTBEAT_INITIAL_DAYS = 14;
export const HEARTBEAT_STEADY_DAYS = 30;
export const HEARTBEAT_SWITCH_DAYS = 90;

export type CadenceChannel = "sms" | "email" | "call" | "voicemail" | "letter" | "social" | "trace" | "memo";
export type CadenceStage = "01" | "02" | "03" | "04" | "05" | "06";
export type CadenceKind = "sms" | "email" | "call" | "voicemail" | "letter" | "memo" | "social" | "trace";

export type CadenceTemplate = {
  key: string;
  stage: CadenceStage;
  name: string;
  kind: CadenceKind;
  channel: CadenceChannel;
  delayDays: number;
  subject: string | null;
  body: string;
  method: string;
  approvedByFirm: boolean;
  fireOnce: boolean;
};

export const ALWAYS_RULES = [
  "Same sender number, always, so it stays saved in their phone.",
  "Same named human every single time. This matters more than any script.",
  "Sixth grade reading level. No legal vocabulary.",
  "Ask “still your best number” on every contact.",
  "Never overwrite a contact point. Append it. A dead number is evidence later.",
  "No case subject in any message if communications are monitored.",
  "Check in even when there is nothing to report. Silence is what loses them, not slow news.",
  "Never say the case is filed, name a court, or promise a date.",
  "Legal questions route to the firm same day. Never guessed at.",
] as const;

// Crissi SOP excerpt for this campaign only. Not Maverick. Not the full hub.
export const M6_CRISSI_GUIDANCE = {
  title: "Crissi — Motel 6 guidance",
  role: [
    "Support — stay calm, listen, be warm and non-judgmental.",
    "Connect — 988 for crisis, 911 for immediate danger.",
    "Escalate — tell a supervisor and write down what happened.",
  ],
  say: [
    "I’m really glad you told me. I’m here, and I’m listening.",
    "That sounds incredibly hard. You don’t have to go through this alone.",
    "There are people available right now trained for exactly this. You can call or text 988 and I’ll stay with you.",
  ],
  avoid: [
    "Don’t say “calm down” or “it’s not that bad.”",
    "Don’t argue, lecture, or try to counsel.",
    "Don’t promise confidentiality or a case outcome.",
    "Don’t make the call about the case, signup, or money.",
    "Don’t hang up or rush them off the line.",
  ],
  resources: [
    { name: "Immediate danger", value: "911" },
    { name: "988 Suicide & Crisis Lifeline", value: "Call or text 988" },
    { name: "National Human Trafficking Hotline", value: "1-888-373-7888 · text 233733" },
    { name: "National Domestic Violence Hotline", value: "800-799-7233" },
  ],
} as const;

export const M6_CRISSI_CHIPS = [
  "They're spiraling. What do I say?",
  "Are they in a safe place to speak?",
  "They asked what the case is worth.",
  "No answer. What's the next move?",
  "Comms may be monitored. Can I leave a voicemail?",
] as const;

const AGENT = "[Agent]";
const FIRST = "[First]";
const NUMBER = "[number]";

export const M6_TEMPLATES: CadenceTemplate[] = [
  {
    key: "s01_arrival_sms",
    stage: "01",
    name: "Day 0 arrival SMS",
    kind: "sms",
    channel: "sms",
    delayDays: 0,
    subject: null,
    body: `Hi ${FIRST}, this is ${AGENT} with the team working on your case with Turnbull Moak and Pendergrass. We will be calling you in the next few business days to confirm a few important details.\n\nIf we catch you at a bad time, text this number back with a better day and time. We do need to reach you soon so nothing on your case gets held up.`,
    method: "This is the number every future touch comes from. A reply with a callback time counts as contact.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s01_arrival_email",
    stage: "01",
    name: "Day 0 arrival email",
    kind: "email",
    channel: "email",
    delayDays: 0,
    subject: `Welcome, ${FIRST} — we need to confirm a few details`,
    body: `Your case is with Turnbull Moak and Pendergrass and our team is handling the next step. Someone will call you in the next few business days.\n\nBefore your file can move forward we have to confirm a few key details with you directly. It takes about twenty minutes.\n\nIf a call is hard for you, text ${NUMBER} with a better day and time and we will work around you.`,
    method: "Same message as the SMS. Two channels, one expectation.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s02_interview_call",
    stage: "02",
    name: "Secondary interview call",
    kind: "call",
    channel: "call",
    delayDays: 1,
    subject: null,
    body: `Hi ${FIRST}, this is ${AGENT}. You should have gotten a text and an email from me. I am with the team working on your case, and I need about twenty minutes to confirm some details so your file can move. Is now alright, or is there a better time today?`,
    method: "Before hanging up, capture the contact web. If this call does not connect, enter the Stage 06 ladder at step 1 immediately.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s03_thanks_sms",
    stage: "03",
    name: "Interview complete thank-you",
    kind: "sms",
    channel: "sms",
    delayDays: 0,
    subject: null,
    body: `Thank you ${FIRST}, we got everything we needed today. Your file is with the legal team now and nothing is needed from you right now.\n\nSave this number. It is ${AGENT} and it is how I will reach you. I will check in with you regularly so you always know where things stand.`,
    method: "Fires when the interview is marked done. Heartbeat clock starts here.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s04_day3_sms",
    stage: "04",
    name: "Day 3 onboarding SMS",
    kind: "sms",
    channel: "sms",
    delayDays: 3,
    subject: null,
    body: `Hi ${FIRST}, ${AGENT} here. Nothing you need to do right now. Everything from our call is in and the team has it. I will check in with you next week.`,
    method: "No ask. Keep the number saved and the name familiar.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s04_day7_call",
    stage: "04",
    name: "Day 7 onboarding call",
    kind: "call",
    channel: "call",
    delayDays: 7,
    subject: null,
    body: `Hi ${FIRST}, ${AGENT} with your check in. Nothing is wrong. Anything change since we talked, phone, where you are staying? And is there anything you are wondering about that I can get an answer to?`,
    method: "Legal questions get logged and routed to the firm the same day. Never guess at case status.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s04_day14_sms",
    stage: "04",
    name: "Day 14 onboarding SMS",
    kind: "sms",
    channel: "sms",
    delayDays: 14,
    subject: null,
    body: `Hi ${FIRST}, ${AGENT} checking in. Nothing new to report yet, everything is moving the way it should. I just want you to know we are still here with you. Still your best number?`,
    method: "Ask still-your-best-number.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s04_day21_sms",
    stage: "04",
    name: "Day 21 onboarding SMS",
    kind: "sms",
    channel: "sms",
    delayDays: 21,
    subject: null,
    body: `Hi ${FIRST}, quick one from ${AGENT}. Just reply with anything so I know you are good.`,
    method: "A reply is two-way contact and resets the clock.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s04_day30_call",
    stage: "04",
    name: "Day 30 onboarding call",
    kind: "call",
    channel: "call",
    delayDays: 30,
    subject: null,
    body: `Hi ${FIRST}, ${AGENT}. Your check in. I want to be straight with you about timing: cases like yours move slowly and there will be long stretches where I have nothing new to tell you. That is normal and it is not a bad sign. I am going to keep calling anyway so you always know we are still here. Let me re-confirm your numbers and where mail should go, then I will let you get on with your day.`,
    method: "Set the long hold expectation out loud, once, here.",
    approvedByFirm: false,
    fireOnce: true,
  },
  {
    key: "s05_tminus3_sms",
    stage: "05",
    name: "Heartbeat T-3 SMS",
    kind: "sms",
    channel: "sms",
    delayDays: -3,
    subject: null,
    body: `Hi ${FIRST}, ${AGENT}. I will give you a quick call Thursday for your check in. Let me know if a different day is better.`,
    method: "Three days before the heartbeat call.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s05_t0_call",
    stage: "05",
    name: "Heartbeat T0 call",
    kind: "call",
    channel: "call",
    delayDays: 0,
    subject: null,
    body: `Hi ${FIRST}, ${AGENT} with your check in. I do not have anything new for you yet, and that is normal for this kind of case. Everything is moving the way it should. I am calling so you know we are still here and still working. Still your best number? Anything change with where you are staying? Anything you need from me?`,
    method: "Rotate morning / afternoon / evening. Do not invent progress.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s05_t0_evening_sms",
    stage: "05",
    name: "Heartbeat T0 evening SMS",
    kind: "sms",
    channel: "sms",
    delayDays: 0,
    subject: null,
    body: `Hi ${FIRST}, ${AGENT}. Tried you today, no worries. Text me back when you get a chance so I know you are good.`,
    method: "Only if the T0 call missed.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s05_monthly_email",
    stage: "05",
    name: "Heartbeat monthly email",
    kind: "email",
    channel: "email",
    delayDays: 30,
    subject: `Still with you, ${FIRST}`,
    body: `Nothing new to report this month. This kind of case takes a long time and that is expected.\n\nReach ${AGENT} any time at ${NUMBER}.`,
    method: "Three lines. Monthly.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s1_vm",
    stage: "06",
    name: "Ladder step 1 voicemail",
    kind: "voicemail",
    channel: "voicemail",
    delayDays: 0,
    subject: null,
    body: `Hi ${FIRST}, it is ${AGENT} from the team on your case. Nothing is wrong. Give me a call back at ${NUMBER} whenever you get a chance.`,
    method: "Never name the case type or the defendant. If monitored, no voicemail at all.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s2_retry",
    stage: "06",
    name: "Ladder step 2 retry call",
    kind: "call",
    channel: "call",
    delayDays: 2,
    subject: null,
    body: `Hi ${FIRST}, this is ${AGENT} again. I tried you the other day. Is now a better time?`,
    method: "If step 1 was afternoon, step 2 is evening. The rotation is the point.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s3_sms",
    stage: "06",
    name: "Ladder step 3 SMS",
    kind: "sms",
    channel: "sms",
    delayDays: 4,
    subject: null,
    body: `Hi ${FIRST}, this is ${AGENT} from the team on your case. I have not been able to reach you and I want to make sure nothing gets missed. Please call or text me at ${NUMBER}.`,
    method: "Day 4 of the ladder.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s4_ec",
    stage: "06",
    name: "Ladder step 4 emergency contact",
    kind: "call",
    channel: "call",
    delayDays: 7,
    subject: null,
    body: `Hi, this is ${AGENT} calling from Turnbull Moak and Pendergrass. ${FIRST} listed you as someone who could get a message to her. I am not able to share anything about her matter, but if you speak with her, could you ask her to call me at ${NUMBER}? It is important and there is nothing wrong.`,
    method: "Approved script only. Confirm nothing, disclose nothing.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s5_social",
    stage: "06",
    name: "Ladder step 5 social",
    kind: "social",
    channel: "social",
    delayDays: 10,
    subject: null,
    body: `Hi ${FIRST}, this is ${AGENT}. I have been trying to reach you by phone. Please call or text me at ${NUMBER}. Nothing is wrong — I just need to know how to find you.`,
    method: "Requires the signed release. Facebook Messenger and Instagram in the same pass.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s6_letter",
    stage: "06",
    name: "Ladder step 6 letter",
    kind: "letter",
    channel: "letter",
    delayDays: 14,
    subject: null,
    body: `${FIRST}, I have not been able to reach you by phone. Please call ${AGENT} at ${NUMBER}. There is nothing wrong, I just need to know how to find you.`,
    method: "Plain envelope, no firm letterhead visible. A postcard is a privacy risk.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s7_trace",
    stage: "06",
    name: "Ladder step 7 skip trace",
    kind: "trace",
    channel: "trace",
    delayDays: 18,
    subject: null,
    body: `Skip trace / TLO, county inmate search, state corrections, VINELink, obituary check. Log every number found as a new contact point. Never overwrite.`,
    method: "Ops. Append every number. Never overwrite.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s8_memo",
    stage: "06",
    name: "Ladder step 8 investigator memo",
    kind: "memo",
    channel: "memo",
    delayDays: 21,
    subject: "At-risk memo — investigator decision",
    body: `The file is on ladder step 8. Report the ladder step and the facts, never an opinion. The firm decides whether to spend on an investigator.`,
    method: "Facts only. Firm decides spend.",
    approvedByFirm: false,
    fireOnce: false,
  },
  {
    key: "s06_s9_report",
    stage: "06",
    name: "Ladder step 9 at-risk report",
    kind: "memo",
    channel: "memo",
    delayDays: 30,
    subject: "At-risk report — deadline review",
    body: `The file lands on the questionnaire at-risk report alongside its deadline. That report is the dollar figure — staff only, never the firm screen.`,
    method: "Terminal ladder step. Firm decides next spend. Money stays off the firm file.",
    approvedByFirm: false,
    fireOnce: false,
  },
];

export const LADDER_STEPS = [
  { step: 1, dayOffset: 0, key: "s06_s1_vm", label: "Voicemail", channel: "voicemail", target: "primary" },
  { step: 2, dayOffset: 2, key: "s06_s2_retry", label: "Call, different time of day", channel: "call", target: "primary" },
  { step: 3, dayOffset: 4, key: "s06_s3_sms", label: "SMS", channel: "sms", target: "alternate" },
  { step: 4, dayOffset: 7, key: "s06_s4_ec", label: "Stable person, approved script", channel: "call", target: "stable_person" },
  { step: 5, dayOffset: 10, key: "s06_s5_social", label: "Social if release", channel: "social", target: "case_manager" },
  { step: 6, dayOffset: 14, key: "s06_s6_letter", label: "Physical mail, plain envelope", channel: "letter", target: "address" },
  { step: 7, dayOffset: 18, key: "s06_s7_trace", label: "Skip trace and custody search", channel: "trace", target: "system" },
  { step: 8, dayOffset: 21, key: "s06_s8_memo", label: "Investigator memo to firm", channel: "memo", target: "firm" },
  { step: 9, dayOffset: 30, key: "s06_s9_report", label: "At-risk report", channel: "memo", target: "firm" },
] as const;

export function templateByKey(key: string): CadenceTemplate | undefined {
  return M6_TEMPLATES.find((t) => t.key === key);
}

export function templatesForAudience(opts: { isStaff: boolean; approvedOnly?: boolean }): CadenceTemplate[] {
  if (opts.approvedOnly) return M6_TEMPLATES.filter((t) => t.approvedByFirm);
  if (opts.isStaff) return M6_TEMPLATES;
  // Firm may see drafts (Josh has not approved yet) but cannot live-send them.
  return M6_TEMPLATES;
}

export function mergeCadenceText(
  text: string,
  vars: { first?: string | null; agent?: string | null; number?: string | null },
): string {
  const first = (vars.first || "there").trim() || "there";
  const agent = (vars.agent || "your case manager").trim() || "your case manager";
  const number = (vars.number || M6_SENDING_NUMBER).trim() || M6_SENDING_NUMBER;
  return text
    .replaceAll("[First]", first)
    .replaceAll("[Agent]", agent)
    .replaceAll("[number]", number);
}

const STOP_RE = /^\s*(stop|unsubscribe|cancel|end|quit|revoke)\b/i;

export function isStopKeyword(body: string | null | undefined): boolean {
  if (!body) return false;
  return STOP_RE.test(String(body).trim());
}

export function heartbeatIntervalDays(daysSinceInterview: number): 14 | 30 {
  return daysSinceInterview < HEARTBEAT_SWITCH_DAYS ? HEARTBEAT_INITIAL_DAYS : HEARTBEAT_STEADY_DAYS;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

export type FileClock = {
  arrivedAt: string;
  interviewAt: string | null;
  lastTwoWayAt: string | null;
  lastTouchAt: string | null;
  lastInterviewOutcome: "two_way" | "no_answer" | "voicemail" | "bad_number" | null;
  retentionStage: string | null;
  pausedUntil: string | null;
  now: string;
};

export type ResolvedStage = {
  stage: CadenceStage;
  reason: string;
  enterLadder: boolean;
  ladderStep: number | null;
  heartbeatDueAt: string | null;
  heartbeatOverdue: boolean;
  clockResetOnTwoWay: boolean;
};

export function isPausedOn(pausedUntil: string | null | undefined, nowIso: string): boolean {
  if (!pausedUntil) return false;
  const day = pausedUntil.slice(0, 10);
  const nowDay = nowIso.slice(0, 10);
  return day >= nowDay;
}

export function resolveCadenceStage(file: FileClock): ResolvedStage {
  if (isPausedOn(file.pausedUntil, file.now)) {
    return {
      stage: file.interviewAt ? "05" : "02",
      reason: "paused",
      enterLadder: false,
      ladderStep: null,
      heartbeatDueAt: null,
      heartbeatOverdue: false,
      clockResetOnTwoWay: true,
    };
  }

  if (file.lastTwoWayAt && file.retentionStage === "escalation") {
    // Two-way returns the file to where it was. Interview done → heartbeat.
    return finishResolve({ ...file, retentionStage: file.interviewAt ? "heartbeat" : "onboarding" });
  }

  if (!file.interviewAt) {
    const daysOnFile = daysBetween(file.arrivedAt, file.now);
    const missedInterview = file.lastInterviewOutcome === "no_answer"
      || file.lastInterviewOutcome === "voicemail"
      || file.lastInterviewOutcome === "bad_number";
    if (missedInterview || file.retentionStage === "escalation") {
      const ladderAnchor = file.lastTouchAt || file.arrivedAt;
      const step = ladderStepFromDays(Math.max(0, daysBetween(ladderAnchor, file.now)));
      return {
        stage: "06",
        reason: "interview_missed",
        enterLadder: true,
        ladderStep: step,
        heartbeatDueAt: null,
        heartbeatOverdue: false,
        clockResetOnTwoWay: true,
      };
    }
    if (daysOnFile <= 0) {
      return {
        stage: "01",
        reason: "arrival",
        enterLadder: false,
        ladderStep: null,
        heartbeatDueAt: null,
        heartbeatOverdue: false,
        clockResetOnTwoWay: true,
      };
    }
    return {
      stage: "02",
      reason: "interview_window",
      enterLadder: false,
      ladderStep: null,
      heartbeatDueAt: null,
      heartbeatOverdue: false,
      clockResetOnTwoWay: true,
    };
  }

  return finishResolve(file);
}

function finishResolve(file: FileClock): ResolvedStage {
  const daysSinceInterview = daysBetween(file.interviewAt!, file.now);
  const clock = file.lastTwoWayAt || file.interviewAt!;
  const interval = heartbeatIntervalDays(daysSinceInterview);
  const heartbeatDueAt = addDays(clock, interval);
  const overdue = Date.parse(heartbeatDueAt) <= Date.parse(file.now);

  if (file.retentionStage === "escalation" && !file.lastTwoWayAt) {
    const step = ladderStepFromDays(Math.max(0, daysBetween(clock, file.now)));
    return {
      stage: "06",
      reason: "heartbeat_missed",
      enterLadder: true,
      ladderStep: step,
      heartbeatDueAt,
      heartbeatOverdue: overdue,
      clockResetOnTwoWay: true,
    };
  }

  if (overdue && file.retentionStage === "escalation") {
    const step = ladderStepFromDays(Math.max(0, daysBetween(clock, file.now)));
    return {
      stage: "06",
      reason: "heartbeat_missed",
      enterLadder: true,
      ladderStep: step,
      heartbeatDueAt,
      heartbeatOverdue: true,
      clockResetOnTwoWay: true,
    };
  }

  if (daysSinceInterview <= 0) {
    return {
      stage: "03",
      reason: "interview_complete",
      enterLadder: false,
      ladderStep: null,
      heartbeatDueAt,
      heartbeatOverdue: overdue,
      clockResetOnTwoWay: true,
    };
  }
  if (daysSinceInterview < 30) {
    return {
      stage: "04",
      reason: "onboarding",
      enterLadder: false,
      ladderStep: null,
      heartbeatDueAt,
      heartbeatOverdue: overdue,
      clockResetOnTwoWay: true,
    };
  }
  return {
    stage: "05",
    reason: "heartbeat",
    enterLadder: overdue && (file.retentionStage === "escalation"),
    ladderStep: overdue && file.retentionStage === "escalation"
      ? ladderStepFromDays(Math.max(0, daysBetween(clock, file.now)))
      : null,
    heartbeatDueAt,
    heartbeatOverdue: overdue,
    clockResetOnTwoWay: true,
  };
}

export function ladderStepFromDays(daysOverdue: number): number {
  let step = 1;
  for (const s of LADDER_STEPS) {
    if (daysOverdue >= s.dayOffset) step = s.step;
  }
  return step;
}

export function twoWayStopsLadder(outcome: string | null | undefined): boolean {
  return outcome === "two_way";
}

export function enterLadderOnInterviewMiss(outcome: string | null | undefined): boolean {
  return outcome === "no_answer" || outcome === "voicemail" || outcome === "bad_number";
}

export type DueAction = {
  templateKey: string;
  dueAt: string;
  stage: CadenceStage;
  kind: CadenceKind;
};

export function walkCadence(file: FileClock, alreadySentKeys: string[] = []): DueAction[] {
  const resolved = resolveCadenceStage(file);
  const sent = new Set(alreadySentKeys);
  const due: DueAction[] = [];

  if (resolved.reason === "paused") return due;

  if (!file.interviewAt) {
    const arrival = file.arrivedAt;
    for (const t of M6_TEMPLATES.filter((x) => x.stage === "01")) {
      if (t.fireOnce && sent.has(t.key)) continue;
      const at = addDays(arrival, t.delayDays);
      if (Date.parse(at) <= Date.parse(file.now)) {
        due.push({ templateKey: t.key, dueAt: at, stage: t.stage, kind: t.kind });
      }
    }
    const interview = templateByKey("s02_interview_call")!;
    const interviewAt = addDays(arrival, interview.delayDays);
    if (!sent.has(interview.key) && Date.parse(interviewAt) <= Date.parse(file.now) && !resolved.enterLadder) {
      due.push({ templateKey: interview.key, dueAt: interviewAt, stage: "02", kind: "call" });
    }
  } else {
    const start = file.interviewAt;
    const thanks = templateByKey("s03_thanks_sms")!;
    if (!sent.has(thanks.key)) {
      due.push({ templateKey: thanks.key, dueAt: start, stage: "03", kind: "sms" });
    }
    for (const t of M6_TEMPLATES.filter((x) => x.stage === "04")) {
      if (t.fireOnce && sent.has(t.key)) continue;
      const at = addDays(start, t.delayDays);
      if (Date.parse(at) <= Date.parse(file.now)) {
        due.push({ templateKey: t.key, dueAt: at, stage: t.stage, kind: t.kind });
      }
    }
    if (resolved.stage === "05" || (resolved.heartbeatDueAt && Date.parse(resolved.heartbeatDueAt) <= Date.parse(file.now))) {
      const t3 = templateByKey("s05_tminus3_sms")!;
      const t0 = templateByKey("s05_t0_call")!;
      const dueAt = resolved.heartbeatDueAt || file.now;
      const t3At = addDays(dueAt, t3.delayDays);
      if (Date.parse(t3At) <= Date.parse(file.now) && !sent.has(`${t3.key}:${dueAt.slice(0, 10)}`)) {
        due.push({ templateKey: t3.key, dueAt: t3At, stage: "05", kind: "sms" });
      }
      if (Date.parse(dueAt) <= Date.parse(file.now) && !sent.has(`${t0.key}:${dueAt.slice(0, 10)}`)) {
        due.push({ templateKey: t0.key, dueAt, stage: "05", kind: "call" });
      }
    }
  }

  if (resolved.enterLadder && resolved.ladderStep) {
    for (const step of LADDER_STEPS) {
      if (step.step > resolved.ladderStep) break;
      if (sent.has(step.key) && step.step < resolved.ladderStep) continue;
      if (!sent.has(step.key)) {
        due.push({
          templateKey: step.key,
          dueAt: file.now,
          stage: "06",
          kind: (templateByKey(step.key)?.kind ?? "call"),
        });
      }
    }
  }

  return due;
}

export function idempotencyKey(leadId: string, templateKey: string, dueAt: string): string {
  return `m6:${leadId}:${templateKey}:${dueAt.slice(0, 10)}`;
}

// ---------------------------------------------------------------------------
// Hard gates on every outbound — even when send rails are not live.
// ---------------------------------------------------------------------------

export type GateChannel = "sms" | "email" | "call" | "voicemail" | "letter" | "social" | "trace" | "memo";

export type OutboundGateInput = {
  channel: GateChannel;
  body?: string | null;
  subject?: string | null;
  optedOut?: boolean;
  lastInboundBody?: string | null;
  commsMonitored?: boolean;
  safeChannels?: string[] | null;
  now?: Date;
  timezone?: string | null;
  quietStart?: string | null;
  quietEnd?: string | null;
  approvedByFirm?: boolean;
  isStaff?: boolean;
  liveSend?: boolean;
  // Human clicked Send on a file. A filled body is the agent standing behind
  // it. Auto drips still need approvedByFirm — do not pass this from cron.
  agentInitiated?: boolean;
  sendingNumber?: string | null;
  hasJustCallKeys?: boolean;
  hasResendKey?: boolean;
};

export type GateReason =
  | "opted_out"
  | "stop"
  | "quiet_hours"
  | "safe_contact"
  | "monitored_voicemail"
  | "monitored_case_subject"
  | "unapproved_live"
  | "missing_sending_number"
  | "missing_justcall"
  | "missing_resend";

export type GateResult = {
  ok: boolean;
  canLog: boolean;
  canLiveSend: boolean;
  blocked: GateReason[];
};

const CASE_SUBJECT_RE = /\b(motel\s*6|traffick|defendant|lawsuit|filed|court|hearing|sedgwick|g6 hospitality)\b/i;
const FILED_RE = /\b(filed|court date|hearing on|we will file|lawsuit is moving)\b/i;

export function bodyHasForbiddenLegal(text: string | null | undefined): boolean {
  if (!text) return false;
  return FILED_RE.test(text);
}

export function normalizeSafeChannel(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "text" || s === "sms") return "sms";
  if (s === "call" || s === "phone") return "call";
  if (s === "voicemail" || s === "vm") return "voicemail";
  if (s === "email") return "email";
  return s;
}

export function safeChannelsAllow(safe: string[] | null | undefined, channel: GateChannel): boolean {
  if (!safe || safe.length === 0) return true;
  const want = normalizeSafeChannel(channel);
  return safe.some((c) => normalizeSafeChannel(c) === want);
}

export function timezoneFromPhone(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "").replace(/^1/, "");
  const area = d.slice(0, 3);
  // Common NANP. Fallback Central — TMP is Mississippi.
  const ET = new Set(["201", "202", "212", "215", "301", "305", "347", "404", "407", "410", "443", "516", "551", "561", "617", "646", "703", "704", "718", "754", "786", "803", "813", "843", "854", "856", "857", "860", "862", "904", "908", "917", "929", "973", "978"]);
  const PT = new Set(["206", "209", "213", "253", "310", "323", "360", "408", "415", "424", "425", "503", "510", "530", "541", "562", "619", "626", "650", "661", "669", "702", "707", "714", "747", "760", "775", "805", "818", "831", "858", "909", "916", "925", "949", "951"]);
  const MT = new Set(["303", "385", "480", "505", "520", "602", "623", "719", "720", "801", "928"]);
  if (ET.has(area)) return "America/New_York";
  if (PT.has(area)) return "America/Los_Angeles";
  if (MT.has(area)) return "America/Denver";
  return "America/Chicago";
}

function hmToMinutes(hm: string): number {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 8 * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function inQuietHours(opts: {
  now: Date;
  timezone: string;
  start?: string | null;
  end?: string | null;
}): boolean {
  const start = hmToMinutes(opts.start || M6_QUIET_START);
  const end = hmToMinutes(opts.end || M6_QUIET_END);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: opts.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(opts.now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const nowM = hour * 60 + minute;
    if (start <= end) return nowM < start || nowM >= end;
    return nowM >= end && nowM < start;
  } catch {
    const nowM = opts.now.getUTCHours() * 60 + opts.now.getUTCMinutes();
    return nowM < start || nowM >= end;
  }
}

export function evaluateOutboundGates(input: OutboundGateInput): GateResult {
  const blocked: GateReason[] = [];
  const live = !!input.liveSend;

  if (input.optedOut) blocked.push("opted_out");
  if (isStopKeyword(input.lastInboundBody)) blocked.push("stop");

  const tz = input.timezone || "America/Chicago";
  if (inQuietHours({
    now: input.now ?? new Date(),
    timezone: tz,
    start: input.quietStart,
    end: input.quietEnd,
  })) {
    if (input.channel === "sms" || input.channel === "call" || input.channel === "voicemail") {
      blocked.push("quiet_hours");
    }
  }

  if (input.commsMonitored) {
    if (input.channel === "voicemail") blocked.push("monitored_voicemail");
    if (!safeChannelsAllow(input.safeChannels, input.channel)) blocked.push("safe_contact");
    const subj = input.subject || "";
    if (CASE_SUBJECT_RE.test(subj) || CASE_SUBJECT_RE.test(input.body || "")) {
      if (input.channel === "sms" || input.channel === "email" || input.channel === "voicemail") {
        blocked.push("monitored_case_subject");
      }
    }
  }

  if (bodyHasForbiddenLegal(input.body) || bodyHasForbiddenLegal(input.subject)) {
    // Always-rule: never say filed/court/date. Block live; still allow a log
    // so the bad draft is visible, but canLiveSend stays false.
    if (live) blocked.push("unapproved_live");
  }

  if (live && !input.approvedByFirm && !input.agentInitiated) blocked.push("unapproved_live");
  if (live && !input.sendingNumber) blocked.push("missing_sending_number");
  if (live && (input.channel === "sms" || input.channel === "call" || input.channel === "voicemail") && !input.hasJustCallKeys) {
    blocked.push("missing_justcall");
  }
  if (live && input.channel === "email" && !input.hasResendKey) blocked.push("missing_resend");

  const hard = blocked.some((r) => r === "opted_out" || r === "stop" || r === "safe_contact" || r === "monitored_voicemail" || r === "monitored_case_subject");
  const canLog = !hard;
  const canLiveSend = live && blocked.length === 0;
  return { ok: canLog && (!live || canLiveSend), canLog, canLiveSend, blocked };
}

export function gateMessage(reason: GateReason): string {
  switch (reason) {
    case "opted_out": return "This person opted out. Do not send.";
    case "stop": return "They texted STOP. Do not send.";
    case "quiet_hours": return "Quiet hours. Try after 8am in their time zone.";
    case "safe_contact": return "That channel is not safe for this file.";
    case "monitored_voicemail": return "Communications may be monitored. No voicemail.";
    case "monitored_case_subject": return "Communications may be monitored. Nothing that names the case.";
    case "unapproved_live": return "Josh has not approved this script. You can log it, but it will not send.";
    case "missing_sending_number": return "No Motel 6 sending number is set.";
    case "missing_justcall": return "JustCall keys are not in Cloudflare Pages. Logged only.";
    case "missing_resend": return "Resend is not in Pages. Logged only.";
  }
}

// ---------------------------------------------------------------------------
// Today buckets. One function so the home screen and the tests cannot disagree.
// ---------------------------------------------------------------------------

export type TodayFile = {
  lead_id: string;
  last_two_way_at: string | null;
  last_touch_at?: string | null;
  health: string;
  days_overdue: number;
  inbound_waiting?: boolean;
  last_send_failed?: boolean;
  opted_out?: boolean;
  comms_monitored?: boolean;
  next_channel_blocked?: boolean;
  retention_paused_until?: string | null;
  retention_stage?: string | null;
  ladder_step?: number | null;
  now?: string;
};

export type TodayBuckets = {
  repliesWaiting: TodayFile[];
  failedQuiet: TodayFile[];
  ladderPaused: TodayFile[];
  optedOut: TodayFile[];
  safeContactConflicts: TodayFile[];
  neverReached: TodayFile[];
  heartbeatOverdue: TodayFile[];
};

export function todayBuckets(rows: TodayFile[], nowIso = new Date().toISOString()): TodayBuckets {
  const repliesWaiting = rows.filter((r) => !!r.inbound_waiting);
  const optedOut = rows.filter((r) => !!r.opted_out);
  const ladderPaused = rows.filter((r) => isPausedOn(r.retention_paused_until ?? null, nowIso));
  const safeContactConflicts = rows.filter((r) => !!r.comms_monitored && !!r.next_channel_blocked);
  const neverReached = rows.filter((r) => !r.last_two_way_at && !isPausedOn(r.retention_paused_until ?? null, nowIso));
  const heartbeatOverdue = rows.filter((r) =>
    !!r.last_two_way_at
    && r.days_overdue > 0
    && r.health !== "lost"
    && !isPausedOn(r.retention_paused_until ?? null, nowIso)
    && !r.opted_out,
  );
  const failedQuiet = rows.filter((r) => {
    if (r.opted_out || isPausedOn(r.retention_paused_until ?? null, nowIso)) return false;
    if (r.last_send_failed) return true;
    return !!r.last_two_way_at && r.days_overdue > 0 && (r.health === "red" || r.health === "yellow");
  });
  return { repliesWaiting, failedQuiet, ladderPaused, optedOut, safeContactConflicts, neverReached, heartbeatOverdue };
}

export function actorFirmLabel(role: string | null | undefined): "Innovative" | "Turnbull" {
  return role === "firm" ? "Turnbull" : "Innovative";
}

// ---------------------------------------------------------------------------
// Command center. ONE next-move so Today rows and the file banner cannot
// disagree. Same facts, same order of force.
// ---------------------------------------------------------------------------

export const STAGE_LABELS: Record<CadenceStage, string> = {
  "01": "Day 0",
  "02": "Interview",
  "03": "Interview complete",
  "04": "Onboarding drip",
  "05": "Heartbeat",
  "06": "Missed-contact ladder",
};

export const QUEUE_PREVIEW = 10;

export type NextMoveKind =
  | "inbound"
  | "never_interviewed"
  | "ladder"
  | "heartbeat"
  | "lor"
  | "thin_web"
  | "on_track";

export type NextMoveAction = "call" | "text" | "lor" | "none";

export type NextMoveInput = {
  name?: string | null;
  inboundWaiting?: boolean;
  lastTwoWayAt?: string | null;
  interviewAt?: string | null;
  hasInterview?: boolean;
  retentionStage?: string | null;
  ladderStep?: number | null;
  enterLadder?: boolean;
  pausedUntil?: string | null;
  heartbeatOverdue?: boolean;
  daysOverdue?: number;
  lorStatus?: string | null;
  lorFactsReady?: boolean;
  liveContactPoints?: number;
  hasStablePerson?: boolean;
  commsMonitored?: boolean;
  nextTouchDue?: string | null;
  now?: string;
};

export type NextMove = {
  kind: NextMoveKind;
  headline: string;
  line: string;
  action: NextMoveAction;
  actionLabel: string;
  alarm: boolean;
  sort: number;
};

export type FileFact = {
  id: string;
  label: string;
  done: boolean;
};

export type CommandGaugeKey = "gone_dark" | "replies" | "moving" | "ladder" | "lor_not_sent";

function firstNameOf(name: string | null | undefined): string {
  const t = String(name ?? "").trim();
  if (!t || /^unnamed/i.test(t)) return "them";
  return t.split(/\s+/)[0];
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function withinDays(iso: string | null | undefined, days: number, nowIso: string): boolean {
  if (!iso) return false;
  const a = Date.parse(iso);
  const b = Date.parse(nowIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return b - a <= days * 86400000 && b >= a;
}

export function isLorUnsent(status: string | null | undefined): boolean {
  return status !== "sent" && status !== "received";
}

export function ladderSpec(step: number | null | undefined) {
  const n = step && step >= 1 ? Math.min(9, Math.floor(step)) : 1;
  return LADDER_STEPS.find((s) => s.step === n) ?? LADDER_STEPS[0];
}

export function actionForChannel(channel: CadenceChannel): NextMoveAction {
  if (channel === "sms") return "text";
  if (channel === "letter") return "lor";
  if (channel === "memo" || channel === "trace" || channel === "social") return "call";
  return "call";
}

export function nextMove(file: NextMoveInput): NextMove {
  const now = file.now || new Date().toISOString();
  const first = firstNameOf(file.name);
  const interviewKnown = file.hasInterview !== undefined || file.interviewAt !== undefined;
  const interviewed = file.hasInterview === true || !!file.interviewAt;
  const neverTwoWay = !file.lastTwoWayAt;
  const neverInterviewed = interviewKnown ? !interviewed : neverTwoWay;
  const onLadder = file.enterLadder === true || file.retentionStage === "escalation";

  if (file.inboundWaiting) {
    return {
      kind: "inbound",
      headline: `They wrote back. Answer ${first} now.`,
      line: "They wrote back. Answer them now.",
      action: "text",
      actionLabel: "Text",
      alarm: true,
      sort: 0,
    };
  }

  if (neverTwoWay || neverInterviewed) {
    return {
      kind: "never_interviewed",
      headline: "Call the secondary interview. There is no contact web yet.",
      line: "Call the interview. Never reached. No contact web.",
      action: "call",
      actionLabel: "Call",
      alarm: true,
      sort: 1,
    };
  }

  if (onLadder && !isPausedOn(file.pausedUntil, now)) {
    const spec = ladderSpec(file.ladderStep);
    return {
      kind: "ladder",
      headline: `Ladder step ${spec.step}: ${spec.label}. Do this today.`,
      line: `Ladder step ${spec.step}: ${spec.label}. Do this today.`,
      action: actionForChannel(spec.channel as CadenceChannel),
      actionLabel: spec.channel === "sms" ? "Text" : spec.channel === "letter" ? "Mail" : "Call",
      alarm: true,
      sort: 2,
    };
  }

  if (file.heartbeatOverdue || ((file.daysOverdue ?? 0) > 0 && !!file.lastTwoWayAt && !isPausedOn(file.pausedUntil, now))) {
    return {
      kind: "heartbeat",
      headline: `Check-in is late. Call ${first}. Ask still your best number.`,
      line: "Check-in is late. Call them.",
      action: "call",
      actionLabel: "Call",
      alarm: true,
      sort: 3,
    };
  }

  if (isLorUnsent(file.lorStatus) && file.lorFactsReady) {
    return {
      kind: "lor",
      headline: "Send the LOR.",
      line: "Send the LOR. Facts are ready.",
      action: "lor",
      actionLabel: "LOR",
      alarm: true,
      sort: 4,
    };
  }

  const points = file.liveContactPoints ?? 0;
  if (points <= 1 && !file.hasStablePerson) {
    return {
      kind: "thin_web",
      headline: "Get a second number and a stable person before you hang up.",
      line: "Contact web is thin. Get a second number.",
      action: "call",
      actionLabel: "Call",
      alarm: false,
      sort: 5,
    };
  }

  return {
    kind: "on_track",
    headline: `On track. Next check-in ${shortDate(file.nextTouchDue)}.`,
    line: `On track. Next check-in ${shortDate(file.nextTouchDue)}.`,
    action: "none",
    actionLabel: "Open",
    alarm: false,
    sort: 6,
  };
}

export function fileFacts(input: {
  hasInterview?: boolean;
  livePhones?: number;
  hasStablePerson?: boolean;
  lorSent?: boolean;
  hasTwoWay?: boolean;
  commsMonitored?: boolean;
}): FileFact[] {
  return [
    { id: "interview", label: "Interview", done: !!input.hasInterview },
    { id: "two_way", label: "Two-way contact", done: !!input.hasTwoWay },
    { id: "second_number", label: "Second number", done: (input.livePhones ?? 0) >= 2 },
    { id: "stable_person", label: "Stable person", done: !!input.hasStablePerson },
    { id: "lor", label: "LOR sent", done: !!input.lorSent },
    { id: "monitored", label: "Comms monitored — no voicemail", done: !input.commsMonitored },
  ];
}

export function moveInputFromToday(row: TodayFile & {
  claimant_name?: string | null;
  live_contact_points?: number;
  stable_people?: number;
  next_touch_due?: string | null;
  lorStatus?: string | null;
  lorFactsReady?: boolean;
}): NextMoveInput {
  return {
    name: row.claimant_name,
    inboundWaiting: !!row.inbound_waiting,
    lastTwoWayAt: row.last_two_way_at,
    retentionStage: row.retention_stage,
    ladderStep: row.ladder_step,
    enterLadder: row.retention_stage === "escalation",
    pausedUntil: row.retention_paused_until,
    heartbeatOverdue: !!row.last_two_way_at && row.days_overdue > 0 && row.health !== "lost" && !row.opted_out,
    daysOverdue: row.days_overdue,
    lorStatus: row.lorStatus,
    lorFactsReady: row.lorFactsReady,
    liveContactPoints: row.live_contact_points,
    hasStablePerson: (row.stable_people ?? 0) > 0,
    commsMonitored: row.comms_monitored,
    nextTouchDue: row.next_touch_due,
    now: row.now,
  };
}

export function commandGauges(
  rows: TodayFile[],
  opts?: { nowIso?: string; lorNotSentIds?: Set<string> },
): Record<CommandGaugeKey, TodayFile[]> {
  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const buckets = todayBuckets(rows, nowIso);
  const ladder = rows.filter((r) => {
    if (isPausedOn(r.retention_paused_until ?? null, nowIso) || r.opted_out) return false;
    return r.retention_stage === "escalation" || ((r.ladder_step ?? 0) > 0);
  });
  const goneDarkIds = new Set([
    ...buckets.neverReached.map((r) => r.lead_id),
    ...buckets.heartbeatOverdue.map((r) => r.lead_id),
    ...ladder.map((r) => r.lead_id),
  ]);
  const goneDark = rows.filter((r) => goneDarkIds.has(r.lead_id));
  const moving = rows.filter((r) => withinDays(r.last_two_way_at, 7, nowIso));
  const lorNotSent = opts?.lorNotSentIds
    ? rows.filter((r) => opts.lorNotSentIds!.has(r.lead_id))
    : [];
  return {
    gone_dark: goneDark,
    replies: buckets.repliesWaiting,
    moving,
    ladder,
    lor_not_sent: lorNotSent,
  };
}
