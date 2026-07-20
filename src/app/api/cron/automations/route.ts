import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/automation-exec";
export const runtime = "edge";

// Automation worklist processor. Protect with CRON_SECRET (x-cron-secret or ?key=).
// Point a Cloudflare Cron Trigger at this every 1-5 minutes.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || url.searchParams.get("key");
  if (!secret || provided !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const res = await drainQueue(url.origin);
  return NextResponse.json({ ok: true, ...res, ran_at: new Date().toISOString() });
}
