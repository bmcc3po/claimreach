// Motel 6 Crissi doctrine. ONE brain: the staff Crissi relay + this campaign's
// words. Do not load the California women's prison hub on the /m6 surface.

import { BIBLE } from "./bible";
import { CAMPAIGNS } from "./campaigns";
import {
  ALWAYS_RULES, M6_CRISSI_GUIDANCE, M6_SENDING_NUMBER, M6_TEMPLATES,
} from "./m6-cadence";
import { CRISSI_GUARDRAIL_PROMPT, DISCLAIMER_SHORT } from "./crissi-disclaimers";

export const M6_CRISSI_FORBIDDEN = [
  "california women's prison",
  "ca-womens-prison",
  "ccwf",
  "chowchilla",
  "ciw",
  "folsom women's",
  "vspw",
  "maverick",
] as const;

export type M6CrissiFile = {
  id: string;
  name: string;
  leadNo: string | null;
  commsMonitored?: boolean;
};

export function m6CampaignDoctrine(): string {
  const camp = CAMPAIGNS.find((c) => c.id === "motel6");
  if (!camp) return "Motel 6 hospitality trafficking. Already-retained TMP clients. Secondary interview and retention, not a sale.";
  const say = camp.blocks.flatMap((b) => b.say ?? []).slice(0, 12);
  const avoid = [
    ...camp.blocks.flatMap((b) => b.avoid ?? []),
    ...camp.landmines,
  ].slice(0, 16);
  return [
    `Campaign: ${camp.name} for ${camp.client}.`,
    camp.posture,
    camp.headline,
    `Mission: ${camp.mission.join(" ")}`,
    `Say: ${say.join(" | ")}`,
    `Avoid: ${avoid.join(" | ")}`,
    `Safety gate: "${camp.blocks[0]?.say?.[0] ?? "Are you in a safe place to speak right now?"}"`,
  ].join("\n");
}

function bibleGrounding(): string {
  return BIBLE.map((e) =>
    `${e.title}${e.acute ? " [ACUTE]" : ""}: ${e.summary}`
    + (e.say ? ` SAY: ${e.say.join(" | ")}` : "")
    + (e.avoid ? ` AVOID: ${e.avoid.join(" | ")}` : "")
    + (e.escalate ? ` ESCALATE: ${e.escalate}` : ""),
  ).join("\n");
}

function cadenceWords(): string {
  return M6_TEMPLATES
    .filter((t) => t.channel === "call" || t.channel === "sms" || t.channel === "voicemail")
    .map((t) => `${t.name}: ${t.body}`)
    .join("\n");
}

export function buildM6CrissiSystem(file?: M6CrissiFile | null): string {
  const fileLine = file
    ? `The worker is on a live file: ${file.name}${file.leadNo ? `, TMP ${file.leadNo}` : ""}. Coach for THIS person. Do not invent extra facts.`
      + (file.commsMonitored
        ? " Communications may be monitored. No voicemail. Nothing that names the case, Motel 6, or trafficking in a text or email subject."
        : "")
    : "No file is open. Coach in general Motel 6 / trafficking-survivor words.";

  return `${CRISSI_GUARDRAIL_PROMPT}

You are Crissi, the trauma-informed authority for Motel 6 client care (Innovative + Turnbull Moak & Pendergrass). Never speak as Maverick. Never use California women's prison, CCWF, Chowchilla, CIW, Folsom, or prison-staff doctrine. This surface is hospitality trafficking and retention only.

${DISCLAIMER_SHORT}

${fileLine}

Sending number on every touch: ${M6_SENDING_NUMBER}. Same named human every time. Sixth-grade reading. Never overwrite a contact point. Never guess case status, filing, court, or money. Legal questions go to the firm the same day.

Your role:
${M6_CRISSI_GUIDANCE.role.join("\n")}

Helpful things to say:
${M6_CRISSI_GUIDANCE.say.join("\n")}

What to avoid:
${M6_CRISSI_GUIDANCE.avoid.join("\n")}

On every touch:
${ALWAYS_RULES.join("\n")}

Resources: ${M6_CRISSI_GUIDANCE.resources.map((r) => `${r.name}: ${r.value}`).join(" · ")}

Motel 6 campaign doctrine:
${m6CampaignDoctrine()}

Approved cadence words (use these; do not invent a second script):
${cadenceWords()}

Ground in this bible:
${bibleGrounding()}

Be brief and concrete. 2-5 things to say or do now. Exact words on their own line. Empathy, not sympathy.`;
}

export function doctrineIsPrisonHub(text: string): boolean {
  const s = text.toLowerCase();
  return ["ccwf", "chowchilla", "ciw", "folsom women's", "vspw", "ca-womens-prison"]
    .some((w) => s.includes(w));
}

export { M6_CRISSI_CHIPS } from "./m6-cadence";
