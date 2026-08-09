import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { claim_id, tier_letter, tier_number, tier } = await req.json();
  const { data: claim } = await sb.from("claims").select("lead_id, firm_id").eq("id", claim_id).maybeSingle();

  const { error } = await sb.from("claims").update({
    tier_letter: tier_letter ?? null, tier_number: tier_number ?? null, tier: tier ?? null,
    tier_set_by: auth.user.id, tier_set_at: new Date().toISOString(),
  }).eq("id", claim_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    firm_id: claim?.firm_id ?? me.firm_id, lead_id: claim?.lead_id ?? undefined, claim_id,
    actor: auth.user.id, actor_name: me.full_name ?? "Staff",
    category: "change", description: `Set case tier to ${tier ?? "—"}`,
  });
  return NextResponse.json({ ok: true });
}
