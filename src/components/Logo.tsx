"use client";

// ClaimReach logo — real CR mark (public/cr-mark.png) + wordmark.
// `onDark` forces white wordmark text for the always-navy appbar.
export function Logo({
  height = 32,
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
        ...(onDark ? { background: "rgba(255,255,255,0.95)", borderRadius: 7, padding: "4px 6px" } : {}),
      }}
    />
  );

  if (!wordmark) return mark;

  const inkColor = onDark ? "#ffffff" : "var(--logo-ink)";
  const subColor = onDark ? "#aebfd2" : "var(--ink-soft)";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {mark}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.06em", fontSize: height * 0.46, color: inkColor }}>
          CLAIM<span style={{ color: "var(--logo-accent)" }}>REACH</span>
        </span>
        <span style={{ fontWeight: 500, letterSpacing: "0.2em", fontSize: height * 0.22, color: subColor, marginTop: 3 }}>
          CLAIM CONSOLE
        </span>
      </span>
    </span>
  );
}
