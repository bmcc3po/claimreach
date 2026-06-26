"use client";

// ClaimReach logo — real CR mark + wordmark, sized for legibility.
export function Logo({
  height = 40,
  wordmark = true,
  onDark = false,
}: {
  height?: number;
  wordmark?: boolean;
  onDark?: boolean;
}) {
  const mark = (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/cr-mark.png"
      alt="ClaimReach"
      style={{
        height, width: "auto", display: "block",
        ...(onDark ? { background: "#ffffff", borderRadius: 8, padding: "5px 8px" } : {}),
      }}
    />
  );

  if (!wordmark) return mark;

  const inkColor = onDark ? "#ffffff" : "var(--logo-ink)";
  const subColor = onDark ? "#aebfd2" : "var(--ink-soft)";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 13 }}>
      {mark}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.05 }}>
        <span style={{ fontWeight: 800, letterSpacing: "0.04em", fontSize: height * 0.52, color: inkColor }}>
          CLAIM<span style={{ color: "var(--logo-accent)" }}>REACH</span>
        </span>
        <span style={{ fontWeight: 500, letterSpacing: "0.28em", fontSize: height * 0.2, color: subColor, marginTop: 4 }}>
          CLAIM CONSOLE
        </span>
      </span>
    </span>
  );
}
