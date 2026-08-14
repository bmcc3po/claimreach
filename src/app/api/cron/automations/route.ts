import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/automation-exec";
export const runtime = "edge";

// Automation worklist processor. Requires CRON_SECRET via x-cron-secret header.
// Point a Cloudflare Cron Trigger at this every 1-5 minutes.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const res = await drainQueue(new URL(req.url).origin);
  return NextResponse.json({ ok: true, ...res, ran_at: new Date().toISOString() });
}
