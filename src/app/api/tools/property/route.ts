import { NextRequest, NextResponse } from "next/server";
import { cleanLeadid, propertyToolKeyOk } from "@/lib/property-tool";
import {
  listPropertiesForLead, savePropertyIdentification, searchProperties, tmpPropertyFirmId,
} from "@/lib/property-ops";

export const runtime = "edge";

function deny() {
  return new NextResponse(null, { status: 404 });
}

function keyFrom(req: NextRequest, body?: Record<string, unknown>): string | null {
  const q = new URL(req.url).searchParams.get("k");
  if (q) return q;
  const header = req.headers.get("x-property-tool-key");
  if (header) return header;
  const fromBody = body?.k;
  return typeof fromBody === "string" ? fromBody : null;
}

export async function GET(req: NextRequest) {
  if (!propertyToolKeyOk(keyFrom(req))) return deny();
  const leadid = cleanLeadid(new URL(req.url).searchParams.get("leadid"));
  if (!leadid) return NextResponse.json({ error: "File # is missing." }, { status: 400 });
  const firmId = await tmpPropertyFirmId();
  if (!firmId) return NextResponse.json({ error: "This tool is not available." }, { status: 503 });
  const { error, rows } = await listPropertiesForLead(firmId, leadid);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ properties: rows });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  if (!propertyToolKeyOk(keyFrom(req, b))) return deny();
  const firmId = await tmpPropertyFirmId();
  if (!firmId) return NextResponse.json({ error: "This tool is not available." }, { status: 503 });

  const op = b.op === "save" ? "save" : "search";
  try {
    if (op === "search") {
      const found = await searchProperties(b);
      if (found.status !== 200) return NextResponse.json({ error: found.error }, { status: found.status });
      return NextResponse.json({ candidates: found.candidates, center: found.center });
    }
    const saved = await savePropertyIdentification(firmId, b);
    if (saved.status !== 200) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ ok: true, property: saved.property, paste: saved.paste });
  } catch {
    return NextResponse.json({ error: "Search did not finish. Try again." }, { status: 502 });
  }
}
