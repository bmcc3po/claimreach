// Concierge reads STORED fields only. Empty says "not on the file."
// Never invent MMI or a provider.

import { TURN_DEMO_TODAY, MISSING, type ContactPref, type TurnFile } from "./types";
export { MISSING };
import { personByRole, primaryCarrier, providerByKind } from "./seed";

export function parseIsoDay(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatShort(iso: string | null | undefined): string {
  const d = parseIsoDay(iso);
  if (!d) return MISSING;
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  }).format(d);
}

export function formatLong(iso: string | null | undefined): string {
  const d = parseIsoDay(iso);
  if (!d) return MISSING;
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(d);
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = parseIsoDay(fromIso);
  const b = parseIsoDay(toIso);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function daysSince(iso: string | null | undefined, today = TURN_DEMO_TODAY): number | null {
  if (!iso) return null;
  return daysBetween(iso, today);
}

export function lastHumanLabel(file: TurnFile, today = TURN_DEMO_TODAY): string {
  const n = daysSince(file.lastHumanOn, today);
  if (n === null) return MISSING;
  if (n <= 0) return "today";
  if (n === 1) return "1 day";
  return `${n} days`;
}

export function mmiLabel(file: TurnFile): string {
  if (file.mmi === true) return "Yes";
  if (file.mmi === false) return "No · still treating";
  return MISSING;
}

export function lastTreatLabel(file: TurnFile): string {
  if (!file.lastTreatKind && !file.lastTreatOn) return MISSING;
  const kind = file.lastTreatKind || MISSING;
  const when = file.lastTreatOn ? formatShort(file.lastTreatOn) : MISSING;
  return `${kind} · ${when}`;
}

export function nextTreatLabel(file: TurnFile): string {
  if (!file.nextTreatKind && !file.nextTreatOn) return MISSING;
  const kind = file.nextTreatKind || MISSING;
  const when = file.nextTreatOn ? formatShort(file.nextTreatOn) : MISSING;
  return `${kind} · ${when}`;
}

export function leftToDoLabel(file: TurnFile): string {
  if (!file.leftToTreat.length) return MISSING;
  if (file.leftToTreat.length === 1) return file.leftToTreat[0];
  const last = file.leftToTreat[file.leftToTreat.length - 1];
  const head = file.leftToTreat.slice(0, -1).join(", ");
  return `${head}, then ${last}`;
}

export function recordsLabel(file: TurnFile): string {
  return `${file.recordsIn} of ${file.recordsTotal} in`;
}

export function limitsLabel(file: TurnFile): string {
  const c = primaryCarrier(file);
  if (!c) return MISSING;
  if (c.limitsIn) return "In";
  if (c.limitsRequestedOn) return `Requested · not in`;
  return MISSING;
}

export function lorLabel(file: TurnFile): string {
  const c = primaryCarrier(file);
  if (!c?.lorMailedOn) return MISSING;
  const ch = c.lorChannel ? ` · ${c.lorChannel}` : "";
  return `sent ${formatShort(c.lorMailedOn)}${ch}`;
}

export function pdCheckLabel(file: TurnFile): string {
  if (file.pdCheckReceived === true) return "Received";
  if (file.pdCheckReceived === false) return "not received";
  return MISSING;
}

export function prefLabel(pref: ContactPref): string {
  if (pref === "voice") return "voice only · do not text";
  if (pref === "text") return "text ok";
  if (pref === "voice_then_text") return "call, then text if he says ok";
  return MISSING;
}

export function valleyChiroLastVisit(file: TurnFile): string {
  const p = providerByKind(file, "chiro");
  if (!p || !p.onFile) return MISSING;
  return p.lastVisit ? formatShort(p.lastVisit) : MISSING;
}

export function storedFacts(file: TurnFile) {
  const client = personByRole(file, "client");
  const adjuster = personByRole(file, "adjuster");
  const insured = personByRole(file, "insured");
  const carrier = primaryCarrier(file);
  return {
    clientName: client ? `${client.firstName} ${client.lastName}` : MISSING,
    clientPhone: client?.phone || MISSING,
    fileNo: file.fileNo,
    caseType: file.caseType,
    phase: file.phase,
    venue: file.venue || MISSING,
    doi: formatLong(file.doi),
    sol: formatLong(file.sol),
    mmi: mmiLabel(file),
    treating: file.treatingStatus,
    lastTreat: lastTreatLabel(file),
    nextTreat: nextTreatLabel(file),
    leftToDo: leftToDoLabel(file),
    records: recordsLabel(file),
    lastHuman: lastHumanLabel(file),
    lastHumanDetail: file.lastHumanWho && file.lastHumanHow
      ? `${file.lastHumanWho} ${file.lastHumanHow}`
      : MISSING,
    keep: `${file.keep.status} · step ${file.keep.step}`,
    pdCheck: pdCheckLabel(file),
    carrier: carrier?.name || MISSING,
    claimNo: carrier?.claimNo || MISSING,
    insured: insured ? `${insured.firstName} ${insured.lastName}` : (carrier?.insured || MISSING),
    adjuster: adjuster ? `${adjuster.firstName} ${adjuster.lastName}` : MISSING,
    adjusterPhone: adjuster?.phone || MISSING,
    lor: lorLabel(file),
    limits: limitsLabel(file),
    injuries: file.injuries.length ? file.injuries.join(", ") : MISSING,
    lastOffer: carrier?.lastOffer || MISSING,
    valleyChiro: providerByKind(file, "chiro")?.onFile ? "Valley Chiro" : MISSING,
    valleyLastVisit: valleyChiroLastVisit(file),
    pref: prefLabel(file.clientPref),
  };
}

export function fieldOrMissing(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  return t || MISSING;
}
