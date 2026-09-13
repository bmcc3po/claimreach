import { NextRequest, NextResponse } from "next/server";
import { ORTIZ_FILE_ID, type TurnFile, type WhyKey, WHY_CHIPS } from "@/lib/turn/types";
import { loadSeedFile } from "@/lib/turn/seed";
import { ingestSystemPrompt, mergeHaikuIngest, parseHaikuJson, runFallbackIngest } from "@/lib/turn/ingest";
import { classifyWhy } from "@/lib/turn/classify";
export const runtime = "edge";

// ClaimTurn extract only. Not Crissi. Not /api/ai. Never reads leads.

const WHY = new Set<WhyKey>(WHY_CHIPS.map((w) => w.key));

function asWhy(v: unknown): WhyKey {
  return typeof v === "string" && WHY.has(v as WhyKey) ? (v as WhyKey) : "looking";
}

async function askHaiku(system: string, user: string): Promise<string> {
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return "";
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) return "";
  const d: any = await r.json().catch(() => null);
  const text = d?.content?.[0]?.text;
  return typeof text === "string" ? text : "";
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  if (fileId !== ORTIZ_FILE_ID) {
    return NextResponse.json({ error: "This demo only opens the Ortiz file." }, { status: 404 });
  }

  const hinted = asWhy(body.why);
  const text = typeof body.text === "string" ? body.text : "";
  const why = classifyWhy(text, hinted);
  const seed = loadSeedFile(fileId);
  if (!seed) return NextResponse.json({ error: "File is not on the demo desk." }, { status: 404 });

  const file = (body.file && typeof body.file === "object" ? body.file : seed) as TurnFile;
  if (file.id !== ORTIZ_FILE_ID) {
    return NextResponse.json({ error: "File is not on the demo desk." }, { status: 404 });
  }

  const fallback = runFallbackIngest(file, why, text);
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return NextResponse.json({ ...fallback, source: "fallback", sourceLabel: "fallback · no key" });

  try {
    const raw = await askHaiku(
      ingestSystemPrompt(),
      JSON.stringify({ why, text, file }),
    );
    const parsed = parseHaikuJson(raw);
    if (!parsed) return NextResponse.json({ ...fallback, sourceLabel: "fallback · haiku miss" });
    return NextResponse.json(mergeHaikuIngest(file, why, text, parsed));
  } catch {
    return NextResponse.json({ ...fallback, sourceLabel: "fallback · haiku miss" });
  }
}
