import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { askRelay, callProxy, callRelayDirect, relayConfig } from "@/lib/ai-relay";
export const runtime = "edge";

// Crissi / ClaimReach AI. Same relay as /api/m6/crissi. Do not add a vendor.

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

  const { system, user } = await req.json();
  const answer = await askRelay(system ?? "", user ?? "");
  return NextResponse.json({ answer, error: answer ? undefined : "unreachable" }, { status: 200 });
}
