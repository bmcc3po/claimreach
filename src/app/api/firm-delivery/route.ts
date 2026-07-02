import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { deliverLeadToFirm } from "@/lib/firm-delivery";
export const runtime = "edge";

async function gate(sb: any) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return { error: "unauthorized", status: 401 as const };
  const { data: me } = await sb.from("app_users").select("role, full_name").eq("id", auth.user.id).maybeSingle();
  return { user: auth.user, role: me?.role, name: me?.full_name };
}

// GET /api/firm-delivery?lead_id=...  -> delivery history for a lead.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
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
  const g = await gate(sb);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!["owner", "admin", "qa"].includes(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
