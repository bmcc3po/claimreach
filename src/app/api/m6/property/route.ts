import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { propertyLookupKeys } from "@/lib/property-tool";
import {
  listPropertiesForLead, loadCanonicalByPlaceId, resolveM6PropertyLead,
  saveBrandHistory, savePropertyIdentification, searchProperties,
  stampLeadProperty, tmpPropertyFirmId,
} from "@/lib/property-ops";
export const runtime = "edge";

// Session-gated property lookup for /m6. Same Places search as intake.
// Search does not need the admin client. Save does.

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const firmId = await tmpPropertyFirmId();
  if (!firmId) return NextResponse.json({ error: "This tool is not available." }, { status: 503 });
  const url = new URL(req.url);
  const placeId = url.searchParams.get("place_id");
  if (placeId) {
    const data = await loadCanonicalByPlaceId(firmId, placeId);
    return NextResponse.json({ property: data ?? null, history: data?.brand_history ?? [] });
  }
  const raw = url.searchParams.get("leadid");
  if (!raw) return NextResponse.json({ properties: [] });
  const lead = await resolveM6PropertyLead(firmId, raw);
  const keys = lead ? propertyLookupKeys(lead) : propertyLookupKeys({ id: raw, external_id: raw, lawruler_ref_no: raw });
  const { error, rows } = await listPropertiesForLead(firmId, keys);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ properties: rows });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });

  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const op = b.op === "history" ? "history" : b.op === "save" ? "save" : "search";
    if (op === "search") {
      const found = await searchProperties(b);
      if (found.status !== 200) return NextResponse.json({ error: found.error }, { status: found.status });
      return NextResponse.json({ candidates: found.candidates, center: found.center });
    }

    const firmId = await tmpPropertyFirmId();
    if (!firmId) return NextResponse.json({ error: "This tool is not available." }, { status: 503 });

    if (op === "history") {
      const saved = await saveBrandHistory(firmId, b);
      if (saved.status !== 200) return NextResponse.json({ error: saved.error }, { status: saved.status });
      return NextResponse.json({
        ok: true,
        property: saved.property,
        history: saved.history,
        recorded: saved.recorded,
        liveGoogleBrand: saved.liveGoogleBrand,
      });
    }

    const raw = typeof b.leadid === "string" ? b.leadid : typeof b.lead_id === "string" ? b.lead_id : "";
    const lead = await resolveM6PropertyLead(firmId, raw);
    if (!lead) {
      return NextResponse.json({ error: "Type a file number so the stay can save." }, { status: 400 });
    }
    const vendorId = lead.external_id || lead.lawruler_ref_no || lead.id;
    const saved = await savePropertyIdentification(firmId, { ...b, leadid: vendorId });
    if (saved.status !== 200) return NextResponse.json({ error: saved.error }, { status: saved.status });
    const stampErr = await stampLeadProperty(firmId, lead.id, saved.property);
    if (stampErr) {
      return NextResponse.json({
        ok: true,
        property: saved.property,
        paste: saved.paste,
        warning: "Saved the lookup. The file address did not update: " + stampErr,
      });
    }
    return NextResponse.json({ ok: true, property: saved.property, paste: saved.paste });
  } catch {
    return NextResponse.json({ error: "Search did not finish. Try again." }, { status: 502 });
  }
}
