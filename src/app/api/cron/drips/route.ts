import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { dripDispatchEnabled, dripOffResult } from "@/lib/drip-dispatch";
export const runtime = "edge";

// Scheduled drip processor. Requires CRON_SECRET via x-cron-secret header.
// Point a Cloudflare Cron Trigger / external scheduler at this daily.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Kill switch (src/lib/drip-dispatch.ts): off unless DRIP_DISPATCH_ENABLED
  // is exactly "on". A deliberate hold, so the scheduler gets a 200 that
  // says sending is off and nothing moved.
  if (!dripDispatchEnabled()) return NextResponse.json({ ...dripOffResult(), ran_at: new Date().toISOString() });

  const admin = supabaseAdmin();
  const { data: due } = await admin.from("drips_due").select("*").limit(500);
  const origin = url.origin;
  let fired = 0;
  for (const d of due ?? []) {
    if (d.campaign === "motel6") continue;
    if (d.channel === "sms" && d.phone) {
      await fetch(`${origin}/api/justcall`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "text", to: d.phone, body: d.template }),
      }).catch(() => {});
    }
    await admin.from("notes").insert({
      firm_id: d.firm_id, lead_id: d.lead_id, author_name: "Drip",
      scope: "file", body: `Auto ${d.channel} drip "${d.name}" fired (scheduled).`,
    });
    await admin.from("drip_enrollments").update({
      last_sent: new Date().toISOString(),
      next_due: new Date(Date.now() + d.every_days * 86400000).toISOString().slice(0, 10),
    }).eq("id", d.enrollment_id);
    fired++;
  }
  return NextResponse.json({ ok: true, fired, ran_at: new Date().toISOString() });
}
