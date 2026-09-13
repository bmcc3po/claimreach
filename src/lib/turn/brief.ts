// Concierge briefs are templates over stored fields. Nothing is invented.

import { TURN_DEMO_TODAY, type WhyKey, type TurnFile } from "./types";
import { daysSince, formatShort, lastHumanLabel, leftToDoLabel, storedFacts } from "./fields";
import { primaryCarrier } from "./seed";

export function pulledBrief(file: TurnFile, today = TURN_DEMO_TODAY): string {
  const f = storedFacts(file);
  const days = lastHumanLabel(file, today);
  const left = leftToDoLabel(file);
  const next = file.nextTreatKind && file.nextTreatOn
    ? `${file.nextTreatKind} ${formatShort(file.nextTreatOn)}${file.nextTreatWhere ? ` at ${file.nextTreatWhere}` : ""}`
    : f.nextTreat;
  const rec = `${file.recordsIn} of ${file.recordsTotal} records in`;
  const mmi = file.mmi === false ? "Not MMI. Still treating." : `MMI: ${f.mmi}.`;
  const last = file.lastTreatKind && file.lastTreatOn
    ? `Last visit ${file.lastTreatKind} ${formatShort(file.lastTreatOn)}.`
    : `Last treat: ${f.lastTreat}.`;
  return [
    mmi,
    last,
    `Left to do: ${left === "not on the file" ? "not on the file" : left}.`,
    next !== "not on the file" ? next + "." : "",
    rec + ".",
    file.pdCheckReceived === false ? "PD check not received." : "",
    `Last human ${days}.`,
  ].filter(Boolean).join(" ");
}

export function screamSayLine(file: TurnFile): string {
  const next = file.nextTreatKind && file.nextTreatOn
    ? `${file.nextTreatKind} ${formatShort(file.nextTreatOn)}${file.nextTreatTime ? ` ${clock(file.nextTreatTime)}` : ""}`
    : "the next visit on the file";
  return `Say: we have the file, ${next}, Maya calls tomorrow by noon on the check. He wants a person, not a text.`;
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const ap = h >= 12 ? "p.m." : "a.m.";
  const hr = h % 12 || 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}` : `${hr}:${String(m || 0).padStart(2, "0")}`;
}

export function whyYelling(file: TurnFile, today = TURN_DEMO_TODAY): { headline: string; body: string } {
  const days = daysSince(file.lastHumanOn, today);
  const n = days ?? 0;
  const who = file.lastHumanWho || "Staff";
  const how = file.lastHumanHow || "touch";
  const when = file.lastHumanOn ? formatShort(file.lastHumanOn) : "not on the file";
  return {
    headline: days === null
      ? "Last human contact is not on the file."
      : `Nobody has called him in ${n} days.`,
    body: `${who} ${how} ${when}. He thinks the case is dead. PD check still not in. ${
      file.nextTreatKind && file.nextTreatOn
        ? `${file.nextTreatKind} ${formatShort(file.nextTreatOn)}, nobody reminded him.`
        : "Next visit is not on the file."
    }`,
  };
}

export function whyYouAreHere(why: WhyKey, file: TurnFile): string {
  if (why === "client_phone") return "Client screaming";
  if (why === "adjuster") {
    const c = primaryCarrier(file);
    return c ? `${c.name} adjuster` : "Adjuster call";
  }
  if (why === "clerk") return "Clerk / court";
  if (why === "mmi") return "MMI check";
  if (why === "left_to_treat") return "What's left to treat";
  if (why === "records") return "Records stuck";
  return "Looking";
}

export function mmiFromRows(file: TurnFile): { mmi: string; treat: string; next: string; left: string } {
  const f = storedFacts(file);
  return { mmi: f.mmi, treat: f.lastTreat, next: f.nextTreat, left: f.leftToDo };
}
