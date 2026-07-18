import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// The single source of case types. Reads case_type_registry, which the campaign
// editor, the intake console, and the template layer all share. Previously this
// was a hardcoded list here AND a different hardcoded list in the campaign
// editor AND different keys again in the console, so a campaign could be created
// that the console could never find. One vocabulary now.
//
// Published builder forms are appended so a firm-specific form (Beta Motel) is
// still selectable without needing a registry row first.
export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const types: { value: string; label: string; family?: string; campaign?: string }[] = [];
  const seen = new Set<string>();

  const { data: reg } = await sb.from("case_type_registry")
    .select("key, label, family, active, sort").eq("active", true).order("sort");
  for (const r of reg ?? []) {
    if (seen.has(r.key)) continue;
    types.push({ value: r.key, label: r.label, family: r.family ?? undefined });
    seen.add(r.key);
  }

  const { data: forms } = await sb.from("intake_forms")
    .select("claim_type, name").eq("status", "published");
  for (const f of forms ?? []) {
    if (f.claim_type && !seen.has(f.claim_type)) {
      types.push({ value: f.claim_type, label: f.name });
      seen.add(f.claim_type);
    }
  }

  return NextResponse.json({ types });
}
