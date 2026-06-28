"use client";
// Clean line icons (1.6 stroke), Wave/Arive-style. Keyed by name so the nav
// reads as a real product rail, not an emoji row. Inherits currentColor.
const P: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  files: <><path d="M4 6a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  phone: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  shield: <><path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6Z" /></>,
  spark: <><path d="m13 2-3 8h6l-5 12 3-9H8Z" /></>,
  life: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="m5 5 3.5 3.5M19 5l-3.5 3.5M5 19l3.5-3.5M19 19l-3.5-3.5" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.5M21 20a6 6 0 0 0-5-5.9" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  layout: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
  puzzle: <><path d="M10 4h4v3a2 2 0 0 0 4 0V7h2v4h-1a2 2 0 0 0 0 4h1v4h-4v-1a2 2 0 0 0-4 0v1H6v-4h1a2 2 0 0 0 0-4H6V7h4Z" /></>,
  plug: <><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0Z" /><path d="M12 16v6" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M5 5l2 2M17 17l2 2M2 12h3M19 12h3M5 19l2-2M17 7l2-2" /></>,
  book: <><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z" /><path d="M5 18a2 2 0 0 1 2-2h11" /></>,
  toolbox: <><rect x="3" y="8" width="18" height="11" rx="2" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
};

export default function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] ?? P.layout}
    </svg>
  );
}
