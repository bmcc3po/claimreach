import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// TEMP diagnostic: /api/debug/qa?lead_no=TMP-00008
// Shows the real claim statuses + lead flags so we can see why a file is or
// isn't in the QA queue. Owner/admin only.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = supabaseAdmin();
  const leadNo = new URL(req.url).searchParams.get("lead_no");

  const out: any = {};
  if (leadNo) {
    const { data: lead } = await admin.from("leads").select("id, lead_no, claimant_name, stage, qa_pending, wip_pending, signed_at, qa_entered_at").eq("lead_no", leadNo).maybeSingle();
    out.lead = lead;
    if (lead) {
      const { data: claims } = await admin.from("claims").select("id, claim_type, status, grievous_verdict, updated_at").eq("lead_id", lead.id);
      out.claims = claims;
    }
  }

  // What the QA queue query actually returns right now.
  const QA_STATUSES = ["grievous", "qa", "signed_grievous", "signed_qa"];
  const { data: byStatus } = await admin.from("claims").select("lead_id, status").in("status", QA_STATUSES).limit(50);
  out.qa_by_status_count = byStatus?.length ?? 0;
  out.qa_by_status = byStatus;
  const { data: byFlag } = await admin.from("leads").select("id, lead_no, qa_pending").eq("qa_pending", true).limit(50);
  out.qa_by_flag_count = byFlag?.length ?? 0;
  out.qa_by_flag = byFlag;

  // Distinct statuses present across all claims (so we see the real vocabulary).
  const { data: allClaims } = await admin.from("claims").select("status").limit(1000);
  const counts: Record<string, number> = {};
  for (const c of allClaims ?? []) counts[c.status || "null"] = (counts[c.status || "null"] || 0) + 1;
  out.status_distribution = counts;

  return NextResponse.json(out);
}
