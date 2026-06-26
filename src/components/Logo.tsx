"use client";

// ClaimReach logo — tight CR mark + wordmark.
export function Logo({
  height = 40,
  wordmark = true,
  onDark = false,
}: {
  height?: number;
  wordmark?: boolean;
  onDark?: boolean;
}) {
  // On dark backgrounds, sit the mark on a tight white chip so the navy half
  // of the glyph stays visible. Chip is sized to the mark, not the wordmark.
  const markH = height * 1.1;
  const mark = (
    /* eslint-disable-next-line @next/next/no-img-element */
    <span style={onDark ? {
      display: "inline-flex", background: "#fff", borderRadius: 9,
      padding: 6, lineHeight: 0,
    } : { lineHeight: 0 }}>
      <img src="/cr-mark.png" alt="ClaimReach" style={{ height: markH, width: "auto", display: "block" }} />
    </span>
  );

  if (!wordmark) return mark;

  const inkColor = onDark ? "#ffffff" : "var(--logo-ink)";
  const subColor = onDark ? "#aebfd2" : "var(--ink-soft)";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 13 }}>
      {mark}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.05 }}>
        <span style={{ fontWeight: 800, letterSpacing: "0.04em", fontSize: height * 0.56, color: inkColor }}>
          CLAIM<span style={{ color: "var(--logo-accent)" }}>REACH</span>
        </span>
        <span style={{ fontWeight: 500, letterSpacing: "0.26em", fontSize: height * 0.2, color: subColor, marginTop: 4 }}>
          CLAIM CONSOLE
        </span>
      </span>
    </span>
  );
}
