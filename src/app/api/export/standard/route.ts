import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requirePerm } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { exportFilterFrom, loadStandardExport, standardCsv } from "@/lib/standard-fields";

export const runtime = "edge";

// GET /api/export/standard
//   [?campaign_id=][&campaign=][&case_type=][&status=][&firm_id=][&state=][&city=]
//   [&since=YYYY-MM-DD][&until=][&signed_from=][&signed_to=]
// One CSV row per matter, every standard field, in the standard order with
// the standard names as the header (Brett, Sep 28: the same names every
// webhook carries, so an import on the other side is mapped once). The
// filters are the ones the Leads page shows; campaign, case type and status
// test each MATTER's own values, so a campaign export holds that campaign's
// matters and not their siblings. Every row is read (in pages, in a fixed
// order); if any read fails the export fails, never a partial file.
// Staff with the Export leads permission; read through the caller's session.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const gate = await requirePerm(sb, "leads.export");
  if (!gate.ok) return new Response(gate.error, { status: gate.status });
  if (!isInternalRole(gate.user.role)) return new Response("forbidden", { status: 403 });

  const parsed = exportFilterFrom(new URL(req.url).searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });

  const out = await loadStandardExport(sb, parsed.filter);
  if (!out.ok) return new Response(`The export did not run. ${out.error.replace(/\.\s*$/, "")}. Nothing was downloaded.`, { status: 500 });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(standardCsv(out.records), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="claimreach-standard-${stamp}.csv"` },
  });
}
