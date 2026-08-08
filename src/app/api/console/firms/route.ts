import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// ============================================================================
// WHICH FIRMS AN AGENT CAN TAKE CALLS FOR
//
// Reads the database rather than a code map. The console previously rendered
// Object.values(FIRM_CONFIGS), so a firm could exist with a login and still be
// unselectable, and onboarding a client meant editing a source file.
//
// DEFENSIVE ON PURPOSE. The first version filtered in the query on `kind` and
// `active`. If a migration adding those columns has not been run, PostgREST
// fails the whole query and the console reports "no firms" while the firm is
// plainly visible in settings, which sends whoever is troubleshooting looking
// for a missing firm instead of a missing column.
//
// So: select *, filter in code, treat an absent column as permissive. A missing
// `kind` means everything is a client, which is what was true before the column
// existed. `diagnostics` in the response says what actually happened, so the
// next person does not have to guess.
// ============================================================================

export async function GET(_req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized", firms: [] }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: rows, error } = await admin.from("firms").select("*").order("slug");
  if (error) {
    return NextResponse.json({
      error: error.message,
      firms: [],
      diagnostics: { stage: "select firms", hint: "the firms table itself could not be read" },
    }, { status: 500 });
  }
  if (!rows?.length) {
    return NextResponse.json({ firms: [], diagnostics: { stage: "select firms", found: 0 } });
  }

  const hasKind = Object.prototype.hasOwnProperty.call(rows[0], "kind");
  const hasActive = Object.prototype.hasOwnProperty.call(rows[0], "active");

  const selectable = rows.filter((f: any) => {
    // Absent column = no opinion = include it. Only an explicit false excludes.
    if (hasActive && f.active === false) return false;
    if (hasKind && f.kind && f.kind !== "client") return false;
    return true;
  });

  // Campaign counts are advisory. If this fails the firm list still returns,
  // because a firm you cannot select is a worse failure than a missing count.
  const counts = new Map<string, number>();
  try {
    const { data: camps } = await admin.from("campaigns")
      .select("firm_id, active").in("firm_id", selectable.map((f: any) => f.id));
    for (const c of camps ?? []) {
      if (c.active === false) continue;
      counts.set(c.firm_id, (counts.get(c.firm_id) ?? 0) + 1);
    }
  } catch { /* advisory only */ }

  return NextResponse.json({
    firms: selectable.map((f: any) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      venue_states: f.venue_states ?? null,
      campaign_count: counts.get(f.id) ?? 0,
    })),
    diagnostics: {
      total_firms: rows.length,
      selectable: selectable.length,
      has_kind_column: hasKind,
      has_active_column: hasActive,
      excluded: rows.length - selectable.length,
    },
  });
}
