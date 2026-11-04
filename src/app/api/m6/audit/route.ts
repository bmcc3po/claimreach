import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
import { AUDIT_NOTE_SOURCE, auditNoteBody, isAuditVerdict } from "@/lib/m6-audit";
import { bodySaysNothingReportedToG6, G6_REPORT_RULE_MESSAGE } from "@/lib/m6-cadence";
export const runtime = "edge";

// Audit stamp on a Motel 6 file. Same lead_notes thread as every other note
// (source = 'audit'), so the stamp shows on the file for both firms.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const { lead_id, verdict } = b ?? {};
  const comment = String(b?.comment ?? "").trim().slice(0, 2000);
  if (!lead_id || !isAuditVerdict(verdict)) {
    return NextResponse.json({ error: "Pick reviewed or flag." }, { status: 400 });
  }
  if (verdict === "flagged" && !comment) {
    return NextResponse.json({ error: "Say what needs follow up so the team knows what to fix." }, { status: 400 });
  }
  if (bodySaysNothingReportedToG6(comment)) {
    return NextResponse.json({ error: G6_REPORT_RULE_MESSAGE }, { status: 422 });
  }

  const gate = await assertM6Write(sb, lead_id, "id, firm_id, campaign, case_type, archived_at");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data, error } = await sb.from("lead_notes").insert({
    firm_id: gate.lead.firm_id,
    lead_id,
    author: gate.user.id,
    body: auditNoteBody(verdict, comment),
    source: AUDIT_NOTE_SOURCE,
  }).select("id, body, created_at, source").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, note: { ...data, author_name: gate.user.name ?? "You" } });
}
