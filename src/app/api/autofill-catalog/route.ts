import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// ONE catalog of every autofillable field, so the retainer field picker discovers
// fields dynamically instead of using a hardcoded list. Add a question to an intake
// form or a contact field, and it appears here automatically. The tokens returned
// here match exactly what src/lib/retainer-tokens.ts fills at send time.

const STANDARD = [
  { group: "Client", token: "contact.full_name", label: "Client full name" },
  { group: "Client", token: "contact.first_name", label: "First name" },
  { group: "Client", token: "contact.last_name", label: "Last name" },
  { group: "Client", token: "contact.phone", label: "Phone" },
  { group: "Client", token: "contact.email", label: "Email" },
  { group: "Client", token: "contact.dob", label: "Date of birth" },
  { group: "Client", token: "contact.address", label: "Mailing address (full)" },
  { group: "Case", token: "case.lead_no", label: "File number" },
  { group: "Case", token: "case.type", label: "Case type" },
  { group: "Case", token: "case.summary", label: "Case summary" },
  { group: "Case", token: "case.description", label: "Case description" },
  { group: "Case", token: "case.handling_attorney", label: "Handling attorney" },
  { group: "Case", token: "case.referring_attorney", label: "Referring attorney" },
  { group: "Other", token: "today", label: "Today's date" },
];

const DATA_KINDS = ["text", "textarea", "date", "select", "radio", "yesno", "phone", "email", "number", "money", "address", "checkbox", "month_year", "property_lookup"];

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  let caseType = (url.searchParams.get("case_type") || "").toLowerCase();
  const campaignId = url.searchParams.get("campaign_id");
  if (campaignId) {
    const { data: c } = await sb.from("campaigns").select("intake_template, case_type").eq("id", campaignId).maybeSingle();
    if (c) caseType = (c.intake_template || c.case_type || caseType || "").toLowerCase();
  }

  // Discover the intake questions for this case type (published custom form first,
  // else the preset). Every data-bearing field becomes an autofill option.
  let intake: any[] = [];
  if (caseType) {
    try {
      const { resolveIntakeFields } = await import("@/lib/forms");
      intake = await resolveIntakeFields(sb, caseType);
    } catch { intake = []; }
    if (!intake || intake.length === 0) {
      try { const { intakeForType } = await import("@/lib/questionnaire"); intake = intakeForType(caseType) as any[]; } catch { intake = []; }
    }
  }
  const intakeOpts = (intake || [])
    .filter((f) => DATA_KINDS.includes(f.kind))
    .map((f) => ({ group: "Intake questions", token: `intake.${f.id}`, label: f.label || f.id }));

  return NextResponse.json({ case_type: caseType, catalog: [...STANDARD, ...intakeOpts] });
}
