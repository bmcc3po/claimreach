import { scopeWorkArea, workArea } from '@/lib/work-area';
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { normPhone } from "@/lib/comms";
import { netflyContext } from "@/lib/netfly-server";
import { NETFLY_CAMPAIGN } from "@/lib/netfly-ontake";
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

  // Keep the RLS-backed acquisition search separate. NETFLY results below
  // use their existing access gate and open the signed-transfer workflow.
  const { data: secondary, error: campaignError } = await sb.from("campaigns")
    .select("id").eq("name", NETFLY_CAMPAIGN).eq("case_type", "mva");
  if (campaignError) return NextResponse.json({ error: "Could not verify the call-search scope." }, { status: 503 });
  const secondaryIds = (secondary ?? []).map((c: any) => String(c.id));

  const digits = normPhone(q);
  const match = (query: any) => digits.length === 10 ? query.eq("phone_norm", digits)
    : /^[a-z]{0,6}-?\d{2,}$/i.test(q) ? query.ilike("lead_no", `%${q}%`)
    : query.ilike("claimant_name", `%${q.replace(/[%_,()]/g, " ").trim()}%`);
  let query = sb.from("leads")
    .select("id, lead_no, claimant_name, phone, campaign_id, campaign, created_at, updated_at, archived_at, external_id")
    .is("archived_at", null).order("updated_at", { ascending: false }).limit(30);
  if (secondaryIds.length) query = query.or(`campaign_id.is.null,campaign_id.not.in.(${secondaryIds.join(",")})`);
  query = match(query);
  const { data, error } = await scopeWorkArea(query, workArea(req.nextUrl.searchParams.get("area")));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visible = (data ?? []).filter((l: any) => l.campaign !== NETFLY_CAMPAIGN && !secondaryIds.includes(l.campaign_id));
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
  const results = visible.map(({ external_id, ...l }: any) => ({ ...l, href: `/app/${encodeURIComponent(l.id)}`, status: statusBy[l.id] || null, status_label: labelsBy[l.id] || null, call_count: callsBy[l.id]?.count ?? null, last_call_at: callsBy[l.id]?.last ?? null }));
  if (workArea(req.nextUrl.searchParams.get("area")) === "mva") {
    try {
      const ctx = await netflyContext();
      if (ctx?.actor.can("leads.view")) {
        const found = await match(ctx.db.from("leads")
          .select("id, lead_no, claimant_name, phone, campaign_id, campaign, created_at, updated_at")
          .eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).eq("case_type", "mva")
          .is("archived_at", null).order("updated_at", { ascending: false }).limit(30));
        if (found.error) throw new Error("NETFLY search failed");
        if (found.data?.length) {
          const matters = await ctx.db.from("claims").select("id, lead_id, claim_type, status")
            .eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).in("lead_id", found.data.map((lead: any) => lead.id));
          if (matters.error) throw new Error("NETFLY matters could not be checked");
          for (const lead of found.data) {
            const claims = (matters.data || []).filter((claim: any) => claim.lead_id === lead.id);
            // Match netflyMatter's single-MVA-matter invariant before linking.
            if (claims.length !== 1 || claims[0].claim_type !== "mva") continue;
            results.push({ ...lead, campaign: NETFLY_CAMPAIGN, href: `/app/netfly/${encodeURIComponent(lead.id)}`,
              status: claims[0].status, status_label: null, call_count: null, last_call_at: null });
          }
        }
      }
    } catch {
      return NextResponse.json({ error: "Could not check NETFLY search results. Retry before creating another file." }, { status: 503 });
    }
  }
  results.sort((a: any, b: any) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return NextResponse.json({ results: results.slice(0, 30) });
}
