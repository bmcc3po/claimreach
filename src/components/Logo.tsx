"use client";
import Link from "next/link";

// ClaimReach logo — CR mark sized to the full wordmark stack height, links home.
export function Logo({
  height = 40,
  wordmark = true,
  onDark = false,
  href = "/leads",
}: {
  height?: number;       // height of the wordmark stack
  wordmark?: boolean;
  onDark?: boolean;
  href?: string;
}) {
  // The wordmark stack is roughly `height` tall. Make the mark match it.
  const stackH = height;             // total stack height target
  const markH = Math.round(stackH * 0.92);

  const mark = (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        lineHeight: 0,
        ...(onDark
          ? { background: "#fff", borderRadius: 8, padding: 4, height: stackH + 8, width: stackH + 8 }
          : {}),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cr-mark.png" alt="ClaimReach home"
        style={{ height: markH, width: "auto", display: "block" }} />
    </span>
  );

  const inner = wordmark ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      {mark}
      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.02 }}>
        <span style={{ fontWeight: 800, letterSpacing: "0.03em", fontSize: stackH * 0.6,
          color: onDark ? "#fff" : "var(--logo-ink)" }}>
          CLAIM<span style={{ color: "var(--logo-accent)" }}>REACH</span>
        </span>
        <span style={{ fontWeight: 500, letterSpacing: "0.24em", fontSize: stackH * 0.22,
          color: onDark ? "#aebfd2" : "var(--ink-soft)", marginTop: 3 }}>
          CLAIM CONSOLE
        </span>
      </span>
    </span>
  ) : mark;

  return (
    <Link href={href} style={{ textDecoration: "none", display: "inline-flex" }} aria-label="Go to home">
      {inner}
    </Link>
  );
}
