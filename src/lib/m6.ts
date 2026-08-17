// Shared vocabulary for the retention app. Defined once so a health colour
// never means one thing on the Today screen and something else on the file.

export type Health = "green" | "yellow" | "red" | "lost" | "paused";

export const HEALTH_LABEL: Record<Health, string> = {
  green: "In touch",
  yellow: "Overdue",
  red: "Hard to reach",
  lost: "Lost contact",
  paused: "Paused",
};

// Said out loud on a call, not read off a dashboard. "Verified 9 days ago"
// is something a person can act on; a raw timestamp is not.
export function daysAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export function dueWording(iso: string | null | undefined): string {
  if (!iso) return "not scheduled";
  const ms = new Date(iso).getTime() - Date.now();
  const d = Math.round(ms / 86400000);
  if (d < -1) return `${Math.abs(d)} days late`;
  if (d === -1 || (d === 0 && ms < 0)) return "due today";
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  return `due in ${d} days`;
}

export function displayName(l: {
  claimant_name?: string | null; full_name?: string | null;
  first_name?: string | null; last_name?: string | null;
}): string {
  const joined = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
  return l.claimant_name || l.full_name || joined || "Unnamed file";
}

// The four ways a contact attempt ends. Only two_way resets the clock, which
// is why the prompt after every call is worth the one tap it costs.
export const OUTCOMES = [
  { value: "two_way",    label: "Reached",    hint: "Spoke with the client" },
  { value: "no_answer",  label: "No answer",  hint: "Rang out, no voicemail left" },
  { value: "voicemail",  label: "Voicemail",  hint: "Left a message" },
  { value: "bad_number", label: "Bad number", hint: "Disconnected or wrong person" },
] as const;

export const PURPOSES = [
  { value: "heartbeat",  label: "Check in" },
  { value: "escalation", label: "Escalation" },
  { value: "onboarding", label: "Onboarding" },
  { value: "inbound",    label: "They called us" },
  { value: "ad_hoc",     label: "Other" },
] as const;

export const POINT_KINDS = [
  { value: "mobile",   label: "Phone" },
  { value: "email",    label: "Email" },
  { value: "person",   label: "Person who can reach them" },
  { value: "social",   label: "Social handle" },
  { value: "address",  label: "Address" },
] as const;
