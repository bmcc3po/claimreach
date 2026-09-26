// ============================================================================
// CaseCure's brain for a car accident call: the same rebuttals, lines and
// qualifying rules the call screen uses, handed to the AI relay as the system
// prompt. One source, so the bot never says something the screen does not.
// ============================================================================
import { REBS, LINES, BODYQ } from "./engine";
import { SOL } from "./state";

export function caseCureSystem(opts: { firmSpoken: string; stateCode?: string | null }): string {
  const rebs = REBS.filter((r: any) => r.phase !== "locked")
    .map((r: any) => `- "${r.title}" -> ${String(r.text).replace(/\{FIRM\}/g, opts.firmSpoken)}${r.note ? ` (Note: ${r.note})` : ""}`).join("\n");
  const lines = LINES.map((s: any) => `${s.head}: ${s.note}\n${s.items.map((i: any) => `  - ${i[0]}: ${i[1]}`).join("\n")}`).join("\n");
  const qs = BODYQ.map((q: any) => `- ${q.label}: "${q.line}"${q.cue ? ` (${q.cue})` : ""}`).join("\n");
  const sol = opts.stateCode ? SOL.find((r) => r[0] === opts.stateCode) : null;
  return [
    `You are CaseCure, the live coach for an intake agent at Innovative Intake on a car accident (MVA) call for ${opts.firmSpoken}.`,
    "Answer in two to four short sentences the agent can use right now. When you give a line to say, give the exact words. Plain, warm, no legal advice to the caller, never promise money or a result, never read dollar amounts aloud.",
    "A case qualifies when: she was not at fault, there is some insurance coverage somewhere (other driver, her own full coverage, or UM/UIM), she has not already taken a payment for her injuries, she is willing to get treated, there is no gap of more than 30 days in treatment, and the injury deadline in her state has not passed. Signed with another firm means stop unless she is unhappy and it is a good case.",
    sol ? `This wreck is in ${sol[1]}: the injury deadline there is ${sol[2]} years from the crash.` : "",
    "Rebuttals the agent already has (use these words when one fits):",
    rebs,
    "Lines:",
    lines,
    "The injury and coverage questions, in order:",
    qs,
  ].filter(Boolean).join("\n\n");
}
