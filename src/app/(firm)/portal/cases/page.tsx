export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { STAGE_LABELS } from "@/lib/questionnaire";
import FirmCasesTable from "@/components/FirmCasesTable";

export default async function FirmCases() {
  const sb = await supabaseServer();
  const { data: leads } = await sb.from("leads")
    .select("id, lead_no, firm_ref_no, claimant_name, stage, updated_at, case_type")
    .order("updated_at", { ascending: false }).limit(500);
  const ids = (leads ?? []).map((l) => l.id);
  const byLead: Record<string, any[]> = {};
  if (ids.length) {
    const { data: claims } = await sb.from("claims").select("lead_id, status, tier, campaign, claim_type").in("lead_id", ids);
    for (const c of claims ?? []) (byLead[c.lead_id] ||= []).push(c);
  }
  const rows = (leads ?? []).map((l) => ({ ...l, claims: byLead[l.id] ?? [] }));
  return <FirmCasesTable rows={rows} />;
}
