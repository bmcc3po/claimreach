import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { applyM6LeadFilters, requireM6Session } from "@/lib/m6-scope";
import { loadM6ConversationFeed } from "@/lib/m6-file";
export const runtime = "edge";

// Last ~20 Motel 6 comms. Same ClaimReach communications table. No money.
export async function GET() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { data: leads } = await applyM6LeadFilters(
    sb.from("leads").select("id, claimant_name, full_name"),
    session.tmpFirmId,
  ).limit(400);

  const rows = (leads ?? []) as { id: string; claimant_name?: string | null; full_name?: string | null }[];
  const nameOf = new Map<string, string | null>(rows.map((l) => [
    l.id,
    l.claimant_name || l.full_name || null,
  ]));
  const items = await loadM6ConversationFeed(
    sb,
    session.tmpFirmId,
    rows.map((l) => l.id),
    nameOf,
    20,
  );
  return NextResponse.json({ items });
}
