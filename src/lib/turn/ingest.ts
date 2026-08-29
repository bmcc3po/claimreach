// Plain-language ingest. Haiku extract OR a tight fallback parser.
// Never invents MMI or a provider. Patch is validated against stored rows.

import { TURN_DEMO_TODAY, type IngestResult, type TurnFile, type TurnPatch, type WhyKey } from "./types";
import { formatLong, formatShort, storedFacts } from "./fields";
import { DEMO_ACTORS, personByRole, primaryCarrier } from "./seed";
import { mondayAfter, selectHits, tomorrowOf } from "./playbook";
import { classifyWhy, detectPulls, isAdjusterTalk, isMadClient, isVoicePref, type PullTopic } from "./classify";

const PATCH_KEYS = [
  "clientPref", "keepReset", "lastHumanOn", "lastHumanWho", "lastHumanHow",
  "lorDisputed", "adjusterWillEmailOn", "askedLimitsAgain", "pdCheckMentioned",
  "callbackOwner", "callbackWhen", "noteParty", "noteAuthor",
] as const;

export function sanitizePatch(file: TurnFile, incoming: unknown): TurnPatch {
  if (!incoming || typeof incoming !== "object") return {};
  const raw = incoming as Record<string, unknown>;
  const out: TurnPatch = {};
  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const v = raw[key];
    if (key === "clientPref") {
      if (v === "voice" || v === "text" || v === "voice_then_text" || v === "unspecified") {
        out.clientPref = v;
      }
      continue;
    }
    if (key === "keepReset" || key === "lorDisputed" || key === "askedLimitsAgain" || key === "pdCheckMentioned") {
      if (typeof v === "boolean") (out as any)[key] = v;
      continue;
    }
    if (key === "noteParty") {
      if (v === "Client" || v === "Adjuster" || v === "Clerk" || v === "File") out.noteParty = v;
      continue;
    }
    if (typeof v === "string" || v === null) {
      (out as any)[key] = v;
    }
  }
  void file;
  return out;
}

export function fallbackParse(file: TurnFile, whyHint: WhyKey, text: string, today = TURN_DEMO_TODAY): TurnPatch {
  const t = text.toLowerCase();
  const why = classifyWhy(text, whyHint);
  const patch: TurnPatch = {};

  if (why === "client_phone" || isMadClient(text)) {
    patch.keepReset = true;
    patch.lastHumanOn = today;
    patch.lastHumanWho = DEMO_ACTORS.attorney.name;
    patch.lastHumanHow = "spoke";
    patch.callbackOwner = DEMO_ACTORS.paralegal.name;
    patch.callbackWhen = tomorrowOf(today);
    patch.noteParty = "Client";
    patch.noteAuthor = DEMO_ACTORS.attorney.name;
    patch.pdCheckMentioned = /\bpd check\b|\bthe check\b/.test(t);
  }

  if (why === "adjuster" || isAdjusterTalk(text)) {
    patch.noteParty = patch.noteParty ?? "Adjuster";
    patch.noteAuthor = patch.noteAuthor ?? DEMO_ACTORS.paralegal.name;
    if (/lor|letter of representation/.test(t) && /not in|missing|doesn't have|does not have|dont have|do not have/.test(t)) {
      patch.lorDisputed = true;
    }
    if (/monday|email/.test(t)) patch.adjusterWillEmailOn = mondayAfter(today);
    if (/limit|dec page/.test(t)) patch.askedLimitsAgain = true;
  }

  if (isVoicePref(text) || why === "client_phone") {
    patch.clientPref = "voice";
  }

  if (why === "mmi" || why === "left_to_treat" || why === "records" || why === "looking") {
    patch.noteParty = patch.noteParty ?? "File";
    patch.noteAuthor = patch.noteAuthor ?? DEMO_ACTORS.attorney.name;
  }

  return sanitizePatch(file, patch);
}

function mmiAnswer(file: TurnFile): string {
  if (file.mmi === false) return "Not MMI. Still treating.";
  if (file.mmi === true) return "MMI is yes on the file.";
  return "MMI is not on the file.";
}

function leftToTreatAnswer(file: TurnFile): string {
  const facts = storedFacts(file);
  const next = file.nextTreatKind && file.nextTreatOn
    ? `Next ${file.nextTreatKind} ${formatShort(file.nextTreatOn)}${file.nextTreatWhere ? ` at ${file.nextTreatWhere}` : ""}.`
    : `Next visit ${facts.nextTreat}.`;
  return `Left to treat: ${facts.leftToDo}. ${next}`.replace(/\s+/g, " ").trim();
}

function pullLead(file: TurnFile, topics: PullTopic[], why: WhyKey): string {
  const facts = storedFacts(file);
  const want = new Set<PullTopic>(topics);
  if (why === "mmi") want.add("mmi");
  if (why === "left_to_treat") want.add("left_to_treat");
  if (why === "records") want.add("records");
  const bits: string[] = [];
  if (want.has("mmi")) {
    bits.push(mmiAnswer(file));
    if (file.lastTreatKind || file.lastTreatOn) bits.push(`Last treat ${facts.lastTreat}.`);
  }
  if (want.has("left_to_treat")) bits.push(leftToTreatAnswer(file));
  if (want.has("records")) bits.push(`Records ${facts.records}.`);
  if (want.has("last_human")) {
    bits.push(`Last human ${facts.lastHuman}${facts.lastHumanDetail !== "not on the file" ? ` · ${facts.lastHumanDetail}` : ""}.`);
  }
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

export function firmNote(file: TurnFile, whyHint: WhyKey, text: string, patch: TurnPatch, today = TURN_DEMO_TODAY): string {
  const facts = storedFacts(file);
  const carrier = primaryCarrier(file);
  const adjuster = personByRole(file, "adjuster");
  const client = personByRole(file, "client");
  const why = classifyWhy(text, whyHint);
  const pulls = detectPulls(text);
  const mad = isMadClient(text);
  const dump = text.trim();
  const last = client?.lastName || "client";
  const bits: string[] = [];

  if (why === "adjuster" || patch.noteParty === "Adjuster") {
    if (dump) bits.push(`${adjuster ? adjuster.firstName : "Adjuster"}: ${dump}.`);
    bits.push(`Spoke with ${carrier?.name || "carrier"} adjuster ${adjuster ? `${adjuster.firstName} ${adjuster.lastName}` : "on the file"}.`);
    if (carrier?.claimNo) bits.push(`Claim ${carrier.claimNo} remains open.`);
    else bits.push("Claim remains open.");
    if (patch.lorDisputed && carrier?.lorMailedOn) {
      bits.push(`Adjuster reports Letter of Representation is not in the claim notes. File send log shows LOR mailed via ${carrier.lorChannel || "mail"} on ${formatLong(carrier.lorMailedOn)}. Per NOTICE playbook, LOR to be re-sent to the claim.`);
    }
    if (carrier && !carrier.limitsIn && carrier.limitsRequestedOn) {
      bits.push(`Limits request outstanding (COVER letter ${formatShort(carrier.limitsRequestedOn)}); adjuster has no declarations page.`);
    }
    if (patch.adjusterWillEmailOn) {
      bits.push(`Adjuster to email ${formatShort(patch.adjusterWillEmailOn)}.`);
    }
  } else if (mad || why === "client_phone") {
    if (dump) bits.push(`Client ${last}: ${dump}.`);
    else bits.push(`Client ${last} called.`);
    bits.push(`${facts.lastHuman} no human.`);
    if (!pulls.includes("mmi")) {
      bits.push(file.mmi === false
        ? `Told him not MMI, ${file.nextTreatKind && file.nextTreatOn ? `${file.nextTreatKind} ${formatShort(file.nextTreatOn)}` : "next visit not on the file"}.`
        : `MMI on the file: ${facts.mmi}.`);
    } else {
      bits.push(pullLead(file, pulls, why));
    }
    if (patch.callbackOwner) {
      bits.push(`${patch.callbackOwner.split(" ")[0]} calls tomorrow by noon on PD check.`);
    }
  } else {
    const lead = pullLead(file, pulls, why);
    if (lead) bits.push(lead);
    if (dump && !pulls.length && why === "looking") {
      bits.push(`Desk note: ${dump}.`);
      bits.push(`${mmiAnswer(file)} Last treat ${facts.lastTreat}. Records ${facts.records}. Last human ${facts.lastHuman}.`);
    } else if (dump && !lead) {
      bits.push(`Desk note: ${dump}.`);
      bits.push(`${mmiAnswer(file)} Last treat ${facts.lastTreat}. Records ${facts.records}. Last human ${facts.lastHuman}.`);
    }
  }

  if (patch.clientPref === "voice") {
    bits.push("Client contact preference updated: telephone only, no text.");
  }

  if (!bits.length) {
    bits.push(dump || "Note from the desk.");
  }

  void today;
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

export function pullAnswer(file: TurnFile, text: string, whyHint: WhyKey): string | undefined {
  const why = classifyWhy(text, whyHint);
  const pulls = detectPulls(text);
  if (isMadClient(text) || why === "client_phone" || why === "adjuster") return undefined;
  const lead = pullLead(file, pulls, why);
  return lead || undefined;
}

export function noteMeta(file: TurnFile, why: WhyKey, patch: TurnPatch, today = TURN_DEMO_TODAY): string {
  const carrier = primaryCarrier(file);
  const adjuster = personByRole(file, "adjuster");
  const author = patch.noteAuthor
    || (why === "adjuster" ? DEMO_ACTORS.paralegal.name : DEMO_ACTORS.attorney.name);
  const party = patch.noteParty
    || (why === "adjuster" ? "Adjuster" : why === "client_phone" ? "Client" : "File");
  const who = party === "Adjuster" && adjuster
    ? `Adjuster ${adjuster.firstName} ${adjuster.lastName}`
    : party;
  const claim = carrier ? `${carrier.name} ${carrier.claimNo}` : "";
  return ["Call", who, claim, author, formatLong(today)].filter(Boolean).join(" · ");
}

export function diffRows(file: TurnFile, patch: TurnPatch): IngestResult["diff"] {
  const carrier = primaryCarrier(file);
  const rows: IngestResult["diff"] = [];

  if (carrier) {
    rows.push({
      field: "LOR on file",
      before: carrier.lorMailedOn ? `mailed ${formatShort(carrier.lorMailedOn)}${carrier.lorChannel ? ` · ${carrier.lorChannel}` : ""}` : "not on the file",
      after: patch.lorDisputed ? "not in claim notes" : "unchanged",
      changed: !!patch.lorDisputed,
    });
  }

  if (carrier) {
    rows.push({
      field: "Limits",
      before: carrier.limitsIn
        ? "in"
        : carrier.limitsRequestedOn
          ? `already requested ${formatShort(carrier.limitsRequestedOn)} · still out`
          : "not on the file",
      after: patch.askedLimitsAgain ? "asked again · still out" : "unchanged",
      changed: !!patch.askedLimitsAgain,
    });
  }

  rows.push({
    field: "MMI / treat",
    before: file.mmi === false ? "No · still treating" : file.mmi === true ? "Yes" : "not on the file",
    after: "not mentioned · left alone",
    changed: false,
  });

  if (patch.clientPref) {
    rows.push({
      field: "Client pref",
      before: file.clientPref === "unspecified" ? "not on the file" : file.clientPref,
      after: patch.clientPref === "voice" ? "do not text · call" : patch.clientPref,
      changed: patch.clientPref !== file.clientPref,
    });
  }

  return rows;
}

export function writePreview(file: TurnFile, patch: TurnPatch): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [
    { key: "Call log", value: `this note · ${patch.noteParty || "File"} · ${patch.noteAuthor || "desk"}` },
  ];
  if (patch.clientPref === "voice") {
    rows.push({ key: "Client pref", value: "do not text · call" });
  }
  if (patch.keepReset) {
    rows.push({ key: "KEEP ladder", value: "reset · human spoke" });
  }
  if (patch.lorDisputed) {
    rows.push({ key: "Carrier row", value: "LOR disputed by adjuster · resend queued if you tap" });
  }
  if (patch.adjusterWillEmailOn) {
    rows.push({ key: "Tickler", value: `${formatShort(patch.adjusterWillEmailOn)} · Dana email / dec page` });
  }
  if (patch.callbackOwner) {
    rows.push({ key: "Callback owner", value: `${patch.callbackOwner} · tomorrow noon · voice` });
  }
  rows.push({ key: "MMI", value: "unchanged · still no" });
  void file;
  return rows;
}

export function runFallbackIngest(file: TurnFile, whyHint: WhyKey, text: string, today = TURN_DEMO_TODAY): IngestResult {
  const why = classifyWhy(text, whyHint);
  const patch = fallbackParse(file, why, text, today);
  const note = firmNote(file, why, text, patch, today);
  return {
    source: "fallback",
    sourceLabel: "fallback",
    answer: pullAnswer(file, text, why),
    note,
    noteMeta: noteMeta(file, why, patch, today),
    diff: diffRows(file, patch),
    hits: selectHits(file, why, text),
    patch,
    writes: writePreview(file, patch),
  };
}

export function ingestSystemPrompt(): string {
  return [
    "You extract a JSON patch from a messy legal-desk note.",
    "Use ONLY facts from the FILE JSON. Never invent MMI, a provider, a visit, or a date that is not in the note or the file.",
    "If MMI is not mentioned, leave it alone. If a last visit is blank on the file, leave it blank.",
    "Return JSON only with keys: note (firm language, pull relevant existing row facts), patch (optional clientPref voice|text, keepReset boolean, lorDisputed boolean, askedLimitsAgain boolean, adjusterWillEmailOn YYYY-MM-DD or null, pdCheckMentioned boolean, callbackOwner string, callbackWhen YYYY-MM-DD, noteParty Client|Adjuster|Clerk|File, noteAuthor string).",
    "Empty field stays empty. Do not add providers.",
  ].join(" ");
}

export function parseHaikuJson(raw: string): { note?: string; patch?: TurnPatch } | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : trimmed;
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function mergeHaikuIngest(
  file: TurnFile,
  whyHint: WhyKey,
  text: string,
  haiku: { note?: string; patch?: TurnPatch },
  today = TURN_DEMO_TODAY,
): IngestResult {
  const why = classifyWhy(text, whyHint);
  const fallback = fallbackParse(file, why, text, today);
  const patch = sanitizePatch(file, { ...fallback, ...(haiku.patch || {}) });
  const note = (haiku.note || "").trim() || firmNote(file, why, text, patch, today);
  return {
    source: "haiku",
    sourceLabel: "haiku",
    answer: pullAnswer(file, text, why),
    note,
    noteMeta: noteMeta(file, why, patch, today),
    diff: diffRows(file, patch),
    hits: selectHits(file, why, text),
    patch,
    writes: writePreview(file, patch),
  };
}
