import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { deliverLeadToFirm } from "@/lib/firm-delivery";
import { gateUser } from "@/lib/gate";
export const runtime = "edge";

// GET /api/firm-delivery?lead_id=...  -> delivery history for a lead.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (g.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const leadId = new URL(req.url).searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: lead } = await admin.from("leads").select("firm_sent_at, firm_send_result").eq("id", leadId).maybeSingle();
  const { data: history } = await admin.from("firm_deliveries").select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
  return NextResponse.json({ firm_sent_at: lead?.firm_sent_at ?? null, firm_send_result: lead?.firm_send_result ?? null, history: history ?? [] });
}

// POST /api/firm-delivery  { lead_id, force? }  -> manual send / resend.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Sending a file to the firm is a status-moving action; gate on claims.status.
  if (!g.can("claims.status")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const res = await deliverLeadToFirm({
    leadId: b.lead_id,
    triggeredBy: "manual",
    actorName: g.name || "User",
    force: !!b.force,
  });
  if (!res.ok && !res.skipped) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
