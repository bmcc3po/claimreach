import { NextResponse } from "next/server";
export const runtime = "edge";

// Motivational quote proxy. Tries ZenQuotes; falls back to a built-in set.
const FALLBACK = [
  { q: "The expert in anything was once a beginner.", a: "Helen Hayes" },
  { q: "It always seems impossible until it's done.", a: "Nelson Mandela" },
  { q: "Service to others is the rent you pay for your room here on earth.", a: "Muhammad Ali" },
  { q: "How wonderful it is that nobody need wait a single moment before starting to improve the world.", a: "Anne Frank" },
  { q: "Quality is not an act, it is a habit.", a: "Aristotle" },
];

export async function GET() {
  try {
    const r = await fetch("https://zenquotes.io/api/today", { cf: { cacheTtl: 3600 } } as any);
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d[0]?.q) return NextResponse.json({ q: d[0].q, a: d[0].a });
    }
  } catch { /* fall through */ }
  const pick = FALLBACK[new Date().getDate() % FALLBACK.length];
  return NextResponse.json(pick);
}
