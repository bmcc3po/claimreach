import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { normPhone } from "@/lib/comms";

export const runtime = "edge";

// GET /api/calls/search?q=
// Find any file, open or done: by name, phone or lead number.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });

  // This search opens results in the acquisition call console. NETFLY
  // secondary files belong to their own workflow and must never resolve here.
  const { data: secondary, error: campaignError } = await sb.from("campaigns")
    .select("id").eq("name", "NETFLY ONTAKE").eq("case_type", "mva");
  if (campaignError) return NextResponse.json({ error: "Could not verify the call-search scope." }, { status: 503 });
  const secondaryIds = (secondary ?? []).map((c: any) => String(c.id));

  const digits = normPhone(q);
  let query = sb.from("leads")
    .select("id, lead_no, claimant_name, phone, campaign_id, campaign, updated_at, archived_at")
    .order("updated_at", { ascending: false }).limit(30);
  if (secondaryIds.length) query = query.or(`campaign_id.is.null,campaign_id.not.in.(${secondaryIds.join(",")})`);
  if (digits.length === 10) query = query.eq("phone_norm", digits);
  else if (/^[a-z]{0,6}-?\d{2,}$/i.test(q)) query = query.ilike("lead_no", `%${q}%`);
  else {
    const safe = q.replace(/[%_,()]/g, " ").trim();
    query = query.ilike("claimant_name", `%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visible = (data ?? []).filter((l: any) => l.campaign !== "NETFLY ONTAKE" && !secondaryIds.includes(l.campaign_id));
  const ids = visible.map((l: any) => l.id);
  const statusBy: Record<string, string> = {};
  if (ids.length) {
    const { data: claims } = await sb.from("claims").select("lead_id, status, created_at").in("lead_id", ids).order("created_at", { ascending: true });
    for (const c of claims ?? []) if (!statusBy[c.lead_id]) statusBy[c.lead_id] = c.status;
  }
  return NextResponse.json({
    results: visible.map((l: any) => ({ ...l, status: statusBy[l.id] || null })),
  });
}
