import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { cleanLeadid } from "@/lib/property-tool";
import {
  listPropertiesForLead, savePropertyIdentification, searchProperties, tmpPropertyFirmId,
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
  const leadid = cleanLeadid(new URL(req.url).searchParams.get("leadid"));
  if (!leadid) return NextResponse.json({ error: "File # is missing." }, { status: 400 });
  const { error, rows } = await listPropertiesForLead(firmId, leadid);
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
  const saved = await savePropertyIdentification(firmId, b);
  if (saved.status !== 200) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ ok: true, property: saved.property, paste: saved.paste });
}
