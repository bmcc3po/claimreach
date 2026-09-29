import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { normalizeLead, loadCampaigns, chooseCampaign } from "@/lib/lead-ingest";
export const runtime = "edge";

// Historical failed envelopes are diagnostic evidence, not a safe substitute for
// original attachments. GET never replays ingestion or starts communications.
export async function GET(req: NextRequest) {
  const me = await requireStaff(await supabaseServer());
  if (!me || !["owner", "admin"].includes(me.role) || !me.can("settings.manage") || !me.can("leads.view")) return NextResponse.json({ error: "Owners and admins with settings and file access only." }, { status: 403 });
  const q = new URL(req.url).searchParams, firmId = q.get("firm_id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firmId)) return NextResponse.json({ error: "Select a firm." }, { status: 400 });
  const hours = Math.min(Math.max(Number(q.get("hours")) || 48, 1), 24 * 14);
  const admin = supabaseAdmin();
  const { data: events, error } = await admin.from("webhook_events").select("id, firm_id, created_at, payload, error")
    .eq("event_type", "lawruler.lead").eq("status", "failed").or(`firm_id.eq.${firmId},firm_id.is.null`)
    .gte("created_at", new Date(Date.now() - hours * 3600000).toISOString()).order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const campaigns = (await loadCampaigns(admin)).filter(c => c.firm_id === firmId);
    const results: any[] = [];
    for (const event of events || []) {
      const fields = event.payload?.fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) continue;
      const normalized = normalizeLead(fields), campaign = chooseCampaign(normalized.caseType, campaigns);
      if (!campaign || !normalized.leadId) continue;
      results.push({ event_id: event.id, created_at: event.created_at, lawruler_lead_id: normalized.leadId, campaign: campaign.name,
        source_status: normalized.status || null, originals_recoverable_from_log: false,
        next_action: "Review status-sync for an existing exact matter; request original attachments or an authenticated source resend for missing intake/documents." });
    }
    return NextResponse.json({ dry_run: true, looked_at: (events || []).length, history_truncated: (events || []).length >= 500, results, actions_executed: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not preview failed envelopes." }, { status: 500 }); }
}
