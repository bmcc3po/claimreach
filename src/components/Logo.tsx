"use client";

// ClaimReach logo — mark now fills its frame (PNG cropped tight), so `height`
// renders the actual glyph at that size. Mark matches the wordmark stack height.
export function Logo({
  height = 40,
  wordmark = true,
  onDark = false,
}: {
  height?: number;
  wordmark?: boolean;
  onDark?: boolean;
}) {
  const inkColor = onDark ? "#ffffff" : "var(--logo-ink)";
  const subColor = onDark ? "#c2cfdf" : "var(--ink-soft)";

  // The wordmark stack (CLAIMREACH + CLAIM CONSOLE) is ~height tall.
  // Mark matches that full stack height. Tight white chip only on dark bg.
  const mark = (
    <span style={onDark ? {
      display: "inline-flex", background: "#fff", borderRadius: 7,
      padding: "5px 7px", lineHeight: 0, flex: "0 0 auto",
    } : { lineHeight: 0, flex: "0 0 auto" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cr-mark.png" alt="ClaimReach" style={{ height, width: "auto", display: "block" }} />
    </span>
  );

  if (!wordmark) return mark;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
      {mark}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontWeight: 800, fontSize: height * 0.62, letterSpacing: "0.01em", color: inkColor, whiteSpace: "nowrap" }}>
          CLAIM<span style={{ color: "var(--logo-accent)" }}>REACH</span>
        </span>
        <span style={{ fontWeight: 600, fontSize: height * 0.21, letterSpacing: "0.34em", color: subColor, marginTop: 3, whiteSpace: "nowrap" }}>
          CLAIM CONSOLE
        </span>
      </span>
    </span>
  );
}
