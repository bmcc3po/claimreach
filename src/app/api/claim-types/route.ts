import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// All selectable claim types = built-in + every PUBLISHED builder form.
const BUILTIN = [
  { value: "motel_trafficking", label: "Hospitality Trafficking", campaign: "" },
  { value: "pfas", label: "PFAS", campaign: "NGUYEN PFAS INNO" },
  { value: "bard_powerport", label: "Bard PowerPort", campaign: "TMP BARD PP" },
  { value: "medmal", label: "Medical Malpractice", campaign: "TMP MED MAL" },
];

export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: forms } = await sb.from("intake_forms")
    .select("claim_type, name").eq("status", "published");
  const seen = new Set(BUILTIN.map((b) => b.value));
  const types = [...BUILTIN];
  for (const f of forms ?? []) {
    if (!seen.has(f.claim_type)) { types.push({ value: f.claim_type, label: f.name, campaign: "" }); seen.add(f.claim_type); }
  }
  return NextResponse.json({ types });
}
