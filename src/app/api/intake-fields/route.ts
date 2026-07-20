import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// Returns the mappable intake fields for a case type (or campaign's intake
// template), so the retainer field-mapping picker can offer the ACTUAL questions
// (e.g. "Date of incident [incident_date]") alongside the standard contact/case
// tokens. Only data-bearing fields; sections, scripts, and gates are excluded.
const DATA_KINDS = ["text", "textarea", "date", "select", "radio", "yesno", "phone", "email", "number", "money", "address", "checkbox", "month_year"];

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  let caseType = (url.searchParams.get("case_type") || "").toLowerCase();
  const campaignId = url.searchParams.get("campaign_id");

  // If a campaign is given, prefer its intake_template.
  if (campaignId) {
    const { data: c } = await sb.from("campaigns").select("intake_template, case_type").eq("id", campaignId).maybeSingle();
    if (c) caseType = (c.intake_template || c.case_type || caseType || "").toLowerCase();
  }
  if (!caseType) return NextResponse.json({ fields: [] });

  const { resolveIntakeFields } = await import("@/lib/forms");
  const { intakeForType } = await import("@/lib/questionnaire");
  let fields: any[] = [];
  try { fields = await resolveIntakeFields(sb, caseType); } catch { fields = []; }
  if (!fields || fields.length === 0) { try { fields = intakeForType(caseType) as any[]; } catch { fields = []; } }

  const mappable = (fields || [])
    .filter((f) => DATA_KINDS.includes(f.kind))
    .map((f) => ({ id: f.id, label: f.label || f.id, token: `intake.${f.id}` }));

  return NextResponse.json({ case_type: caseType, fields: mappable });
}
