export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import LeadsView from "@/components/LeadsView";
import ReadError from "@/components/ReadError";

export default async function FirmCases() {
  const sb = await supabaseServer();
  const { data: leads, error: leadsError } = await sb.from("leads")
    .select("id, lead_no, firm_ref_no, claimant_name, stage, updated_at, case_type")
    .is("archived_at", null).order("updated_at", { ascending: false }).limit(500);
  if (leadsError) return <ReadError title="Cases" message="Your cases could not load. Try again to see the current list." href="/portal/cases" />;
  const ids = (leads ?? []).map((l) => l.id);
  const byLead: Record<string, any[]> = {};
  if (ids.length) {
    const { data: claims, error } = await sb.from("claims").select("lead_id, status, tier, tier_letter, tier_number, campaign, claim_type, case_summary").in("lead_id", ids);
    if (error) return <ReadError title="Cases" message="Case statuses could not load. Try again before relying on this list." href="/portal/cases" />;
    for (const c of claims ?? []) (byLead[c.lead_id] ||= []).push(c);
  }
  const rows = (leads ?? []).map((l) => ({ ...l, claims: byLead[l.id] ?? [] }));
  return <>{rows.length === 500 && <p role="status" className="muted">Showing the 500 most recently updated cases.</p>}<LeadsView leads={rows} basePath="/portal/cases" title="Cases" variant="firm" /></>;
}
