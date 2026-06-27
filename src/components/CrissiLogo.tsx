"use client";

// Crissi's own logo. The CR mark (her "Cr") flows into "issi" as one wordmark,
// with a soft care-dot over the i to signal warmth. Theme-aware via currentColor.
export function CrissiLogo({ height = 28, onDark = false }: { height?: number; onDark?: boolean }) {
  const ink = onDark ? "#ffffff" : "var(--logo-ink)";
  const gold = "var(--logo-accent)";
  // viewBox tuned so the CR monogram + issi sit on one baseline.
  return (
    <svg height={height} viewBox="0 0 188 56" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Crissi">
      {/* CR monogram — navy C cradling a gold R, her brand root */}
      <g>
        {/* C */}
        <path d="M40 16.5c-3.4-3-7.9-4.8-12.8-4.8C16.5 11.7 8 19.9 8 30s8.5 18.3 19.2 18.3c4.9 0 9.4-1.8 12.8-4.8l-5.1-5.6c-2 1.8-4.7 2.9-7.7 2.9-6.1 0-10.8-4.6-10.8-10.8S21.1 19.2 27.2 19.2c3 0 5.7 1.1 7.7 2.9l5.1-5.6Z" fill={ink}/>
        {/* R */}
        <path d="M44 12.4h13.7c7 0 11.6 4.2 11.6 10.6 0 4.4-2.2 7.8-5.9 9.4L70.5 47h-9.2l-5.9-12.7h-3.6V47H44V12.4Zm8.8 7v8.6h4.4c2.8 0 4.5-1.6 4.5-4.3s-1.7-4.3-4.5-4.3h-4.4Z" fill={gold}/>
      </g>
      {/* issi — body of her name, navy, with a warm gold care-dot over the first i */}
      <g fill={ink}>
        {/* i */}
        <rect x="86" y="24" width="7.5" height="23" rx="3.2"/>
        {/* s */}
        <path d="M104.4 47.6c-5 0-8.8-2.1-10.6-5.3l5.4-3.4c1 1.6 2.8 2.6 5.1 2.6 1.9 0 3-0.7 3-1.8 0-1.3-1.6-1.7-4.3-2.4-3.9-1-8.4-2.4-8.4-7.3 0-4.3 3.6-7.2 9.2-7.2 4.4 0 7.9 1.8 9.7 4.8l-5.2 3.3c-0.9-1.4-2.5-2.3-4.4-2.3-1.6 0-2.6 0.6-2.6 1.6 0 1.2 1.6 1.6 4.4 2.4 3.9 1 8.4 2.3 8.4 7.4 0 4.6-3.8 7.3-9.1 7.3Z"/>
        {/* s */}
        <path d="M126.3 47.6c-5 0-8.8-2.1-10.6-5.3l5.4-3.4c1 1.6 2.8 2.6 5.1 2.6 1.9 0 3-0.7 3-1.8 0-1.3-1.6-1.7-4.3-2.4-3.9-1-8.4-2.4-8.4-7.3 0-4.3 3.6-7.2 9.2-7.2 4.4 0 7.9 1.8 9.7 4.8l-5.2 3.3c-0.9-1.4-2.5-2.3-4.4-2.3-1.6 0-2.6 0.6-2.6 1.6 0 1.2 1.6 1.6 4.4 2.4 3.9 1 8.4 2.3 8.4 7.4 0 4.6-3.8 7.3-9.1 7.3Z"/>
        {/* i */}
        <rect x="138" y="24" width="7.5" height="23" rx="3.2"/>
      </g>
      {/* warm care-dot over the first i — a soft heart-ish mark in gold */}
      <circle cx="89.7" cy="16.5" r="4.4" fill={gold}/>
      {/* tiny second dot over last i, navy, to balance */}
      <circle cx="141.7" cy="16.5" r="4.4" fill={ink}/>
    </svg>
  );
}
