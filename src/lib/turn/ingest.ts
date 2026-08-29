// Plain-language ingest. Haiku extract OR a tight fallback parser.
// Never invents MMI or a provider. Patch is validated against stored rows.

import { TURN_DEMO_TODAY, type IngestResult, type TurnFile, type TurnPatch, type WhyKey } from "./types";
import { formatLong, formatShort, storedFacts } from "./fields";
import { DEMO_ACTORS, personByRole, primaryCarrier } from "./seed";
import { mondayAfter, selectHits, tomorrowOf } from "./playbook";

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

export function fallbackParse(file: TurnFile, why: WhyKey, text: string, today = TURN_DEMO_TODAY): TurnPatch {
  const t = text.toLowerCase();
  const patch: TurnPatch = {};
  const adjuster = personByRole(file, "adjuster");

  const clientMad = /\bscream|\bangry\b|\bnobody\b|\bpd check\b|\bthe check\b/.test(t);
  if (why === "client_phone" || clientMad) {
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

  if (why === "adjuster" || /\bdana\b|\badjuster\b|state farm|\bclaim\b/.test(t)) {
    patch.noteParty = patch.noteParty ?? "Adjuster";
    patch.noteAuthor = patch.noteAuthor ?? DEMO_ACTORS.paralegal.name;
    if (/lor|letter of representation/.test(t) && /not in|missing|doesn't have|does not have/.test(t)) {
      patch.lorDisputed = true;
    }
    if (/monday|email/.test(t)) patch.adjusterWillEmailOn = mondayAfter(today);
    if (/limit|dec page/.test(t)) patch.askedLimitsAgain = true;
  }

  if (/person not a text|do not text|don't text|dont text|voice only|no text/.test(t) || why === "client_phone") {
    patch.clientPref = "voice";
  }

  return sanitizePatch(file, patch);
}

export function firmNote(file: TurnFile, why: WhyKey, text: string, patch: TurnPatch, today = TURN_DEMO_TODAY): string {
  const facts = storedFacts(file);
  const carrier = primaryCarrier(file);
  const adjuster = personByRole(file, "adjuster");
  const client = personByRole(file, "client");
  const bits: string[] = [];

  if (why === "adjuster" || patch.noteParty === "Adjuster") {
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
  } else {
    const days = facts.lastHuman;
    bits.push(`Client ${client ? client.lastName : ""} angry`.replace("  ", " ").trim() + `, ${days} no human.`);
    bits.push(file.mmi === false
      ? `Told him not MMI, ${file.nextTreatKind && file.nextTreatOn ? `${file.nextTreatKind} ${formatShort(file.nextTreatOn)}` : "next visit not on the file"}.`
      : `MMI on the file: ${facts.mmi}.`);
    if (patch.callbackOwner) {
      bits.push(`${patch.callbackOwner.split(" ")[0]} calls tomorrow by noon on PD check.`);
    }
  }

  if (patch.clientPref === "voice") {
    bits.push("Client contact preference updated: telephone only, no text.");
  }

  if (!bits.length) {
    bits.push(text.trim() || "Note from the desk.");
  }

  void today;
  return bits.join(" ").replace(/\s+/g, " ").trim();
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

export function runFallbackIngest(file: TurnFile, why: WhyKey, text: string, today = TURN_DEMO_TODAY): IngestResult {
  const patch = fallbackParse(file, why, text, today);
  return {
    source: "fallback",
    note: firmNote(file, why, text, patch, today),
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
  why: WhyKey,
  text: string,
  haiku: { note?: string; patch?: TurnPatch },
  today = TURN_DEMO_TODAY,
): IngestResult {
  const fallback = fallbackParse(file, why, text, today);
  const patch = sanitizePatch(file, { ...fallback, ...(haiku.patch || {}) });
  const note = (haiku.note || "").trim() || firmNote(file, why, text, patch, today);
  return {
    source: "haiku",
    note,
    noteMeta: noteMeta(file, why, patch, today),
    diff: diffRows(file, patch),
    hits: selectHits(file, why, text),
    patch,
    writes: writePreview(file, patch),
  };
}
