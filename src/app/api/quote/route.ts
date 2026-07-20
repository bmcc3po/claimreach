import { NextResponse } from "next/server";
export const runtime = "edge";

// Motivational quote for the AGENT floor. Deliberately folksy, punchy and a
// little funny — this is read by someone about to pick up a phone, not by
// someone journaling. The external quote API was returning abstract philosophy
// that landed flat, so the curated list is the source now.
const FALLBACK = [
  { q: "The expert in anything was once a beginner.", a: "Helen Hayes" },
  { q: "It always seems impossible until it's done.", a: "Nelson Mandela" },
  { q: "Hard work beats talent when talent doesn't work hard.", a: "Tim Notke" },
  { q: "Do what you can, with what you have, where you are.", a: "Theodore Roosevelt" },
  { q: "You miss 100% of the shots you don't take.", a: "Wayne Gretzky" },
  { q: "Nobody ever drowned in sweat.", a: "old Marine saying" },
  { q: "The best time to plant a tree was 20 years ago. The second best time is now.", a: "proverb" },
  { q: "Fall down seven times, stand up eight.", a: "Japanese proverb" },
  { q: "A smooth sea never made a skilled sailor.", a: "Franklin D. Roosevelt" },
  { q: "If you're going through hell, keep going.", a: "Winston Churchill" },
  { q: "Pressure is a privilege.", a: "Billie Jean King" },
  { q: "The dictionary is the only place success comes before work.", a: "Vince Lombardi" },
  { q: "You don't have to be great to start, but you have to start to be great.", a: "Zig Ziglar" },
  { q: "Every no gets you closer to a yes, so go collect them.", a: "sales floor wisdom" },
  { q: "Talk to enough people and luck starts looking a lot like effort.", a: "sales floor wisdom" },
  { q: "The phone weighs 400 pounds before you pick it up and 4 ounces after.", a: "every closer ever" },
  { q: "Amateurs wait for inspiration. The rest of us just get to work.", a: "Chuck Close" },
  { q: "Be so good they can't ignore you.", a: "Steve Martin" },
  { q: "Somebody's sitting in the shade today because someone planted a tree a long time ago.", a: "Warren Buffett" },
  { q: "Slow is smooth and smooth is fast.", a: "old Navy saying" },
  { q: "Your only competition is who you were yesterday.", a: "unknown" },
  { q: "Luck is what happens when preparation meets opportunity.", a: "Seneca" },
  { q: "Don't watch the clock; do what it does. Keep going.", a: "Sam Levenson" },
  { q: "A river cuts through rock not because of its power but its persistence.", a: "James N. Watkins" },
];

export async function GET() {
  const pick = FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
  return NextResponse.json(pick);
}
