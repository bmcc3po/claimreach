import { NextResponse } from "next/server";
export const runtime = "edge";

// Motivational quote — rotates every load (random, not daily).
const FALLBACK = [
  { q: "The expert in anything was once a beginner.", a: "Helen Hayes" },
  { q: "It always seems impossible until it's done.", a: "Nelson Mandela" },
  { q: "Service to others is the rent you pay for your room here on earth.", a: "Muhammad Ali" },
  { q: "How wonderful it is that nobody need wait a single moment before starting to improve the world.", a: "Anne Frank" },
  { q: "Quality is not an act, it is a habit.", a: "Aristotle" },
  { q: "Hard work beats talent when talent doesn't work hard.", a: "Tim Notke" },
  { q: "Success is the sum of small efforts repeated day in and day out.", a: "Robert Collier" },
  { q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },
  { q: "Courage is grace under pressure.", a: "Ernest Hemingway" },
  { q: "Do what you can, with what you have, where you are.", a: "Theodore Roosevelt" },
];

export async function GET() {
  // Random quote each request (zenquotes /random rotates; fallback also random).
  try {
    const r = await fetch("https://zenquotes.io/api/random", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d[0]?.q) return NextResponse.json({ q: d[0].q, a: d[0].a });
    }
  } catch { /* fall through */ }
  const pick = FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
  return NextResponse.json(pick);
}
