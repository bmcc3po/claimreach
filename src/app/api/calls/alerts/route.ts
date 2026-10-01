import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { loadDeskWork } from "@/lib/mva-call/desk-data";
import { callAlertsFromQueues } from "@/lib/call-alerts";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

export async function GET() {
  try {
    const sb = await supabaseServer();
    const actor = await gateUser(sb);
    if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
    if (!isInternalRole(actor.role) || !actor.can("leads.view") || !actor.can("calls.log")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
    }
    const work = await loadDeskWork(sb, actor.role);
    if (!work.ready) return NextResponse.json({ error: "Call alerts could not check the current queues. Retrying." }, { status: 503, headers });
    const now = Date.now();
    // No names, numbers, intake answers, or signing evidence in this feed.
    // Future callbacks let a foreground browser alert at the scheduled second.
    return NextResponse.json({ viewer: actor.id, alerts: callAlertsFromQueues(work.queues, now), checkedAt: now }, { headers });
  } catch {
    return NextResponse.json({ error: "Call alerts could not check the current queues. Retrying." }, { status: 503, headers });
  }
}
