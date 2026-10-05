export const runtime = "edge";
import { isSignedClient, signedSubmissionIdsForLeads } from "@/lib/signed-list";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { redirect } from "next/navigation";
import { isInternalRole } from "@/lib/permissions";
import { mayOpenFullFile } from "@/lib/file-fence";
import LeadsView from "@/components/LeadsView";
import { workArea, scopeWorkArea, areaHref } from '@/lib/work-area';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ view?: string; area?: string }> }) {
  const area = workArea((await searchParams).area);
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("role,firm_id,active,perm_overrides").eq("id", user.id).maybeSingle();
  if (!me || me.active !== true || !isInternalRole(me.role)) redirect("/dashboard");
  if (!mayOpenFullFile(me.role)) redirect("/queue");
  if (me.role === "owner" && area === "mva" && (await searchParams).view !== "all") redirect("/reports/inno");
  let pilotCampaignId: string | null = null;
  if (me.role !== "owner") {
    if (!me.firm_id) redirect("/dashboard");
    const [firm, campaigns] = await Promise.all([
      sb.from("firms").select("slug").eq("id", me.firm_id).maybeSingle(),
      sb.from("campaigns").select("id").eq("firm_id", me.firm_id).eq("name", "INNO MVA").eq("case_type", "mva").eq("active", true),
    ]);
    if (firm.error || campaigns.error || firm.data?.slug !== "tmp" || campaigns.data?.length !== 1) redirect("/dashboard");
    pilotCampaignId = campaigns.data[0].id;
  }
  // Core columns only: these always exist, so the list can never be zeroed out
  // by a column that a pending migration has not added yet.
  let leadQuery = sb
    .from("leads")
    .select("id, lead_no, firm_ref_no, claimant_name, assigned_agent, intake_agent_id, phone, email, address, mail_city, mail_state, stage, supervisor_flag, created_at, updated_at, case_type, firm_id")
    // Archived files are hidden everywhere by default. They are recoverable for
    // 90 days; only an owner can destroy one, and only after it is archived.
    .is("archived_at", null);
  leadQuery = scopeWorkArea(leadQuery, area);
  if (me.role !== "owner") leadQuery = leadQuery.eq("firm_id", me.firm_id).eq("campaign_id", pilotCampaignId).eq("case_type", "mva");
  const { data: leads } = await leadQuery.order("updated_at", { ascending: false }).limit(300);
  const ids = (leads ?? []).map((l) => l.id);

  // Clock timestamps for the in-line countdowns. Fetched separately and
  // defensively: Supabase returns an {error} object (it does not throw) when a
  // column is missing, so we check for it and fall back column-by-column. If the
  // SLA-clock migration (0045) has not run, countdowns simply do not show and
  // the list still renders every lead.
  const clockById: Record<string, any> = {};
  const full = await sb.from("leads").select("id, signed_at, firm_sent_at, esign_sent_at").in("id", ids);
  if (!full.error && full.data) {
    for (const r of full.data) clockById[r.id] = r;
  } else {
    // esign_sent_at missing (0045 not run). Try the columns that exist earlier.
    const partial = await sb.from("leads").select("id, signed_at, firm_sent_at").in("id", ids);
    if (!partial.error && partial.data) for (const r of partial.data) clockById[r.id] = r;
  }
  for (const l of leads ?? []) Object.assign(l, clockById[(l as any).id] ?? {});

  // Fetch claims separately so a join issue can't zero out the whole list.
  const claimsByLead: Record<string, any[]> = {};
  if (ids.length) {
    let claimQuery = sb.from("claims")
      .select("id, lead_id, campaign, claim_type, status, case_summary, stage, firm_send_result").in("lead_id", ids);
    if (me.role !== "owner") claimQuery = claimQuery.eq("firm_id", me.firm_id).eq("campaign_id", pilotCampaignId).eq("claim_type", "mva");
    const { data: claims } = await scopeWorkArea(claimQuery, area, 'claim_type');
    for (const c of claims ?? []) (claimsByLead[c.lead_id] ||= []).push(c);
  }
  const withClaims = (leads ?? []).map((l) => ({ ...l, claims: claimsByLead[l.id] ?? [] }));
  const signedSubmissionIds = await signedSubmissionIdsForLeads(sb, ids);

  // Who am I + the option lists for bulk actions.
  const canBulk = isInternalRole(me?.role);
  let agentsQuery = sb.from("app_users").select("id, full_name").in("role", ["agent", "admin", "owner", "manager"]);
  if (me.role !== "owner") agentsQuery = agentsQuery.eq("firm_id", me.firm_id);
  const { data: agents } = await agentsQuery.order("full_name");
  let firmsQuery = sb.from("firms").select("id, name");
  if (me.role !== "owner") firmsQuery = firmsQuery.eq("id", me.firm_id);
  const { data: firms } = await firmsQuery.order("name");

  // The whole status table, retired rows too: the signed rule needs a retired
  // custom signed status to keep its meaning. Badges, filters and bulk
  // actions still get only the live (active) set, exactly as before.
  const { data: catalog } = await sb.from("statuses").select("*").order("sort");
  const statuses = (catalog ?? []).filter((s: any) => s.active === true);
  const { data: dqReasons } = await sb.from("dq_reasons").select("*").eq("active", true).order("sort");
  // A status such as "delivered" can describe an unsigned Motel 6 handoff.
  // This list requires both a signed-track status and actual signature evidence.
  const signedOnly = (withClaims as any[]).filter(
    (l) => isSignedClient(l, catalog, signedSubmissionIds)
  );

  return <LeadsView leads={signedOnly} title="Signed" basePath="/leads" addPath={areaHref("/intake", area)} area={area} agents={agents ?? []} firms={firms ?? []} canBulk={canBulk} ownerWorklist={me.role === "owner"} statuses={statuses} dqReasons={dqReasons ?? []} />;
}

