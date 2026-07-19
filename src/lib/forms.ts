import type { Field } from "@/lib/questionnaire";
import { intakeForType } from "@/lib/questionnaire";

// Resolve the field set for a claim type: published DB form first, else built-in.
// `sb` is a supabase server client (passed in from a server component/route).
export async function resolveIntakeFields(sb: any, claimType: string): Promise<Field[]> {
  try {
    const { data } = await sb.from("intake_forms")
      .select("fields").eq("claim_type", (claimType || "").toLowerCase()).eq("status", "published")
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (data?.fields && Array.isArray(data.fields) && data.fields.length > 0) {
      return ensurePropertyLookup(data.fields as Field[], claimType);
    }
  } catch { /* fall through to built-in */ }
  return intakeForType(claimType);
}

// Trafficking/property case types MUST surface the searchable property-lookup
// tool. If a published form was saved without it (an older flattened motel
// template), inject the s_properties section + property_lookup so the tool
// renders instead of a plain text box.
function ensurePropertyLookup(fields: Field[], claimType: string): Field[] {
  const t = (claimType || "").toLowerCase();
  const isProperty = t.includes("motel") || t.includes("traffick") || t.includes("hotel");
  if (!isProperty) return fields;
  const hasLookup = fields.some((f) => f.kind === "property_lookup" || f.id === "s_properties");
  if (hasLookup) return fields;
  const section = { id: "s_properties", scope: "lead", kind: "section", label: "Properties (add one per hotel/motel)", origin: "preset", vital: true } as any;
  const lookup = { id: "property_lookup", scope: "property", kind: "property_lookup", label: "Identify the property", origin: "preset", vital: true } as any;
  // Drop any old flat free-text property-name field so we don't duplicate it.
  const cleaned = fields.filter((f) => f.id !== "motel_property_names");
  // Insert after the two gate questions if present, else at the front.
  const gateIdx = cleaned.findIndex((f) => f.id === "motel_specific_property");
  if (gateIdx >= 0) {
    return [...cleaned.slice(0, gateIdx + 1), section, lookup, ...cleaned.slice(gateIdx + 1)];
  }
  return [section, lookup, ...cleaned];
}


// ============================================================================
// ONE ANSWER TO "WHICH FORM IS THIS FILE ON"
//
// The intake page, the PDF export and the CSV export each worked this out their
// own way. The intake page asked the campaign first; the exporters asked the
// claim. When those disagreed the exporter rendered a form the answers had
// never been stored under, and the PDF came out blank with every question
// present and every answer missing.
//
// Everything calls this now. Campaign wins, because the campaign is what
// decided which questions the agent was shown in the first place.
// ============================================================================
export async function resolveFormKey(sb: any, leadId: string): Promise<string | null> {
  const { data: lead } = await sb.from("leads").select("case_type, campaign_id").eq("id", leadId).maybeSingle();
  const { data: claim } = await sb.from("claims").select("claim_type, campaign_id").eq("lead_id", leadId).limit(1).maybeSingle();

  const campaignId = claim?.campaign_id || lead?.campaign_id;
  if (campaignId) {
    const { data: camp } = await sb.from("campaigns").select("intake_template, case_type").eq("id", campaignId).maybeSingle();
    const fromCampaign = camp?.intake_template || camp?.case_type;
    if (fromCampaign) return String(fromCampaign).toLowerCase();
  }
  const fallback = claim?.claim_type || lead?.case_type;
  return fallback ? String(fallback).toLowerCase() : null;
}
