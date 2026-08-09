"use client";
import Image from "next/image";

// Crissi's logo = the REAL ClaimReach CR mark + "issi" in a matching heavy
// geometric weight, so it reads as one cohesive wordmark: CR + issi = Crissi.
export function CrissiLogo({ height = 28, onDark = false }: { height?: number; onDark?: boolean }) {
  const markH = Math.round(height * 1.15);          // mark a touch taller than text cap height
  const markW = Math.round((markH * 270) / 160);    // preserve PNG aspect ratio
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.max(2, height * 0.08) }}>
      <Image src="/cr-mark.png" alt="" width={markW} height={markH} priority style={{ display: "block" }} />
      <span style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 800,
        fontSize: height,
        letterSpacing: "-0.03em",
        lineHeight: 1,
        color: onDark ? "#ffffff" : "var(--logo-ink)",
        marginLeft: "-0.04em",
      }}>issi</span>
    </span>
  );
}
