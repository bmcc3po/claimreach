// /m6 compose + TextSend copy. One place so the panel cannot claim keys
// are missing when GET /api/m6/compose already reported rails.justcall.

export type ComposeRails = { justcall: boolean; resend: boolean };

export function composeChannel(raw: string | null | undefined): string {
  return (raw || "sms").toLowerCase();
}

export function composeNeedsJustCall(channel: string | null | undefined): boolean {
  const ch = composeChannel(channel);
  return ch === "sms" || ch === "call" || ch === "voicemail";
}

export function composeLiveReady(
  channel: string | null | undefined,
  rails: ComposeRails,
): boolean {
  const ch = composeChannel(channel);
  if (ch === "email") return !!rails.resend;
  if (composeNeedsJustCall(ch)) return !!rails.justcall;
  return false;
}

export function composeIntroHint(
  rails: ComposeRails,
  channel?: string | null,
): string {
  const ch = composeChannel(channel);
  if (ch === "email" && !rails.resend) {
    return "Pick a run-sheet script, then log it. Email stays logged until Resend is in Pages.";
  }
  if (composeNeedsJustCall(ch) && !rails.justcall) {
    return "Pick a run-sheet script, then log it. SMS stays logged until JustCall keys are in Pages.";
  }
  return "Pick a run-sheet script. Log it, or send it. Quiet hours, opt-out, and STOP still apply.";
}

export function composeResultCopy(d: {
  error?: string | null;
  live?: boolean;
  duplicate?: boolean;
  send_status?: string | null;
  gates?: { messages?: string[] };
}): { ok?: string; err?: string } {
  const status = String(d.send_status || "");
  if (d.error) return { err: d.error };
  if (status === "queued" || status === "failed" || status === "blocked") {
    return { err: (d.gates?.messages || []).join(" ") || "That did not send." };
  }
  if (d.duplicate) return { ok: "Already on the timeline. Not sent twice." };
  if (d.live && status === "sent") return { ok: "Sent." };
  return { ok: "Logged to the timeline." };
}
