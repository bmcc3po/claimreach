"use client";

// CR monogram + wordmark, rebuilt as inline SVG so it stays crisp at any size
// and recolors with the theme. `variant` controls mark-only vs full lockup.
export function Logo({
  height = 32,
  wordmark = true,
}: {
  height?: number;
  wordmark?: boolean;
}) {
  // The mark: a bold C cradling an R, in the brand style.
  const mark = (
    <svg
      viewBox="0 0 120 90"
      height={height}
      role="img"
      aria-label="ClaimReach"
      style={{ display: "block" }}
    >
      {/* C — open ring */}
      <path
        d="M58 12
           A33 33 0 1 0 58 78
           L58 64
           A19 19 0 1 1 58 26
           Z"
        fill="var(--logo-ink)"
      />
      {/* R — bowl + leg, in gold */}
      <path
        d="M64 20
           L64 78
           L78 78
           L78 56
           L86 56
           L100 78
           L116 78
           L99 53
           A18 17 0 0 0 90 20
           Z
           M78 33
           L88 33
           A6 6 0 0 1 88 45
           L78 45
           Z"
        fill="var(--logo-accent)"
      />
    </svg>
  );

  if (!wordmark) return mark;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {mark}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}>
        <span
          style={{
            fontWeight: 700,
            letterSpacing: "0.08em",
            fontSize: height * 0.5,
            color: "var(--logo-ink)",
          }}
        >
          CLAIM<span style={{ color: "var(--logo-accent)" }}>REACH</span>
        </span>
        <span
          style={{
            fontWeight: 500,
            letterSpacing: "0.22em",
            fontSize: height * 0.24,
            color: "var(--ink-soft)",
            marginTop: 3,
          }}
        >
          INTAKE PLATFORM
        </span>
      </span>
    </span>
  );
}
