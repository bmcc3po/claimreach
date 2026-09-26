// Where the App lives. One definition, so a rename is one line.
export const APP_HOME = "/app";
export const appLead = (id: string) => `${APP_HOME}/${id}`;
/** The link LawRuler puts in its new-lead text: /app/lr/<LawRuler lead ID>. */
export const appLawRuler = (leadId: string) => `${APP_HOME}/lr/${encodeURIComponent(leadId)}`;

// A deep link into the App that is safe to send someone to after they sign
// in. Same-site paths under /app only; anything else is ignored.
export function safeAppNext(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  if (next.startsWith("//") || next.includes("://") || next.includes("\\")) return null;
  if (next === APP_HOME || next.startsWith(APP_HOME + "/") || next.startsWith(APP_HOME + "?")) return next.slice(0, 300);
  return null;
}

// What kinds of calls the App takes, by campaign case type. MVA today; a new
// kind is one line here plus its call screen.
export const APP_KINDS: { key: string; label: string }[] = [
  { key: "mva", label: "Car accident (MVA)" },
];
export const APP_CASE_TYPES = APP_KINDS.map((k) => k.key);
