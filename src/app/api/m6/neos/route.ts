import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
import { cleanNeosNumber, neosMatterUrl } from "@/lib/m6-audit";
import { neosTemplate } from "@/lib/m6-audit-server";
export const runtime = "edge";

// Neos matter number on a Motel 6 file. The firm UPDATE guard on leads only
// allows stage, so this follows the LOR facts pattern: the signed-in user
// passes the m6 write fence, then one whitelisted column is written by admin,
// fenced again by id + firm.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const leadId = b?.lead_id;
  const raw = String(b?.neos_no ?? "").trim();
  if (!leadId) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const neosNo = raw ? cleanNeosNumber(raw) : null;
  if (raw && !neosNo) {
    return NextResponse.json({ error: "That does not look like a Neos file number. Letters, numbers and dashes only." }, { status: 400 });
  }

  const gate = await assertM6Write(sb, leadId, "id, firm_id, campaign, case_type, archived_at");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { error } = await supabaseAdmin()
    .from("leads")
    .update({ neos_matter_no: neosNo })
    .eq("id", leadId)
    .eq("firm_id", gate.lead.firm_id);
  if (error) {
    const missing = /neos_matter_no/.test(error.message || "");
    return NextResponse.json({
      error: missing
        ? "The Neos number field is not set up yet. Migration 0133 needs to run first."
        : error.message,
    }, { status: missing ? 503 : 500 });
  }

  return NextResponse.json({ ok: true, neos_no: neosNo, neos_url: neosMatterUrl(neosTemplate(), neosNo) });
}
