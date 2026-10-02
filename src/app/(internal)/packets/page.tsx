export const runtime = "edge";

import { redirect } from "next/navigation";
import { authUser } from "@/lib/auth-user";
import { supabaseServer } from "@/lib/supabase-server";
import { mondayOf, packetWorklist, pacificDay } from "@/lib/packet-worklist";
import { confirmedFirmDeliveryAt, returnWindow } from "@/lib/firm-delivery-state";
import PacketWorklist from "@/components/PacketWorklist";

async function inChunks(sb: any, table: string, columns: string, column: string, ids: string[]) {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from(table).select(columns).in(column, ids.slice(i, i + 100));
    if (error) throw new Error(`Could not load ${table} for the packet worklist: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

export default async function PacketsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("role,active").eq("id", user.id).maybeSingle();
  if (!me || me.active !== true || me.role !== "owner") redirect("/dashboard");
  const { week } = await searchParams;
  const today = pacificDay(new Date().toISOString());
  const validWeek = !!week && /^\d{4}-\d{2}-\d{2}$/.test(week) && !Number.isNaN(Date.parse(`${week}T12:00:00Z`))
    && new Date(`${week}T12:00:00Z`).toISOString().slice(0, 10) === week;
  const monday = mondayOf(validWeek ? week! : today);

  // This worklist is DocuSeal MVA evidence only. A NETFLY original is a
  // separate signed upload and must never appear as an INNO payable deal.
  const { data: submissions, error } = await sb.from("esign_submissions")
    .select("id,lead_id,claim_id,call_id,sent_by,signer_name,signed_at,completed_at,created_at,status,voided_at,replacement_requested_at,agent_reviewed_at,completed_pdf_path,cert_pdf_path,pax_index")
    .is("pax_index", null).order("created_at", { ascending: false }).limit(3000);
  if (error) throw new Error(`Could not load signed packets: ${error.message}`);
  const leadIds = [...new Set((submissions || []).map((row) => row.lead_id))];
  const claimIds = [...new Set((submissions || []).map((row) => row.claim_id).filter(Boolean))] as string[];
  const callIds = [...new Set((submissions || []).map((row) => row.call_id).filter(Boolean))] as string[];
  const userIds = [...new Set((submissions || []).map((row) => row.sent_by).filter(Boolean))] as string[];
  const [leads, claims, calls, users, deliveries] = await Promise.all([
    inChunks(sb, "leads", "id,lead_no,claimant_name,campaign,case_type,firm_id,firm_sent_at,archived_at", "id", leadIds),
    inChunks(sb, "claims", "id,lead_id,campaign,campaign_id,claim_type,status,firm_id,firm_sent_at", "id", claimIds),
    inChunks(sb, "intake_calls", "id,agent_id,agent_name", "id", callIds),
    inChunks(sb, "app_users", "id,full_name", "id", userIds),
    inChunks(sb, "firm_deliveries", "id,lead_id,claim_id,ok,to_email,cc_email,created_at", "lead_id", leadIds),
  ]);
  const campaignIds = [...new Set(claims.map((claim) => claim.campaign_id).filter(Boolean))] as string[];
  const [campaigns, ownerResult] = await Promise.all([
    inChunks(sb, "campaigns", "id,firm_email", "id", campaignIds),
    sb.from("app_users").select("email").eq("role", "owner").eq("active", true),
  ]);
  if (ownerResult.error) throw new Error(`Could not verify packet recipients: ${ownerResult.error.message}`);
  const ownerEmail = (ownerResult.data || []).map((row: any) => String(row.email || "").toLowerCase()).find((value: string) => value === "bmc@innovativeintake.com") || null;
  const firmIds = [...new Set([...leads.map((lead) => lead.firm_id), ...claims.map((claim) => claim.firm_id)].filter(Boolean))] as string[];
  const firms = await inChunks(sb, "firms", "id,name", "id", firmIds);
  const rows = packetWorklist({ submissions: submissions || [], leads, claims, calls, users, firms, deliveries, campaigns, ownerEmail });
  const sourceResult = await sb.from("lead_activity").select("lead_id,meta,created_at")
    .eq("meta->>source", "lawruler").eq("meta->>event", "original_document").limit(1000);
  if (sourceResult.error) throw new Error(`Could not load imported signed originals: ${sourceResult.error.message}`);
  const importedClaimIds = [...new Set((sourceResult.data || []).map((item: any) => item.meta?.claim_id).filter(Boolean))] as string[];
  const importedClaims = await inChunks(sb, "claims", "id,lead_id,firm_id,campaign,campaign_id,status,claim_type", "id", importedClaimIds);
  const importedLeads = await inChunks(sb, "leads", "id,lead_no,claimant_name,archived_at", "id", [...new Set(importedClaims.map((claim: any) => claim.lead_id))]);
  const importedFirms = await inChunks(sb, "firms", "id,name", "id", [...new Set(importedClaims.map((claim: any) => claim.firm_id).filter(Boolean))]);
  const importedCampaigns = await inChunks(sb, "campaigns", "id,firm_email", "id", [...new Set(importedClaims.map((claim: any) => claim.campaign_id).filter(Boolean))]);
  const importedDeliveries = await inChunks(sb, "firm_deliveries", "claim_id,ok,to_email,cc_email,created_at", "claim_id", importedClaimIds);
  const importedNames = new Map(importedLeads.map((lead: any) => [lead.id, lead]));
  const importedFirmNames = new Map(importedFirms.map((firm: any) => [firm.id, firm.name]));
  const importedRecipients = new Map(importedCampaigns.map((campaign: any) => [campaign.id, campaign.firm_email]));
  const imported = importedClaims.filter((claim: any) => claim.claim_type === "mva" && claim.campaign === "INNO MVA" &&
    !rows.some((row) => row.claimId === claim.id)).map((claim: any) => {
    const originals = (sourceResult.data || []).filter((item: any) => item.meta?.claim_id === claim.id);
    const signedAt = originals.map((item: any) => item.meta?.source_signed_at).filter(Boolean).sort()[0] || null;
    const deliveredAt = confirmedFirmDeliveryAt(importedDeliveries.filter((delivery: any) => delivery.claim_id === claim.id), importedRecipients.get(claim.campaign_id), ownerEmail);
    const window = returnWindow(deliveredAt);
    return { leadId: claim.lead_id, claimId: claim.id, leadNo: importedNames.get(claim.lead_id)?.lead_no || claim.lead_id,
      name: importedNames.get(claim.lead_id)?.claimant_name || "Name missing", campaign: claim.campaign,
      firm: importedFirmNames.get(claim.firm_id) || "Firm not mapped",
      archived: !!importedNames.get(claim.lead_id)?.archived_at,
      signedAt, deliveredAt, returnEndsAt: window?.endsAt || null, daysLeft: window?.daysLeft ?? null,
      cleared: window?.cleared || false, status: claim.status };
  });
  return <PacketWorklist rows={rows} imported={imported} monday={monday} truncated={(submissions || []).length === 3000 || (sourceResult.data || []).length === 1000} />;
}
