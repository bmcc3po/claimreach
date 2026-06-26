"use client";

// ClaimReach logo. The CR mark is sized to the full stacked height of the
// wordmark (CLAIMREACH over CLAIM CONSOLE). CLAIM CONSOLE is letter-spaced to
// span the width of CLAIMREACH above it.
export function Logo({
  height = 42,
  wordmark = true,
  onDark = false,
}: {
  height?: number;       // this is the wordmark BLOCK height target
  wordmark?: boolean;
  onDark?: boolean;
}) {
  const inkColor = onDark ? "#ffffff" : "var(--logo-ink)";
  const subColor = onDark ? "#c2cfdf" : "var(--ink-soft)";

  // Mark matches the stacked wordmark height.
  const markH = height;
  const mark = (
    <span style={onDark ? {
      display: "inline-flex", background: "#fff", borderRadius: 8,
      padding: 5, lineHeight: 0, flex: "0 0 auto",
    } : { lineHeight: 0, flex: "0 0 auto" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cr-mark.png" alt="ClaimReach" style={{ height: markH * 0.78, width: "auto", display: "block" }} />
    </span>
  );

  if (!wordmark) return mark;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      {mark}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{
          fontWeight: 800,
          fontSize: height * 0.6,
          letterSpacing: "0.01em",
          color: inkColor,
          whiteSpace: "nowrap",
        }}>
          CLAIM<span style={{ color: "var(--logo-accent)" }}>REACH</span>
        </span>
        <span style={{
          fontWeight: 600,
          fontSize: height * 0.205,
          // letter-spacing tuned so CLAIM CONSOLE ~ width of CLAIMREACH
          letterSpacing: "0.42em",
          color: subColor,
          marginTop: 4,
          whiteSpace: "nowrap",
        }}>
          CLAIM CONSOLE
        </span>
      </span>
    </span>
  );
}
