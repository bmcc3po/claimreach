import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// ============================================================================
// WHICH FIRMS AN AGENT CAN TAKE CALLS FOR
//
// The console rendered Object.values(FIRM_CONFIGS), a code map holding tmt, tmp
// and roth. West Loop Law existed in the database with a login and could not be
// selected, because the picker never asked the database. Onboarding a client
// meant editing a source file and deploying, which is the same shape as the
// case type problem one layer up.
//
// A firm is selectable when it is an active client. Internal firms (us) are
// excluded: Innovative Intake owns staff logins and form templates, so it has
// to exist as a row, but it is not something an agent takes calls for.
//
// A firm with no active campaigns is still returned, flagged. Hiding it makes a
// half-finished setup look like a missing firm, which sends whoever is
// troubleshooting to the wrong place.
// ============================================================================

export async function GET(_req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: firms, error } = await sb.from("firms")
    .select("id, slug, name, kind, active, venue_states")
    .eq("kind", "client").eq("active", true).order("slug");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!firms?.length) return NextResponse.json({ firms: [] });

  const { data: camps } = await sb.from("campaigns")
    .select("firm_id").eq("active", true)
    .in("firm_id", firms.map((f) => f.id));

  const counts = new Map<string, number>();
  for (const c of camps ?? []) counts.set(c.firm_id, (counts.get(c.firm_id) ?? 0) + 1);

  return NextResponse.json({
    firms: firms.map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      venue_states: f.venue_states ?? null,
      campaign_count: counts.get(f.id) ?? 0,
    })),
  });
}
