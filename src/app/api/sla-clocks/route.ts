import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { clocksFor, DEFAULT_THRESHOLDS, type ClockThresholds, type Clock } from "@/lib/sla-clocks";
import { loadStatuses } from "@/lib/claim-status";
import { resolveStatus } from "@/lib/statuses";
export const runtime = "edge";

// GET /api/sla-clocks
// Returns every file with a live clock (e-sign chase or delivery SLA), plus a
// summary for the billboard. Role-scoped: agents see their own files, managers/
// owner/qa see the floor, firm sees their campaigns.
export async function GET(_req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  // Thresholds (configurable; falls back to 72/72).
  let thresholds: ClockThresholds = DEFAULT_THRESHOLDS;
  try {
    const { data: s } = await admin.from("sla_settings").select("esign_chase_hours, deliver_sla_hours").eq("id", 1).maybeSingle();
    if (s) thresholds = { esign_chase_hours: s.esign_chase_hours ?? 72, deliver_sla_hours: s.deliver_sla_hours ?? 72 };
  } catch {}

  // Pull candidate files: anything signed-not-delivered OR esign-sent-not-signed.
  // Keep the column set tight for speed.
  let q = admin.from("leads")
    .select("id, lead_no, claimant_name, first_name, last_name, campaign, campaign_id, firm_id, signed_at, firm_sent_at, esign_sent_at, assigned_agent")
    .or("and(signed_at.not.is.null,firm_sent_at.is.null),esign_sent_at.not.is.null");

  // Role scoping.
  if (g.role === "agent") q = q.eq("assigned_agent", g.id);
  else if (g.role === "firm" && g.firmId) q = q.eq("firm_id", g.firmId);

  const { data: rows, error } = await q.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve esign status per lead from signable_documents (sent vs signed).
  const ids = (rows ?? []).map((r) => r.id);
  const esignByLead: Record<string, string> = {};
  const statusByLead: Record<string, string> = {};
  if (ids.length) {
    const { data: docs } = await admin.from("signable_documents")
      .select("lead_id, status, sent_at, signed_at").in("lead_id", ids).order("sent_at", { ascending: false });
    for (const d of docs ?? []) {
      if (!esignByLead[d.lead_id]) esignByLead[d.lead_id] = d.status; // latest by sent_at
    }
    // Claim status drives the "stuck stage" label (leads has no status column).
    const { data: claims } = await admin.from("claims").select("lead_id, status").in("lead_id", ids);
    for (const c of claims ?? []) if (!statusByLead[c.lead_id]) statusByLead[c.lead_id] = c.status;
  }

  const statuses = await loadStatuses();
  const now = new Date();

  const items: any[] = [];
  for (const r of rows ?? []) {
    const leadStatus = statusByLead[r.id] ?? "new";
    const def = resolveStatus(leadStatus, statuses);
    const clocks = clocksFor({
      signed_at: r.signed_at,
      firm_sent_at: r.firm_sent_at,
      esign_sent_at: r.esign_sent_at,
      esign_status: esignByLead[r.id] ?? null,
      current_status: leadStatus,
      statusLabel: def.label,
    }, thresholds, now);
    if (clocks.length === 0) continue;
    const name = r.claimant_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed";
    for (const c of clocks) {
      items.push({
        lead_id: r.id, lead_no: r.lead_no, name, campaign: r.campaign,
        firm_id: r.firm_id, ...c,
      });
    }
  }

  // Sort most urgent first (overdue -> soonest).
  items.sort((a, b) => a.hoursLeft - b.hoursLeft);

  // Billboard summary.
  const delivery = items.filter((i) => i.kind === "delivery");
  const esign = items.filter((i) => i.kind === "esign_chase");
  const summary = {
    delivery_total: delivery.length,
    delivery_due_soon: delivery.filter((i) => i.tone === "warn" || i.tone === "urgent").length,
    delivery_overdue: delivery.filter((i) => i.tone === "overdue").length,
    esign_total: esign.length,
    esign_due_soon: esign.filter((i) => i.tone === "warn" || i.tone === "urgent").length,
    esign_overdue: esign.filter((i) => i.tone === "overdue").length,
    thresholds,
  };

  return NextResponse.json({ items, summary });
}
