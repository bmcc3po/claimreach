import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { propertyLookupKeys } from "@/lib/property-tool";
import {
  listPropertiesForLead, resolveM6PropertyLead, savePropertyIdentification,
  searchProperties, stampLeadProperty, tmpPropertyFirmId,
} from "@/lib/property-ops";
export const runtime = "edge";

// Session-gated property lookup for /m6. Reuses the same search/save as
// /tools/property. No token key. TMP motel actors only.

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const firmId = await tmpPropertyFirmId();
  if (!firmId) return NextResponse.json({ error: "This tool is not available." }, { status: 503 });
  const raw = new URL(req.url).searchParams.get("leadid");
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
  const firmId = await tmpPropertyFirmId();
  if (!firmId) return NextResponse.json({ error: "This tool is not available." }, { status: 503 });

  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const op = b.op === "save" ? "save" : "search";
  if (op === "search") {
    const found = await searchProperties(b);
    if (found.status !== 200) return NextResponse.json({ error: found.error }, { status: found.status });
    return NextResponse.json({ candidates: found.candidates, center: found.center });
  }

  const raw = typeof b.leadid === "string" ? b.leadid : typeof b.lead_id === "string" ? b.lead_id : "";
  const lead = await resolveM6PropertyLead(firmId, raw);
  if (!lead) {
    return NextResponse.json({ error: "Open this from a file so the stay can save." }, { status: 400 });
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
}
