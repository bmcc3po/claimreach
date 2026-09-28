import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { deliverLeadToFirm, matterSendState } from "@/lib/firm-delivery";
import { resolveMatter, matterRowsFilter } from "@/lib/matter";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
export const runtime = "edge";

const uuid = (x: any) => String(x || "").replace(/[^0-9a-f-]/gi, "");

// GET /api/firm-delivery?lead_id=...&claim_id=...
//   -> ONE matter's delivery state and history. Without claim_id, the file's
//      single matter (or the single matter on its campaign); several matters
//      and none named is a 409, never a guess (Astra round 7b #57).
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isInternalRole(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const leadId = uuid(sp.get("lead_id"));
  const claimId = uuid(sp.get("claim_id")) || null;
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: lead, error: leadErr } = await admin.from("leads").select("id, campaign_id, firm_sent_at, firm_send_result").eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ error: `Could not read the file: ${leadErr.message}` }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const m = await resolveMatter(admin, leadId, { claimId, campaignId: lead.campaign_id ?? null });
  if (!m.ok) return NextResponse.json({ error: m.error, ambiguous: !!m.ambiguous, candidates: m.candidates }, { status: m.status });
  const matter = { claim: m.claim, sole: m.sole };
  const st = await matterSendState(admin, lead, matter);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: 500 });
  const { data: history, error: hErr } = await admin.from("firm_deliveries").select("*")
    .eq("lead_id", leadId).or(matterRowsFilter(matter)).order("created_at", { ascending: false });
  if (hErr) return NextResponse.json({ error: `Could not read the delivery history: ${hErr.message}` }, { status: 500 });
  return NextResponse.json({
    claim_id: m.claim.id,
    firm_sent_at: st.state.sentAt,
    firm_send_result: st.state.result,
    legacy: st.state.legacy,
    history: history ?? [],
  });
}

// POST /api/firm-delivery  { lead_id, claim_id?, force? }  -> manual send / resend
// of ONE matter: the claim the screen is showing.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Sending a file to the firm is an internal, status-moving action. A firm
  // login could otherwise trigger delivery of any lead id it guessed (Astra
  // audit, Sep 27): internal roles only, plus the claims.status permission.
  if (!isInternalRole(g.role) || !g.can("claims.status")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const leadId = uuid(b?.lead_id);
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const { data: leadRow, error: leadErr } = await supabaseAdmin().from("leads").select("id").eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ error: `Could not read the file: ${leadErr.message}` }, { status: 500 });
  if (!leadRow) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const res = await deliverLeadToFirm({
    leadId,
    claimId: uuid(b?.claim_id) || null,
    triggeredBy: "manual",
    actorName: g.name || "User",
    force: !!b?.force,
  });
  if (!res.ok && !res.skipped) return NextResponse.json(res, { status: res.ambiguous ? 409 : 400 });
  return NextResponse.json(res);
}
