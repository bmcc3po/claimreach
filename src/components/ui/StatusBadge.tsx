"use client";
// The single source of truth for status color. Every status maps to ONE of five
// meanings (good/bad/warn/info/neut) via the status model, so color is always
// information, never decoration. Falls back gracefully for unknown keys.
import { resolveStatus, type StatusDef, type StatusTone } from "@/lib/statuses";

export function statusTone(status?: string, live?: StatusDef[]): StatusTone {
  return resolveStatus(status, live).tone;
}

export default function StatusBadge({ status, label, live }: { status?: string; label?: string; live?: StatusDef[] }) {
  const def = resolveStatus(status, live);
  const tone = def.tone;
  const text = label || def.label || status || "—";
  return <span className={`sb ${tone}`}>{text}</span>;
}
