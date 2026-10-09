// ============================================================================
// Alerts engine. Derives "dragging" files at read time from leads/claims plus
// the configurable SLA thresholds. No stored alert rows, so nothing goes stale.
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";
import { needsQaReview } from "./statuses";

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

// Which of these leads have at least one outbound text or call. Batches of 25
// run side by side; each lookup is one indexed probe per lead, capped at one
// row per lead so a chatty file cannot blow the row limit.
export async function leadsWithOutbound(admin: any, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const probe = async (id: string) => {
    const { data } = await admin.from("communications").select("lead_id").eq("lead_id", id).eq("direction", "outbound").limit(1);
    if (data?.length) out.add(id);
  };
  for (let i = 0; i < ids.length; i += 25) {
    await Promise.all(ids.slice(i, i + 25).map(probe));
  }
  return out;
}

// Alerts are the same for every staff login, and the bell asks every minute
// from every open tab. Hold the answer for 30 seconds per server instance.
let cached: { at: number; p: Promise<Alert[]> } | null = null;
export function invalidateAlertCache() { cached = null; }
export function computeAlerts(db?: any): Promise<Alert[]> {
  // Caller-scoped dashboards never share another user's cached rows.
  if (db) return computeAlertsFresh(db);
  if (cached && Date.now() - cached.at < 30000) return cached.p;
  const p = computeAlertsFresh().catch((e) => { cached = null; throw e; });
  cached = { at: Date.now(), p };
  return p;
}

async function computeAlertsFresh(db?: any): Promise<Alert[]> {
  const admin = db ?? supabaseAdmin();
  const sla = await loadSla();
  const alerts: Alert[] = [];

  // 1) New leads with no outbound contact within the window.
  // This used to ask the database once PER LEAD whether it had an outbound
  // text or call: up to 200 round trips in a row, 15 to 30 seconds, on every
  // dashboard load and every bell poll. That was the whole site feeling slow.
  // Now it is one query for the candidates and a few batched lookups in parallel.
  const noContactCut = new Date(Date.now() - sla.no_contact_hours * 3600000).toISOString();
  const { data: newLeads } = await admin.from("leads")
    .select("id, lead_no, claimant_name, created_at, claims(status)")
    .lt("created_at", noContactCut).is("archived_at", null)
    .order("created_at", { ascending: false }).limit(200);
  const open = (newLeads ?? []).filter((l: any) => {
    const status = l.claims?.[0]?.status ?? "new";
    return status === "new" || status === "contacting";
  });
  const contacted = await leadsWithOutbound(admin, open.map((l: any) => l.id));
  for (const l of open) {
    if (contacted.has(l.id)) continue;
    const h = hoursSince(l.created_at);
    alerts.push({ kind: "no_contact", severity: h > sla.no_contact_hours * 2 ? "bad" : "warn",
      title: `No contact — ${l.claimant_name || l.lead_no}`, sub: `New lead, no outreach in ${h}h.`, lead_id: l.id, lead_no: l.lead_no, hours: h });
  }

  // 2) Files stuck in the QA queue.
  const qaCut = new Date(Date.now() - sla.qa_stuck_hours * 3600000).toISOString();
  const { data: statusCatalog, error: statusError } = await admin.from('statuses').select('*');
  if (statusError) throw new Error('Could not verify current file statuses for alerts.');
  const { data: qaStuck } = await admin.from("leads")
    .select("id, lead_no, claimant_name, qa_entered_at, claims(status)")
    .is("archived_at", null).eq("qa_pending", true).lt("qa_entered_at", qaCut).limit(200);
  for (const l of qaStuck ?? []) {
    // Lead queue flags are a projection and can lag a saved terminal decision.
    // Keep genuine sibling QA work, but never resurrect a declined-only file.
    if (!(l.claims ?? []).some((c: any) => needsQaReview(c.status, statusCatalog ?? []))) continue;
    const h = hoursSince(l.qa_entered_at);
    alerts.push({ kind: "qa_stuck", severity: "bad", title: `Stuck in QA — ${l.claimant_name || l.lead_no}`,
      sub: `In the QA queue ${h}h (SLA ${sla.qa_stuck_hours}h).`, lead_id: l.id, lead_no: l.lead_no, hours: h });
  }

  // 3) Signed but not yet QA-reviewed.
  const signedCut = new Date(Date.now() - sla.signed_unreviewed_hours * 3600000).toISOString();
  const { data: signedUnrev } = await admin.from("leads")
    .select("id, lead_no, claimant_name, signed_at, claims(status)")
    .is("archived_at", null).lt("signed_at", signedCut).not("signed_at", "is", null).limit(200);
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
