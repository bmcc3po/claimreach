/** Combine reasons only when they open the exact same matter. A lead-level
 * chooser and two sibling claims must remain separate destinations. */
export function groupHomeNeeds<T extends { href: string; why: string; tone: "bad" | "warn" }>(rows: T[]): T[] {
  const grouped = new Map<string, T>();
  const reasons = new Map<string, Set<string>>();
  for (const row of rows) {
    const existing = grouped.get(row.href);
    if (!existing) {
      grouped.set(row.href, { ...row });
      reasons.set(row.href, new Set([row.why]));
      continue;
    }
    reasons.get(row.href)!.add(row.why);
    existing.why = [...reasons.get(row.href)!].join(" · ");
    if (row.tone === "bad") existing.tone = "bad";
  }
  return [...grouped.values()];
}
