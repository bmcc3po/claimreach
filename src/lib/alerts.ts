// ============================================================================
// Alerts engine. Derives "dragging" files at read time from leads/claims plus
// the configurable SLA thresholds. No stored alert rows, so nothing goes stale.
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";

export interface Alert {
  kind: "no_contact" | "qa_stuck" | "signed_unreviewed" | "stage_stale";
  severity: "warn" | "bad";
  title: string;
  sub: string;
  lead_id: string;
  lead_no?: string;
  hours: number;
}

interface Sla {
  no_contact_hours: number;
  qa_stuck_hours: number;
  signed_unreviewed_hours: number;
  stage_stale_hours: number;
}

const DEFAULT_SLA: Sla = { no_contact_hours: 24, qa_stuck_hours: 48, signed_unreviewed_hours: 24, stage_stale_hours: 72 };

function hoursSince(ts?: string | null): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 3600000);
}

export async function loadSla(): Promise<Sla> {
  const { data } = await supabaseAdmin().from("sla_settings").select("*").eq("id", 1).maybeSingle();
  return data ? { ...DEFAULT_SLA, ...data } : DEFAULT_SLA;
}

export async function computeAlerts(): Promise<Alert[]> {
  const admin = supabaseAdmin();
  const sla = await loadSla();
  const alerts: Alert[] = [];

  // 1) New leads with no outbound contact within the window.
  const noContactCut = new Date(Date.now() - sla.no_contact_hours * 3600000).toISOString();
  const { data: newLeads } = await admin.from("leads")
    .select("id, lead_no, claimant_name, created_at, claims(status)")
    .lt("created_at", noContactCut).limit(200);
  for (const l of newLeads ?? []) {
    const status = (l as any).claims?.[0]?.status ?? "new";
    if (status !== "new" && status !== "contacting") continue;
    // any outbound comm clears it
    const { data: comm } = await admin.from("communications").select("id").eq("lead_id", l.id).eq("direction", "outbound").limit(1).maybeSingle();
    if (comm) continue;
    const h = hoursSince(l.created_at);
    alerts.push({ kind: "no_contact", severity: h > sla.no_contact_hours * 2 ? "bad" : "warn",
      title: `No contact — ${l.claimant_name || l.lead_no}`, sub: `New lead, no outreach in ${h}h.`, lead_id: l.id, lead_no: l.lead_no, hours: h });
  }

  // 2) Files stuck in the QA queue.
  const qaCut = new Date(Date.now() - sla.qa_stuck_hours * 3600000).toISOString();
  const { data: qaStuck } = await admin.from("leads")
    .select("id, lead_no, claimant_name, qa_entered_at")
    .eq("qa_pending", true).lt("qa_entered_at", qaCut).limit(200);
  for (const l of qaStuck ?? []) {
    const h = hoursSince(l.qa_entered_at);
    alerts.push({ kind: "qa_stuck", severity: "bad", title: `Stuck in QA — ${l.claimant_name || l.lead_no}`,
      sub: `In the QA queue ${h}h (SLA ${sla.qa_stuck_hours}h).`, lead_id: l.id, lead_no: l.lead_no, hours: h });
  }

  // 3) Signed but not yet QA-reviewed.
  const signedCut = new Date(Date.now() - sla.signed_unreviewed_hours * 3600000).toISOString();
  const { data: signedUnrev } = await admin.from("leads")
    .select("id, lead_no, claimant_name, signed_at, claims(status)")
    .lt("signed_at", signedCut).not("signed_at", "is", null).limit(200);
  for (const l of signedUnrev ?? []) {
    const status = (l as any).claims?.[0]?.status ?? "";
    // still in a signed in-QA state means it hasn't cleared review
    if (!/^signed_(grievous|qa)$/.test(status)) continue;
    const h = hoursSince(l.signed_at);
    alerts.push({ kind: "signed_unreviewed", severity: "bad", title: `Signed, unreviewed — ${l.claimant_name || l.lead_no}`,
      sub: `Signed ${h}h ago, not through QA (SLA ${sla.signed_unreviewed_hours}h).`, lead_id: l.id, lead_no: l.lead_no, hours: h });
  }

  // Newest/most severe first.
  alerts.sort((a, b) => (a.severity === b.severity ? b.hours - a.hours : a.severity === "bad" ? -1 : 1));
  return alerts;
}
