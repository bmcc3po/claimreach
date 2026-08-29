// Land applies a confirmed ingest. Nothing invents a provider or MMI.
// Texts and PostGrid do not send. Queue LOR writes a send-log row as queued.

import {
  TURN_DEMO_TODAY,
  type AskKey,
  type PlaybookHitId,
  type TurnFile,
  type TurnNote,
  type TurnPatch,
  type TurnTask,
} from "./types";
import { formatShort } from "./fields";
import { DEMO_ACTORS } from "./seed";
import {
  draftChiroSms,
  mondayAfter,
  returnToProviderRule,
  smsBlockedReason,
  smsSendEnabled,
  tomorrowOf,
} from "./playbook";

export function applyPatch(file: TurnFile, patch: TurnPatch, today = TURN_DEMO_TODAY): TurnFile {
  const next: TurnFile = {
    ...file,
    people: file.people.map((p) => ({ ...p })),
    providers: file.providers.map((p) => ({ ...p })),
    carriers: file.carriers.map((c) => ({ ...c })),
    liens: [...file.liens],
    sendLog: [...file.sendLog],
    tasks: file.tasks.map((t) => ({ ...t })),
    notes: file.notes.map((n) => ({ ...n })),
    timeline: file.timeline.map((t) => ({ ...t })),
    asks: { ...file.asks },
    keep: { ...file.keep },
    leftToTreat: [...file.leftToTreat],
    injuries: [...file.injuries],
  };

  if (patch.clientPref) next.clientPref = patch.clientPref;
  if (patch.keepReset) {
    next.keep = { status: "human-spoke", step: 0 };
    next.lastHumanOn = patch.lastHumanOn || today;
    next.lastHumanWho = patch.lastHumanWho || DEMO_ACTORS.attorney.name;
    next.lastHumanHow = patch.lastHumanHow || "spoke";
  }
  if (patch.lorDisputed) {
    next.carriers = next.carriers.map((c, i) => i === 0 ? { ...c, lorInClaimNotes: false } : c);
  }
  return next;
}

export function appendNote(file: TurnFile, body: string, patch: TurnPatch, today = TURN_DEMO_TODAY): TurnFile {
  const note: TurnNote = {
    id: `note-${file.notes.length + 1}`,
    kind: "call",
    party: patch.noteParty || "File",
    author: patch.noteAuthor || "desk",
    body,
    createdOn: today,
    createdAtLabel: formatShort(today),
  };
  return { ...file, notes: [note, ...file.notes] };
}

function hasTask(file: TurnFile, id: string): boolean {
  return file.tasks.some((t) => t.id === id);
}

export function queueLorResend(file: TurnFile, today = TURN_DEMO_TODAY): TurnFile {
  const carrier = file.carriers[0];
  const claim = carrier?.claimNo || "the claim";
  const send = {
    id: `send-lor-${today}`,
    kind: "lor" as const,
    status: "queued" as const,
    channel: "PostGrid",
    toLabel: carrier ? `${carrier.name} claim ${claim}` : "carrier",
    body: `NOTICE · resend LOR to claim ${claim}. Demo queue only. Not mailed.`,
    createdOn: today,
    live: false as const,
  };
  const task: TurnTask = {
    id: "task-lor",
    owner: "NOTICE · PostGrid",
    playbook: "NOTICE",
    title: `Resend LOR. Adjuster Dana Ruiz said it is not in the claim notes.`,
    due: today,
    dueLabel: "today",
    status: "queued",
  };
  return {
    ...file,
    sendLog: file.sendLog.some((s) => s.id === send.id) ? file.sendLog : [send, ...file.sendLog],
    tasks: hasTask(file, task.id) ? file.tasks.map((t) => t.id === task.id ? { ...t, status: "queued" } : t) : [...file.tasks, task],
  };
}

export function applyHits(file: TurnFile, hits: PlaybookHitId[], patch: TurnPatch, today = TURN_DEMO_TODAY): TurnFile {
  let next = file;
  const sun = tomorrowOf(today);
  const mon = mondayAfter(today);

  if (hits.includes("keep_maya_callback") || patch.callbackOwner) {
    const task: TurnTask = {
      id: "task-maya-call",
      owner: `${DEMO_ACTORS.paralegal.name} · KEEP`,
      playbook: "KEEP",
      title: "Call Ortiz tomorrow by 12:00. PD check status. Voice, not text. Ask last Valley Chiro visit and if he stopped.",
      due: sun,
      dueLabel: `Sun ${formatShort(sun)} · 12:00`,
      status: "open",
    };
    if (!hasTask(next, task.id)) next = { ...next, tasks: [...next.tasks, task] };

    const follow: TurnTask = {
      id: "task-maya-chiro",
      owner: `${DEMO_ACTORS.paralegal.name} · KEEP`,
      playbook: "KEEP",
      title: "If he is still treating: send the chiro-return text after the call. If he dropped off: get him back in this week.",
      due: sun,
      dueLabel: "after the call",
      status: "open",
    };
    if (!hasTask(next, follow.id)) next = { ...next, tasks: [...next.tasks, follow] };
  }

  if (hits.includes("notice_resend_lor")) {
    next = queueLorResend(next, today);
  }

  if (hits.includes("cover_tickler") || patch.adjusterWillEmailOn) {
    const task: TurnTask = {
      id: "task-cover",
      owner: "COVER",
      playbook: "COVER",
      title: "Tickler Monday for dec page / limits email from Dana.",
      due: mon,
      dueLabel: `Mon ${formatShort(mon)}`,
      status: "set",
    };
    if (!hasTask(next, task.id)) next = { ...next, tasks: [...next.tasks, task] };
  }

  return next;
}

export function attachDraftSms(file: TurnFile): TurnFile {
  if (!returnToProviderRule(file)) {
    return { ...file, draftSms: file.draftSms };
  }
  const blocked = smsBlockedReason(file);
  return {
    ...file,
    draftSms: {
      toName: "Samuel Ortiz",
      body: draftChiroSms(file),
      status: "draft",
      blockedReason: blocked,
      sendEnabled: smsSendEnabled(file),
    },
  };
}

export function landFile(opts: {
  file: TurnFile;
  note: string;
  patch: TurnPatch;
  armedHits: PlaybookHitId[];
  today?: string;
}): TurnFile {
  const today = opts.today || TURN_DEMO_TODAY;
  let next = applyPatch(opts.file, opts.patch, today);
  next = appendNote(next, opts.note, opts.patch, today);
  next = applyHits(next, opts.armedHits, opts.patch, today);
  next = attachDraftSms(next);
  next.landed = true;
  if (opts.patch.keepReset) {
    next.timeline = [
      { id: `t-land-${today}`, on: today, label: "KEEP", kind: "KEEP", text: "Human spoke · ladder reset" },
      ...next.timeline,
    ];
  }
  return next;
}

export function answerAsk(file: TurnFile, key: AskKey, value: string): TurnFile {
  const asks = { ...file.asks, [key]: value };
  let next: TurnFile = { ...file, asks };

  if (key === "chiro") {
    next.providers = next.providers.map((p) => {
      if (p.kind !== "chiro") return p;
      if (value === "yes_2x") return { ...p, cadence: "2x/week", lastVisit: p.lastVisit };
      if (value === "dropped") return { ...p, cadence: "dropped off" };
      return p;
    });
    if (value === "dropped") next.treatingStatus = "dropped off";
    if (value === "yes_2x") next.treatingStatus = "still treating";
  }

  if (key === "contact") {
    if (value === "voice_only") next.clientPref = "voice";
    if (value === "text_anyway") next.clientPref = "text";
    if (value === "call_then_text") next.clientPref = "voice_then_text";
  }

  return attachDraftSms(next);
}

export function assignTask(file: TurnFile, taskId: string): TurnFile {
  return {
    ...file,
    tasks: file.tasks.map((t) => t.id === taskId ? { ...t, status: t.status === "open" ? "assigned" : t.status } : t),
  };
}

export function trySendSms(file: TurnFile): { file: TurnFile; sent: false; reason: string } {
  const enabled = file.draftSms?.sendEnabled && smsSendEnabled(file);
  if (!enabled) {
    return { file, sent: false, reason: file.draftSms?.blockedReason || "Send is disabled." };
  }
  return {
    file: {
      ...file,
      sendLog: [{
        id: `sms-blocked-${file.sendLog.length + 1}`,
        kind: "sms",
        status: "blocked",
        channel: "JustCall",
        toLabel: "Samuel Ortiz",
        body: "Demo · not sent. Live SMS is off.",
        createdOn: TURN_DEMO_TODAY,
        live: false,
      }, ...file.sendLog],
    },
    sent: false,
    reason: "Demo · not sent. Live SMS is off.",
  };
}
