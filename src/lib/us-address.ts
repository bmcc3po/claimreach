// ============================================================================
// One US mailing address, split. LawRuler and the call console's File step
// both hand us the whole address on one line ("18475 Zurich Ln, Tinley Park,
// IL 60477"), which used to land entirely in mail_addr1 while city, state and
// ZIP stayed blank, so the file said the address was missing pieces it had
// (Brett, Sep 28). Everything that stores an address runs it through here.
// Returns null when the line does not end in a recognizable city + state, so
// a bare street is never guessed apart.
// ============================================================================
import { SOL } from "./mva-call/state";

export type SplitAddress = { street: string; city: string; state: string; zip: string };

const NAME_TO_CODE = new Map<string, string>(SOL.map(([code, name]) => [name.toUpperCase(), code]));
const CODES = new Set<string>([...SOL.map(([code]) => code), "PR"]);

function stateOf(raw: string): string | null {
  const t = raw.trim().replace(/\.$/, "").toUpperCase();
  if (CODES.has(t)) return t;
  return NAME_TO_CODE.get(t) ?? null;
}

export function splitUsAddress(line: string | null | undefined): SplitAddress | null {
  let s = String(line || "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.replace(/,?\s*(USA|U\.S\.A\.|United States( of America)?)\s*$/i, "").trim();

  // Peel the ZIP off the end.
  let zip = "";
  const z = s.match(/[\s,](\d{5})(?:-(\d{4}))?\s*$/);
  if (z) { zip = z[2] ? `${z[1]}-${z[2]}` : z[1]; s = s.slice(0, z.index).replace(/[\s,]+$/, ""); }

  // Then the state: the last comma part, or the last one or two words of it.
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  let last = parts[parts.length - 1];
  let state = stateOf(last);
  let city = "";
  if (state) {
    parts.pop();
    city = parts.pop() || "";
  } else {
    // "Tinley Park IL" or "Las Vegas Nevada" / "Salt Lake City New Mexico"
    const words = last.split(" ");
    for (const n of [2, 1]) {
      if (words.length <= n) continue;
      const tail = stateOf(words.slice(-n).join(" "));
      if (tail) { state = tail; city = words.slice(0, -n).join(" "); parts.pop(); break; }
    }
  }
  if (!state || !city || !parts.length) return null;
  const street = parts.join(", ");
  if (!/\d/.test(street) && !/^p\.?\s*o\.?\s*box/i.test(street)) return null; // a street has a number
  return { street, city, state, zip };
}

export function joinUsAddress(a: { street?: string | null; city?: string | null; state?: string | null; zip?: string | null }): string {
  const cityState = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter((x) => String(x || "").trim()).join(", ");
  return [String(a.street || "").trim(), cityState].filter(Boolean).join(", ");
}

// The lead columns from a one-line address. `fresh` (the agent just typed a
// new home address) replaces all four; otherwise (tidying a record that came
// in on one line) only blank city/state/ZIP are filled.
export function mailColumnsFrom(
  current: { mail_city?: string | null; mail_state?: string | null; mail_zip?: string | null },
  line: string | null | undefined,
  fresh = false,
): Record<string, string> | null {
  const sp = splitUsAddress(line);
  if (!sp) return null;
  const out: Record<string, string> = { mail_addr1: sp.street };
  if (fresh || !String(current.mail_city || "").trim()) out.mail_city = sp.city;
  if (fresh || !String(current.mail_state || "").trim()) out.mail_state = sp.state;
  if (sp.zip && (fresh || !String(current.mail_zip || "").trim())) out.mail_zip = sp.zip;
  return out;
}
