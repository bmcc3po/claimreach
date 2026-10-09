import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload.claim_id !== "string" || !payload.claim_id) return NextResponse.json({ error: "Choose a case first." }, { status: 400 });
  const { claim_id, tier_letter, tier_number, tier } = payload;
  const { data: selected, error: readError } = await sb.from("claims").select("lead_id").eq("id", claim_id).maybeSingle();
  if (readError) return NextResponse.json({ error: "Could not verify this case." }, { status: 503 });
  if (!selected) return NextResponse.json({ error: "Case not found." }, { status: 404 });
  const context = await resolveSigningMatter(sb, selected.lead_id, { claimId: claim_id });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { data: saved, error } = await sb.from("claims").update({
    tier_letter: tier_letter ?? null, tier_number: tier_number ?? null, tier: tier ?? null,
    tier_set_by: auth.user.id, tier_set_at: new Date().toISOString(),
  }).eq("id", claim_id).eq("lead_id", context.lead.id).eq("firm_id", context.lead.firm_id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (saved?.id !== claim_id) return NextResponse.json({ error: "The tier was not saved. Reload the file before retrying." }, { status: 409 });

  await recordAudit({
    firm_id: context.lead.firm_id, lead_id: context.lead.id, claim_id,
    actor: auth.user.id, actor_name: me.full_name ?? "Staff",
    category: "change", description: `Set case tier to ${tier ?? "—"}`,
  });
  return NextResponse.json({ ok: true });
}
