import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { normalizeLead, loadCampaigns, chooseCampaign, ingestLead } from "@/lib/lead-ingest";
export const runtime = "edge";

// GET /api/webhooks/lawruler/replay?hours=48   (owners and admins, signed in)
//
// LawRuler posts that were turned away before the App knew their case type
// (MVA leads sent while the hook was being set up) sit in the webhook log with
// everything they carried. This runs them through the ingest now. Safe to run
// twice: a lead is matched by its LawRuler lead ID, never made a second time.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "Owners and admins only." }, { status: 403 });

  const hours = Math.min(Math.max(Number(new URL(req.url).searchParams.get("hours")) || 48, 1), 24 * 14);
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const admin = supabaseAdmin();
  const { data: events, error } = await admin.from("webhook_events")
    .select("id, created_at, payload, error")
    .eq("event_type", "lawruler.lead").eq("status", "failed").gte("created_at", since)
    .order("created_at", { ascending: true }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const camps = await loadCampaigns(admin);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const ev of events ?? []) {
    const fields = (ev as any).payload?.fields;
    if (!fields || typeof fields !== "object") continue;
    const norm = normalizeLead(fields);
    const camp = chooseCampaign(norm.caseType, camps);
    if (!camp || !norm.leadId) continue;
    if (seen.has(norm.leadId)) continue;
    seen.add(norm.leadId);
    const r = await ingestLead(admin, { lead: norm, campaign: camp, via: "lawruler" });
    out.push({ lawruler_lead_id: norm.leadId, name: norm.name || [norm.first, norm.last].filter(Boolean).join(" "), campaign: camp.name, ok: r.ok, created: r.created ?? false, lead_no: r.lead_no ?? null, error: r.ok ? (r.error ?? null) : r.error });
  }
  return NextResponse.json({ looked_at: (events ?? []).length, replayed: out.length, results: out });
}
