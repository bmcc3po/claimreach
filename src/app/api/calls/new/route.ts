import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { normPhone } from "@/lib/comms";
import { NETFLY_CAMPAIGN } from "@/lib/netfly-ontake";

export const runtime = "edge";

// POST /api/calls/new  { campaign_id, phone?, name? }
// A caller who is not in the system yet. If an open file on this campaign
// already has the number, that file opens instead of a duplicate.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.can("intake.fill")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const campaignId = String(b?.campaign_id || "");
  const phone = String(b?.phone || "").trim();
  const name = String(b?.name || "").trim().slice(0, 120);
  if (!campaignId) return NextResponse.json({ error: "Pick the line this call came in on." }, { status: 400 });

  const { data: camp } = await sb.from("campaigns").select("id, name, firm_id, case_type, active").eq("id", campaignId).maybeSingle();
  if (!camp || !camp.active) return NextResponse.json({ error: "That campaign is not active." }, { status: 404 });
  if (camp.name === NETFLY_CAMPAIGN) return NextResponse.json({ error: "NETFLY starts from an already signed transfer. Choose NETFLY ONTAKE in New call." }, { status: 400 });

  const norm = normPhone(phone);
  if (norm.length === 10) {
    const { data: dup } = await sb.from("leads").select("id")
      .eq("campaign_id", camp.id).eq("phone_norm", norm).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (dup) return NextResponse.json({ ok: true, lead_id: dup.id, existing: true });
  }

  const parts = name.split(/\s+/).filter(Boolean);
  const { data: leadNo } = await sb.rpc("mint_lead_no", { p_firm: camp.firm_id });
  const insert: Record<string, any> = {
    firm_id: camp.firm_id,
    campaign_id: camp.id,
    campaign: camp.name,
    case_type: camp.case_type,
    phone: phone || null,
    claimant_name: name || null,
    first_name: parts[0] || null,
    last_name: parts.slice(1).join(" ") || null,
    created_by: me.id,
    assigned_agent: me.id,
    intake_agent_id: me.id,
    origin: "call",
  };
  if (leadNo) insert.lead_no = leadNo;
  const { data: lead, error } = await sb.from("leads").insert(insert).select("id, lead_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: cErr } = await sb.from("claims").insert({
    firm_id: camp.firm_id, lead_id: lead.id, claim_type: camp.case_type, campaign: camp.name,
    campaign_id: camp.id, status: "new", is_this_file: true, created_by: me.id,
  });
  if (cErr) return NextResponse.json({ error: `The file was made (${lead.lead_no}) but its claim was not: ${cErr.message}`, lead_id: lead.id }, { status: 500 });

  if (phone) {
    try { const { reconcileUnmatched } = await import("@/lib/comms"); await reconcileUnmatched(lead.id, phone, camp.firm_id); } catch (e) { console.error("reconcile failed", e); }
  }
  try {
    const { fireEvent } = await import("@/lib/webhook-deliver");
    await fireEvent(camp.firm_id, "lead.created", { lead_id: lead.id, lead_no: lead.lead_no, ...insert, source: "call" }, { campaignId: camp.id });
  } catch (e) { console.error("lead.created webhook failed", e); }

  return NextResponse.json({ ok: true, lead_id: lead.id, lead_no: lead.lead_no });
}
