import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { nullifyEmpty } from "@/lib/coerce";
import { recordAudit } from "@/lib/audit";
export const runtime = "edge";
const FIELDS = ["marketing_source","referring_attorney","handling_attorney","intake_agent_id","qa_agent_id","case_manager_id","office_location","case_rating","call_outcome","case_summary","case_description","case_tags"];
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const user = await gateUser(sb);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isInternalRole(user.role) || !user.can("leads.edit")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const leadId = typeof b?.lead_id === "string" ? b.lead_id.trim() : "";
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const { data: lead, error: readError } = await sb.from("leads")
    .select("id,firm_id,campaign_id,case_type,archived_at").eq("id", leadId).maybeSingle();
  if (readError) return NextResponse.json({ error: "Could not verify this file." }, { status: 503 });
  if (!lead) return NextResponse.json({ error: "File not found." }, { status: 404 });
  if (lead.archived_at) return NextResponse.json({ error: "Restore this file before editing it." }, { status: 409 });
  if (user.role !== "owner") {
    if (!user.firmId || lead.firm_id !== user.firmId || !lead.campaign_id || lead.case_type !== "mva")
      return NextResponse.json({ error: "Only your firm's INNO MVA files are available." }, { status: 403 });
    const { data: campaign, error: campaignError } = await sb.from("campaigns")
      .select("id,firm_id,name,case_type,active").eq("id", lead.campaign_id).maybeSingle();
    if (campaignError) return NextResponse.json({ error: "Could not verify this file's campaign." }, { status: 503 });
    if (!campaign || campaign.firm_id !== lead.firm_id || campaign.name !== "INNO MVA" || campaign.case_type !== "mva" || campaign.active !== true)
      return NextResponse.json({ error: "Only active INNO MVA files are available." }, { status: 403 });
  }
  const patch: Record<string, any> = {};
  for (const k of FIELDS) if (k in b) patch[k] = b[k];
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No case details to save." }, { status: 400 });
  // Bind the mutation to the exact RLS-visible file and the scope just checked.
  let query = sb.from("leads").update(nullifyEmpty(patch)).eq("id", lead.id).eq("firm_id", lead.firm_id).is("archived_at", null);
  if (lead.campaign_id) query = query.eq("campaign_id", lead.campaign_id);
  const { data: saved, error } = await query.select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "This file changed. Refresh and try again." }, { status: 409 });
  await recordAudit({ firm_id: lead.firm_id, lead_id: lead.id, actor: user.id, actor_name: user.name ?? "User", category: "case", description: "Updated case details.", meta: { fields: Object.keys(patch) } });
  return NextResponse.json({ ok: true });
}

