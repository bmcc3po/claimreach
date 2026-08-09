"use client";
import { tierLabel, tierTone } from "@/lib/tiers";

export default function TierBadge({ letter, number, claimType }: { letter?: string | null; number?: number | null; claimType?: string }) {
  const label = tierLabel(letter, number, claimType);
  if (label === "—") return <span className="muted" style={{ fontSize: 12 }}>untiered</span>;
  return <span className={`badge ${tierTone(letter, number)}`} style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{label}</span>;
}
