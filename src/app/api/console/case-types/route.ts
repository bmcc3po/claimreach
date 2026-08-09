import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// ============================================================================
// WHAT THIS FIRM'S CONSOLE OFFERS
//
// A firm sees a case type if, and only if, that firm has an active campaign for
// it. There is no separate list to keep in sync, because the assignment IS the
// list. Assigning a case type to a firm makes it appear; unassigning removes it.
//
// This replaces FIVE places that each claimed to answer the same question:
//
//   1. CASE_TYPES, hardcoded in src/lib/intake-console/questions.ts
//   2. cfg.caseTypes, hardcoded per firm in src/lib/intake-console/config.ts
//   3. case_type_registry, read unfiltered
//   4. /api/claim-types, registry plus every published form, no firm scope
//   5. campaigns, the only one connected to real work
//
// Every one of those was in code or unscoped except the last, which is why
// Motel 6 appeared in TMT's picker (TMT's config literally listed it, and TMT
// has no motel campaign) and why TMP's medmal campaign was unreachable (medmal
// was in nobody's hardcoded list).
//
// Returns the campaign id alongside, so opening a file passes a real campaign
// rather than re-deriving one from a string and hoping the two agree.
// ============================================================================

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = (new URL(req.url).searchParams.get("firm") || "").toLowerCase();
  if (!slug) return NextResponse.json({ types: [] });

  const { data: firm } = await sb.from("firms").select("id, name, slug, venue_states").eq("slug", slug).maybeSingle();
  if (!firm) return NextResponse.json({ types: [], error: "unknown firm" });

  const { data: campaigns } = await sb.from("campaigns")
    .select("id, name, case_type, allow_live_sign")
    .eq("firm_id", firm.id).eq("active", true);

  const venue = { venue_states: firm.venue_states ?? null };
  if (!campaigns?.length) return NextResponse.json({ ...venue, types: [] });

  // Labels and ordering come from the registry, which is the single vocabulary.
  // A campaign pointing at an inactive or missing registry row is a setup error,
  // so it is surfaced with a plain fallback label rather than hidden.
  const { data: reg } = await sb.from("case_type_registry").select("key, label, family, sort, active");
  const byKey = new Map((reg ?? []).map((r) => [r.key, r]));

  const types = campaigns
    .map((c) => {
      const r = byKey.get(c.case_type);
      return {
        key: c.case_type,
        campaign_id: c.id,
        label: r?.label ?? c.case_type,
        family: r?.family ?? null,
        sort: r?.sort ?? 999,
        allow_live_sign: c.allow_live_sign ?? false,
        // Flagged rather than dropped: a campaign whose type is not an active
        // registry row still needs to be findable by whoever set it up.
        unregistered: !r || r.active === false,
      };
    })
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));

  return NextResponse.json({ firm: { id: firm.id, slug: firm.slug, name: firm.name }, ...venue, types });
}
