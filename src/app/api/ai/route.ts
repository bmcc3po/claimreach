import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { askRelay, callProxy, callRelayDirect, relayConfig } from "@/lib/ai-relay";
import { gateUser } from "@/lib/gate";
import { canEnterM6App, displayName } from "@/lib/m6";
import { assertM6Write, firmSlugFor } from "@/lib/m6-scope";
import { buildM6CrissiSystem, type M6CrissiFile } from "@/lib/m6-crissi";
export const runtime = "edge";

// One Crissi brain. Staff FloatingDock keeps its client system. /m6 and
// TMP firm users are forced onto Motel 6 / trafficking doctrine — never
// the California women's prison hub. Same relay. No second vendor.

const FILE_COLS = "id, firm_id, campaign, case_type, archived_at, first_name, last_name, full_name, claimant_name, lead_no, comms_monitored";

async function m6File(sb: any, leadId: string): Promise<M6CrissiFile | null> {
  if (!leadId) return null;
  const gate = await assertM6Write(sb, leadId, FILE_COLS);
  if (!gate.ok) return null;
  return {
    id: gate.lead.id,
    name: displayName(gate.lead),
    leadNo: gate.lead.lead_no ?? null,
    commsMonitored: !!gate.lead.comms_monitored,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cfg = relayConfig();
  if (!url.searchParams.get("health")) return NextResponse.json({ ok: true, relay: cfg.relay, proxy: cfg.proxy });
  const out: Record<string, unknown> = { ...cfg };
  try { const d = await callRelayDirect("You are a test.", "say OK"); out.direct = d; }
  catch (e: any) { out.directError = String(e?.message ?? e); }
  if (cfg.proxy) {
    try { const d = await callProxy("You are a test.", "say OK"); out.viaProxy = d; }
    catch (e: any) { out.proxyError = String(e?.message ?? e); }
  }
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const userText = typeof body.user === "string" ? body.user : "";
  let system = typeof body.system === "string" ? body.system : "";

  const gated = await gateUser(sb);
  const firmSlug = gated ? await firmSlugFor(sb, gated.firmId) : null;
  const m6Firm = !!gated && gated.role === "firm" && canEnterM6App({ role: gated.role, firmSlug });
  const m6Surface = body.surface === "m6" || m6Firm;
  if (m6Surface) {
    const leadId = typeof body.lead_id === "string" ? body.lead_id : "";
    system = buildM6CrissiSystem(await m6File(sb, leadId));
  }

  const answer = await askRelay(system ?? "", userText);
  return NextResponse.json({ answer, error: answer ? undefined : "unreachable" }, { status: 200 });
}
