// Brand / owner hunt. Desk history first, then OpenCorporates.
// Never invent an LLC. Never scrape a Secretary of State site.

import { brandHistoryForYear, type BrandHistoryEntry } from "./property-tool";

export const OPENCORPORATES_SEARCH = "https://api.opencorporates.com/v0.4/companies/search";
export const OPENCORPORATES_PUBLIC_SEARCH = "https://opencorporates.com/companies";
export const REGISTRY_UNREACHABLE =
  "Could not reach the company registry. Try Hunt again in a minute. We did not invent an LLC.";
export const REGISTRY_KEY_MISSING =
  "Company registry key is not in Pages (OPENCORPORATES_API_KEY). Type the LLC if you have it.";
export const REGISTRY_KEY_INVALID =
  "OpenCorporates key is missing or invalid. Type the LLC if you have it.";

export type HuntHit = {
  id: string;
  llc: string;
  owner: string;
  address: string;
  brand: string;
  status: string;
  jurisdiction: string;
  companyNumber: string;
  url: string;
  source: "desk" | "opencorporates";
  sourceLabel: string;
  activeInYear: boolean;
};

export type HuntResult = {
  year: number;
  hits: HuntHit[];
  recorded: BrandHistoryEntry | null;
  registry: "ok" | "skipped" | "unauthorized" | "unreachable";
  emptyMessage: string | null;
  error: string | null;
};

export function registryToken(raw?: string | null): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function openCorporatesPublicSearchUrl(query: string): string {
  const q = query.replace(/\s+/g, " ").trim();
  const url = new URL(OPENCORPORATES_PUBLIC_SEARCH);
  if (q) url.searchParams.set("q", q);
  return url.toString();
}

export function huntEmptyMessage(year: number): string {
  return `No filing found for this building in ${year}. You can type one if you have it.`;
}

export function inboundOwnerFields(fields: Record<string, any>): {
  llc: string | null;
  owner: string | null;
  address: string | null;
} {
  const llc = firstText(
    fields.llc, fields.llc_name, fields.property_llc, fields.franchisee,
    fields.franchisee_llc, fields.registered_llc, fields.owner_llc,
  );
  const owner = firstText(
    fields.owner_name, fields.property_owner, fields.registered_owner,
    fields.llc_owner, fields.owner,
  );
  const address = firstText(
    fields.llc_address, fields.owner_address, fields.franchisee_address,
    fields.registered_address,
  );
  return { llc, owner, address };
}

function firstText(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") continue;
    if (s.includes("{{") && s.includes("}}")) continue;
    return s;
  }
  return null;
}

export function yearOfIso(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

export function companyActiveInYear(c: {
  incorporation_date?: string | null;
  dissolution_date?: string | null;
  current_status?: string | null;
}, year: number): boolean {
  const inc = yearOfIso(c.incorporation_date);
  const dis = yearOfIso(c.dissolution_date);
  if (inc != null && inc > year) return false;
  if (dis != null && dis < year) return false;
  const status = (c.current_status || "").toLowerCase();
  if (dis == null && /dissolved|inactive|cancelled|canceled|forfeit|revoked/.test(status) && inc != null && inc > year) {
    return false;
  }
  return true;
}

export function jurisdictionForState(state: string | null | undefined): string {
  const s = (state || "").trim().toLowerCase();
  if (/^[a-z]{2}$/.test(s)) return `us_${s}`;
  return "";
}

export function huntQueries(input: {
  name?: string | null;
  city?: string | null;
  state?: string | null;
}): string[] {
  const name = (input.name || "").trim();
  const city = (input.city || "").trim();
  const state = (input.state || "").trim();
  const place = [city, state].filter(Boolean).join(" ");
  const out: string[] = [];
  const push = (q: string) => {
    const t = q.replace(/\s+/g, " ").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  if (place) {
    push(`Motel 6 ${place}`);
    if (/studio\s*6/i.test(name)) push(`Studio 6 ${place}`);
    push(`G6 Hospitality ${place}`);
  }
  if (name && place) push(`${name} ${place}`);
  else if (name) push(name);
  return out.slice(0, 4);
}

export function scoreHuntHit(hit: HuntHit, year: number, state?: string | null, liveName?: string | null): number {
  let n = 0;
  if (hit.source === "desk") n += 100;
  if (hit.activeInYear) n += 40;
  const want = jurisdictionForState(state);
  if (want && hit.jurisdiction.toLowerCase() === want) n += 25;
  const blob = `${hit.llc} ${hit.brand}`.toLowerCase();
  if (/motel\s*6/.test(blob)) n += 12;
  if (/studio\s*6/.test(blob)) n += 10;
  if (/\bg6\b/.test(blob)) n += 8;
  const live = (liveName || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
  if (live && blob.includes(live.slice(0, 18))) n += 8;
  if (hit.address) n += 4;
  if (hit.url) n += 2;
  if (year && hit.activeInYear === false) n -= 20;
  return n;
}

export function deskHits(history: unknown, year: number): HuntHit[] {
  const hit = brandHistoryForYear(history, year);
  if (!hit || (!hit.llc && !hit.owner && !hit.address)) return [];
  return [{
    id: `desk:${year}:${hit.llc || hit.owner || hit.address}`,
    llc: hit.llc,
    owner: hit.owner,
    address: hit.address,
    brand: hit.brand,
    status: "Recorded on this building",
    jurisdiction: "",
    companyNumber: "",
    url: "",
    source: "desk",
    sourceLabel: "Already on this building",
    activeInYear: true,
  }];
}

export function companiesFromOpenCorporates(payload: any): any[] {
  const rows = payload?.results?.companies;
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => r?.company || r).filter((c: any) => c && c.name);
}

export function huntHitFromCompany(c: any, year: number): HuntHit | null {
  const llc = String(c?.name || "").trim();
  if (!llc) return null;
  const address = String(
    c.registered_address_in_full
    || [
      c.registered_address?.street_address,
      c.registered_address?.locality,
      c.registered_address?.region,
      c.registered_address?.postal_code,
    ].filter(Boolean).join(", "),
  ).trim();
  const jurisdiction = String(c.jurisdiction_code || "").trim();
  const companyNumber = String(c.company_number || "").trim();
  return {
    id: `oc:${jurisdiction}:${companyNumber || llc}`,
    llc,
    owner: "",
    address,
    brand: "",
    status: String(c.current_status || "Unknown").trim() || "Unknown",
    jurisdiction,
    companyNumber,
    url: String(c.opencorporates_url || c.registry_url || "").trim(),
    source: "opencorporates",
    sourceLabel: "Company registry",
    activeInYear: companyActiveInYear(c, year),
  };
}

export function mergeHuntHits(rows: HuntHit[], year: number, state?: string | null, liveName?: string | null): HuntHit[] {
  const seen = new Set<string>();
  const out: HuntHit[] = [];
  for (const row of rows) {
    const key = row.source === "desk"
      ? row.id
      : `${row.jurisdiction}|${row.companyNumber || row.llc}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => scoreHuntHit(b, year, state, liveName) - scoreHuntHit(a, year, state, liveName));
}

export async function searchOpenCorporates(
  query: string,
  opts?: { token?: string | null; fetchImpl?: typeof fetch },
): Promise<
  | { ok: true; companies: any[] }
  | { ok: false; reason: "skipped" | "unauthorized" | "unreachable" }
> {
  const token = registryToken(opts?.token);
  if (!token) return { ok: false, reason: "skipped" };
  const fetchImpl = opts?.fetchImpl || fetch;
  const url = new URL(OPENCORPORATES_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", "20");
  url.searchParams.set("order", "score");
  url.searchParams.set("api_token", token);
  try {
    const r = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (r.status === 401 || r.status === 403) return { ok: false, reason: "unauthorized" };
    if (r.status === 429 || r.status >= 500) return { ok: false, reason: "unreachable" };
    if (!r.ok) return { ok: false, reason: "unreachable" };
    const d = await r.json().catch(() => ({}));
    return { ok: true, companies: companiesFromOpenCorporates(d) };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export async function runBrandHunt(input: {
  year: number;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  history?: unknown;
  token?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<HuntResult> {
  const year = input.year;
  const recorded = brandHistoryForYear(input.history, year);
  const fromDesk = deskHits(input.history, year);
  const queries = huntQueries({ name: input.name, city: input.city, state: input.state });
  const fromRegistry: HuntHit[] = [];
  const token = registryToken(input.token);
  let registry: HuntResult["registry"] = !token || !queries.length ? "skipped" : "ok";

  if (token) {
    for (const q of queries) {
      const found = await searchOpenCorporates(q, { token, fetchImpl: input.fetchImpl });
      if (!found.ok) {
        registry = found.reason === "unauthorized" ? "unauthorized"
          : found.reason === "skipped" ? "skipped"
          : "unreachable";
        break;
      }
      for (const c of found.companies) {
        const hit = huntHitFromCompany(c, year);
        if (hit) fromRegistry.push(hit);
      }
    }
  }

  const hits = mergeHuntHits([...fromDesk, ...fromRegistry], year, input.state, input.name);
  const emptyMessage = !token
    ? REGISTRY_KEY_MISSING
    : registry === "unauthorized"
      ? REGISTRY_KEY_INVALID
      : registry === "unreachable"
        ? REGISTRY_UNREACHABLE
        : hits.length
          ? null
          : huntEmptyMessage(year);
  return {
    year,
    hits,
    recorded,
    registry,
    emptyMessage,
    error: null,
  };
}
