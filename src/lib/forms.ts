import type { Field } from "@/lib/questionnaire";
import { intakeForType } from "@/lib/questionnaire";

// Resolve the field set for a claim type: published DB form first, else built-in.
// `sb` is a supabase server client (passed in from a server component/route).
export async function resolveIntakeFields(sb: any, claimType: string): Promise<Field[]> {
  try {
    const { data } = await sb.from("intake_forms")
      .select("fields").eq("claim_type", (claimType || "").toLowerCase()).eq("status", "published")
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (data?.fields && Array.isArray(data.fields) && data.fields.length > 0) return data.fields as Field[];
  } catch { /* fall through to built-in */ }
  return intakeForType(claimType);
}
