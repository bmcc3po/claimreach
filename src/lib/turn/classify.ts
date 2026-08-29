// One classifier for concierge dumps. Text wins over a chip.
// Pull questions read stored rows. Mad-client and adjuster are calls.

import type { WhyKey } from "./types";

export type PullTopic = "mmi" | "left_to_treat" | "records" | "last_human";

function norm(text: string): string {
  return (text || "").toLowerCase().replace(/['’]/g, "");
}

export function isMadClient(text: string): boolean {
  const t = norm(text);
  if (/\b(scream(ing|s)?|angry|pissed|furious|yelling|yell)\b/.test(t)) return true;
  if (/\bnobody (called|calling|has called|call)\b/.test(t)) return true;
  if (/\bno one (called|calling|has called)\b/.test(t)) return true;
  if (/\b(pd check|the check)\b/.test(t) && /\b(pissed|angry|scream|nobody|no one|called|calling)\b/.test(t)) {
    return true;
  }
  return false;
}

export function isVoicePref(text: string): boolean {
  const t = norm(text);
  return /person not a text|do not text|dont text|voice only|no text/.test(t);
}

export function isAdjusterTalk(text: string): boolean {
  const t = norm(text);
  if (/\bdana\b|\badjuster\b/.test(t)) return true;
  if (/\bstate farm\b/.test(t) && /\b(lor|limit|claim|dec)\b/.test(t)) return true;
  const lorMissing = /\b(lor|letter of representation)\b/.test(t)
    && /\b(not in|missing|doesnt have|does not have|dont have|do not have)\b/.test(t);
  if (lorMissing) return true;
  if (/\b(limit|dec page|declarations)\b/.test(t) && /\b(ask|asked|email|monday)\b/.test(t)) return true;
  return false;
}

export function detectPulls(text: string): PullTopic[] {
  const t = norm(text);
  const out: PullTopic[] = [];
  if (/\bmmi\b|maximum medical|hit mmi|at mmi/.test(t)) out.push("mmi");
  if (/\bleft to treat\b|whats left|what is left|still (need )?to treat/.test(t)) out.push("left_to_treat");
  if (/\brecords?\b/.test(t) && /\b(stuck|in|missing|how many)\b/.test(t)) out.push("records");
  if (/\blast human\b|last (call|contact|spoke)|how long since/.test(t)) out.push("last_human");
  return out;
}

export function classifyWhy(text: string, hinted?: WhyKey | null): WhyKey {
  const t = (text || "").trim();
  if (!t) return hinted || "looking";

  if (isMadClient(t)) return "client_phone";
  if (isAdjusterTalk(t)) return "adjuster";

  const pulls = detectPulls(t);
  if (pulls.includes("mmi")) return "mmi";
  if (pulls.includes("left_to_treat")) return "left_to_treat";
  if (pulls.includes("records")) return "records";
  if (pulls.includes("last_human")) return "looking";
  if (hinted && hinted !== "looking") return hinted;
  return hinted || "looking";
}
