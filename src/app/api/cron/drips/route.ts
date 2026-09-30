import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { dripDispatchEnabled, dripOffResult } from "@/lib/drip-dispatch";
import { loadDueDripPage, processDueDrips } from "@/lib/drip-scheduler";
export const runtime = "edge";

// Scheduled drip processor. Requires CRON_SECRET via x-cron-secret header.
// The external heartbeat calls this. Generic rules are date-based reminders;
// they do not implement INNO's minute-based call cadence or a live SMS sender.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Kill switch (src/lib/drip-dispatch.ts): off unless DRIP_DISPATCH_ENABLED
  // is exactly "on". A deliberate hold, so the scheduler gets a 200 that
  // says sending is off and nothing moved.
  if (!dripDispatchEnabled()) return NextResponse.json({ ...dripOffResult(), ran_at: new Date().toISOString() });

  const admin = supabaseAdmin();
  try {
    const page = await loadDueDripPage(admin, 500, new Date(), "call_reminder");
    const result = await processDueDrips(admin, page.rows);
    return NextResponse.json({ ...result, batch: { limit: page.limit, truncated: page.truncated }, ran_at: new Date().toISOString() }, { status: result.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false, fired: 0, error: "Could not load or verify due drips. No successful run was recorded." }, { status: 503 });
  }
}
