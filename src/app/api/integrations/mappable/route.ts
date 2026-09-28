import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { STANDARD_FIELDS } from "@/lib/standard-fields";
export const runtime = "edge";

// ============================================================================
// WHAT CAN BE MAPPED OUTBOUND
//
// Lists every field an outbound webhook could send for a campaign: the lead
// columns that exist on every file, plus that campaign's actual intake
// questions, read from the form the agents are really using.
//
// Reading the live form is the point. Typing a field list into this route by
// hand would be a second definition of the questionnaire, and every case type
// bug in this build has come from exactly that: the same concept written down
// twice with nothing keeping the copies honest.
// ============================================================================

/** On every file regardless of case type: the standard fields, the same
 *  names every webhook carries (Brett, Sep 28). */
const LEAD_FIELDS: { id: string; label: string; group?: string }[] = STANDARD_FIELDS.map((f) => ({ id: f.key, label: f.label, group: f.group }));

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const campaignId = new URL(req.url).searchParams.get("campaign_id");
  const admin = supabaseAdmin();

  let questions: { id: string; label: string }[] = [];
  let caseType: string | null = null;

  if (campaignId) {
    const { data: c } = await admin.from("campaigns").select("case_type, firm_id").eq("id", campaignId).maybeSingle();
    caseType = c?.case_type ?? null;
    if (caseType) {
      // Campaign fork first, then the master for the case type. Same resolution
      // order the intake itself uses, so this cannot list questions an agent is
      // not actually being asked.
      const { data: form } = await admin.from("intake_forms")
        .select("fields")
        .eq("claim_type", caseType)
        .or(`campaign_id.eq.${campaignId},and(campaign_id.is.null,firm_id.is.null)`)
        .order("campaign_id", { ascending: false, nullsFirst: false })
        .order("version", { ascending: false })
        .limit(1).maybeSingle();
      const fields = (form?.fields ?? []) as any[];
      questions = fields
        .filter((f) => f && f.id && f.kind !== "section" && f.kind !== "script")
        .map((f) => ({ id: f.id, label: f.script || f.label || f.id }));
    }
  }

  return NextResponse.json({ case_type: caseType, lead_fields: LEAD_FIELDS, questions });
}
