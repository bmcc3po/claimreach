import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { normPhone } from "@/lib/comms";
import { searchStatusLabel } from "@/lib/mva-call/search-status";

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
    .select("id, lead_no, claimant_name, phone, campaign_id, campaign, updated_at, archived_at, external_id")
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
  const labelsBy: Record<string, string | null> = {};
  const callsBy: Record<string, { count: number; last: string | null }> = {};
  if (ids.length) {
    const [{ data: claims }, { data: callStats }, { data: submissions }] = await Promise.all([
      sb.from("claims").select("id, firm_id, lead_id, status, firm_send_result, created_at").in("lead_id", ids).order("created_at", { ascending: true }),
      sb.from("cr_mva_dial_summary").select("lead_id, total_dials, last_call_at").in("lead_id", ids),
      sb.from("esign_submissions").select("lead_id, claim_id, firm_id, status, signed_at, pax_index, voided_at, replacement_requested_at, created_at").in("lead_id", ids),
    ]);
    for (const c of claims ?? []) if (!statusBy[c.lead_id]) {
      statusBy[c.lead_id] = c.status;
      if (c.status === "delivered") labelsBy[c.lead_id] = searchStatusLabel(visible.find((l: any) => l.id === c.lead_id), c, submissions ?? []);
    }
    for (const c of callStats ?? []) callsBy[c.lead_id] = { count: c.total_dials, last: c.last_call_at };
  }
  return NextResponse.json({
    results: visible.map(({ external_id, ...l }: any) => ({ ...l, status: statusBy[l.id] || null, status_label: labelsBy[l.id] || null, call_count: callsBy[l.id]?.count ?? null, last_call_at: callsBy[l.id]?.last ?? null })),
  });
}
