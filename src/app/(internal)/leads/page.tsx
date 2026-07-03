export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import LeadsView from "@/components/LeadsView";

export default async function LeadsPage() {
  const sb = await supabaseServer();
  // Core columns only: these always exist, so the list can never be zeroed out
  // by a column that a pending migration has not added yet.
  const { data: leads } = await sb
    .from("leads")
    .select("id, lead_no, firm_ref_no, claimant_name, phone, email, address, stage, supervisor_flag, created_at, updated_at, case_type")
    .order("updated_at", { ascending: false })
    .limit(300);

  // Clock timestamps for the in-line countdowns. Fetched separately and
  // defensively: Supabase returns an {error} object (it does not throw) when a
  // column is missing, so we check for it and fall back column-by-column. If the
  // SLA-clock migration (0045) has not run, countdowns simply do not show and
  // the list still renders every lead.
  const clockById: Record<string, any> = {};
  const full = await sb.from("leads").select("id, signed_at, firm_sent_at, esign_sent_at").limit(300);
  if (!full.error && full.data) {
    for (const r of full.data) clockById[r.id] = r;
  } else {
    // esign_sent_at missing (0045 not run). Try the columns that exist earlier.
    const partial = await sb.from("leads").select("id, signed_at, firm_sent_at").limit(300);
    if (!partial.error && partial.data) for (const r of partial.data) clockById[r.id] = r;
  }
  for (const l of leads ?? []) Object.assign(l, clockById[(l as any).id] ?? {});

  // Fetch claims separately so a join issue can't zero out the whole list.
  const ids = (leads ?? []).map((l) => l.id);
  const claimsByLead: Record<string, any[]> = {};
  if (ids.length) {
    const { data: claims } = await sb.from("claims")
      .select("id, lead_id, campaign, claim_type, status, case_summary, stage").in("lead_id", ids);
    for (const c of claims ?? []) (claimsByLead[c.lead_id] ||= []).push(c);
  }
  const withClaims = (leads ?? []).map((l) => ({ ...l, claims: claimsByLead[l.id] ?? [] }));

  // Who am I + the option lists for bulk actions.
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role, perm_overrides").eq("id", user!.id).maybeSingle();
  const canBulk = !!me && ["owner", "admin", "agent", "qa"].includes(me.role);
  const { data: agents } = await sb.from("app_users").select("id, full_name").in("role", ["agent", "admin", "owner"]).order("full_name");
  const { data: firms } = await sb.from("firms").select("id, name").order("name");

  // Live, owner-editable status set drives badges, filters, and bulk actions.
  const { data: statuses } = await sb.from("statuses").select("*").eq("active", true).order("sort");
  const { data: dqReasons } = await sb.from("dq_reasons").select("*").eq("active", true).order("sort");

  return <LeadsView leads={withClaims} basePath="/leads" addPath="/intake" agents={agents ?? []} firms={firms ?? []} canBulk={canBulk} statuses={statuses ?? []} dqReasons={dqReasons ?? []} />;
}
