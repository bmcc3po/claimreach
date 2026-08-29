// Playbook SELECT. Same hits every time for the same stored facts.
// Buttons, never silent sends. Haiku only fills names and dates from rows.

import { TURN_DEMO_TODAY, type PlaybookHit, type TurnFile, type WhyKey } from "./types";
import { formatShort } from "./fields";
import { primaryCarrier, providerByKind } from "./seed";
import { BOLTON_BUTTON } from "./shell";
import { isMadClient, isVoicePref } from "./classify";

export function selectHits(file: TurnFile, why: WhyKey, text: string): PlaybookHit[] {
  const t = text.toLowerCase();
  const hits: PlaybookHit[] = [];
  const carrier = primaryCarrier(file);
  const claim = carrier?.claimNo || "the claim";

  if (why === "client_phone" || isMadClient(text)) {
    hits.push({
      id: "keep_apologized",
      playbook: "KEEP",
      label: "Apologized",
      button: "Apologized",
      detail: "Human spoke. Ladder resets when you land.",
      bolton: null,
    });
    hits.push({
      id: "keep_maya_callback",
      playbook: "KEEP",
      label: "Maya owns callback",
      button: "Maya owns callback",
      detail: "Call Ortiz tomorrow by noon. Voice, not text. PD check status.",
      bolton: null,
    });
  }

  if (isVoicePref(text) || why === "client_phone") {
    hits.push({
      id: "keep_voice_pref",
      playbook: "KEEP",
      label: "Do not text, call",
      button: "Do not text, call",
      detail: "Client pref = voice only. Draft SMS stays blocked until this is resolved.",
      bolton: null,
    });
  }

  const lorMissing = /lor|letter of representation/.test(t) && /not in|missing|doesn't have|does not have|dont have/.test(t);
  if (lorMissing && carrier?.lorMailedOn) {
    hits.push({
      id: "notice_resend_lor",
      playbook: "NOTICE",
      label: `Resend LOR to claim ${claim}`,
      button: BOLTON_BUTTON.postgrid,
      detail: `NOTICE · resend LOR to claim ${claim}. Bolt-on queues paper. Result lands on the send log. Does not mail.`,
      bolton: "postgrid",
    });
  }

  const limitsTalk = /limit|dec page|declarations/.test(t);
  if (limitsTalk && carrier && !carrier.limitsIn) {
    hits.push({
      id: "cover_tickler",
      playbook: "COVER",
      label: "Tickler Mon for dec page / limits",
      button: "Set tickler",
      detail: "COVER · tickler Monday for dec page / limits email. Shell task. No vendor.",
      bolton: null,
    });
  }

  return uniqueHits(hits);
}

function uniqueHits(hits: PlaybookHit[]): PlaybookHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    if (seen.has(h.id)) return false;
    seen.add(h.id);
    return true;
  });
}

export function returnToProviderRule(file: TurnFile): boolean {
  const chiro = providerByKind(file, "chiro");
  return file.mmi === false
    && file.treatingStatus === "still treating"
    && !!chiro?.onFile
    && !chiro.lastVisit;
}

export function draftChiroSms(file: TurnFile): string {
  const next = file.nextTreatKind && file.nextTreatOn
    ? `keep the ${formatShort(file.nextTreatOn)} ${file.nextTreatKind}${file.nextTreatWhere ? ` at ${file.nextTreatWhere}` : ""}`
    : "keep the next visit on the file";
  return `Hi Samuel, Maya at TMP. You are still treating. We are not at MMI. Please get back into Valley Chiro this week and ${next}. Reply if you need the number. Call us if easier.`;
}

export function smsBlockedReason(file: TurnFile): string | null {
  if (file.clientPref === "voice") {
    return "Draft. Not sent. Pref is voice only until he says otherwise.";
  }
  if (file.clientPref === "unspecified") {
    return "Draft. Not sent. Contact pref is not on the file.";
  }
  if (file.asks.contact === "voice_only") {
    return "Draft. Not sent. Voice only, no text.";
  }
  return null;
}

export function smsSendEnabled(file: TurnFile): boolean {
  if (file.asks.contact === "text_anyway") return true;
  if (file.clientPref === "text") return true;
  return false;
}

export function mondayAfter(today = TURN_DEMO_TODAY): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  dt.setUTCDate(dt.getUTCDate() + add);
  return dt.toISOString().slice(0, 10);
}

export function tomorrowOf(today = TURN_DEMO_TODAY): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}
