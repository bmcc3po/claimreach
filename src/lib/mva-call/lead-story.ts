// ============================================================================
// What a marketer's lead already tells us, read out of plain words.
//
// Marketers write the case description their own way ("The accident occurred
// within the past 12 months in Alabama, I was not at fault. I do not have a
// lawyer. I am experiencing minor pain or discomfort."). This reads the parts
// the call screen asks about, in any wording close to that, so the agent
// starts with them filled in and confirms each one out loud. Nothing here is
// ever treated as confirmed; it only pre-selects.
// ============================================================================
import { SOL } from "./state";

export interface LeadStory {
  stateCode: string | null;
  stateName: string | null;
  city: string | null;
  fault: "Other driver" | "Caller" | null;
  lawyer: "No" | "Yes" | null;
  pain: string | null;
  when: string | null;
  /** Crash date as YYYY-MM-DD, from a DOI field or the description. */
  doi: string | null;
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** "09/14/2026", "2026-09-14", "Sep 14, 2026" -> "2026-09-14". Null when it is not a real date. */
export function isoDate(v: unknown): string | null {
  const s = clean(v);
  if (!s || s.includes("{{")) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) return fmt(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : fmt(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function fmt(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A two-letter code or a state's name, anywhere it stands alone. */
export function findState(text: string): { code: string; name: string } | null {
  const t = ` ${text} `;
  // Full names first, longest first, so "West Virginia" wins over "Virginia".
  const byName = [...SOL].sort((a, b) => b[1].length - a[1].length);
  for (const [code, name] of byName) {
    const re = new RegExp(`[^A-Za-z]${name.replace(/ /g, "\\s+")}[^A-Za-z]`, "i");
    if (re.test(t)) return { code, name };
  }
  return null;
}

function stateFromField(v: unknown): { code: string; name: string } | null {
  const s = clean(v);
  if (!s || s.includes("{{")) return null;
  const up = s.toUpperCase();
  const hit = SOL.find((r) => r[0] === up || r[1].toUpperCase() === up);
  return hit ? { code: hit[0], name: hit[1] } : findState(s);
}

export function readLeadStory(description: unknown, extra: { doi?: unknown; state?: unknown; city?: unknown } = {}): LeadStory {
  const text = clean(description);
  const low = text.toLowerCase();

  const st = stateFromField(extra.state) || (text ? findState(text) : null);
  const city = clean(extra.city) && !clean(extra.city).includes("{{") ? clean(extra.city) : null;

  let fault: LeadStory["fault"] = null;
  if (/\b(not|wasn'?t|was not|wasnt|weren'?t|am not|i'?m not)\s+(at\s+)?fault\b|\b(not|wasn'?t|was not|isn'?t|is not)\s+my fault\b|\bgot (hit|rear[- ]?ended|t-?boned)\b|\bno fault of (my|mine)\b|\bother (driver|party|car|person)\b[^.]{0,20}\b(at fault|fault|hit me|ran)\b|\b(i was|i got) (hit|rear[- ]?ended)\b/i.test(text)) fault = "Other driver";
  else if (/\b(i was|i am|i'?m)\s+at\s+fault\b|\b(it was|was) my fault\b/i.test(text)) fault = "Caller";

  let lawyer: LeadStory["lawyer"] = null;
  if (/\b(do not|don'?t|dont|does not|doesn'?t|haven'?t|have not|never|no)\s+(have\s+|hired\s+|got\s+|had\s+)?(an?\s+)?(lawyer|attorney|representation)\b|\bnot represented\b|\bunrepresented\b/i.test(text)) lawyer = "No";
  else if (/\b(i|we)\s+(already\s+)?(have|hired|got|retained)\s+(an?\s+)?(lawyer|attorney)\b|\balready represented\b/i.test(text)) lawyer = "Yes";

  // The injury sentence, as they wrote it: "Minor pain or discomfort".
  let pain: string | null = null;
  const pm = text.match(/\b(experiencing|having|have|had|with|suffering(?: from)?|feel(?:ing)?)\s+([^.;]{0,60}?\b(pain|discomfort|injur(?:y|ies)|hurt|sore(?:ness)?|whiplash|broken|fracture[sd]?|concussion|stiff(?:ness)?)\b[^.;]{0,40})/i);
  if (pm) pain = pm[2].trim();
  else {
    const pm2 = text.match(/\b(no|minor|mild|moderate|severe|serious|significant|major)\s+(pain|injur(?:y|ies)|discomfort)[^.;]{0,40}/i);
    if (pm2) pain = pm2[0].trim();
  }
  if (pain) pain = pain.charAt(0).toUpperCase() + pain.slice(1);

  let when: string | null = null;
  const wm = low.match(/\b(within the (past|last) \d+\s+(days?|weeks?|months?|years?)|(today|yesterday|this week|last week|this month|last month)|\d+\s+(days?|weeks?|months?|years?) ago|(more|over|less) than \d+\s+(days?|weeks?|months?|years?)( ago)?)\b/);
  if (wm) when = wm[1];

  const doi = isoDate(extra.doi) || isoDate((text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/) || [])[1]);

  return { stateCode: st?.code ?? null, stateName: st?.name ?? null, city, fault, lawyer, pain, when, doi };
}

/** Short tags for the "From the marketer" card. */
export function storyTags(s: LeadStory): string[] {
  const out: string[] = [];
  if (s.fault === "Other driver") out.push("Not at fault");
  if (s.fault === "Caller") out.push("Says she was at fault");
  if (s.city || s.stateName) out.push(s.city && s.stateCode ? `${s.city}, ${s.stateCode}` : (s.stateName as string));
  if (s.doi) {
    const [y, m, d] = s.doi.split("-");
    out.push(`Crash ${+m}/${+d}/${y}`);
  } else if (s.when) out.push(s.when.charAt(0).toUpperCase() + s.when.slice(1));
  if (s.lawyer === "No") out.push("No lawyer");
  if (s.lawyer === "Yes") out.push("Has a lawyer");
  if (s.pain) out.push(s.pain);
  return out;
}

/**
 * Answers to pre-select on a brand new call, in the call engine's own words.
 * Only fills what the engine asks; the agent confirms and can change any of it.
 */
export function prefillFromStory(s: LeadStory, today: Date = new Date()): { story: Record<string, any>; body: Record<string, any> } | null {
  const story: Record<string, any> = {};
  const body: Record<string, any> = {};
  if (s.fault) story.fault = s.fault;
  if (s.city && s.stateCode) story.city = `${s.city}, ${s.stateCode}`;
  else if (s.stateName) story.city = s.stateName;
  if (s.doi) {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const y = new Date(t.getTime() - 86400000);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (s.doi === iso(t)) story.when = "Today";
    else if (s.doi === iso(y)) story.when = "Yesterday";
    else { story.when = "Pick a date"; story.date = s.doi; }
  }
  if (s.lawyer === "No") body.rep = "No";
  if (!Object.keys(story).length && !Object.keys(body).length) return null;
  return { story, body };
}
