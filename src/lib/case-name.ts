// The name people use for a file's case: the campaign when it has one ("INNO
// MVA", "Motel 6"), otherwise the case type in plain words. Display only; the
// stored keys never change.
import { dripCampaignLabel } from "@/lib/drip-rules";

const TYPE_WORDS: Record<string, string> = {
  mva: "MVA",
  motel_trafficking: "Motel trafficking",
};

export function caseName(campaign?: string | null, caseType?: string | null): string {
  const c = String(campaign ?? "").trim();
  if (c && c !== "—") return dripCampaignLabel(c);
  const t = String(caseType ?? "").trim();
  if (!t || t === "—") return "";
  if (TYPE_WORDS[t]) return TYPE_WORDS[t];
  return /[a-z]_[a-z]/.test(t) ? t.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase()) : t;
}

/** "2h ago", "3d ago", "Sep 14". Short enough for a list column. */
export function ago(ts?: string | null, now = Date.now()): string {
  if (!ts) return "";
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "(205) 555-0142" from anything with ten digits. */
export function prettyPhone(raw?: string | null): string {
  const d = String(raw || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(raw || "");
}
