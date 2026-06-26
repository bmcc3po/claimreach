import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";

export const runtime = "edge";

// POST { claim_id, firm_id, answers, properties[] }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { claim_id, firm_id, answers, properties } = await req.json();
  if (!claim_id) return NextResponse.json({ error: "claim_id required" }, { status: 400 });

  // Look up the lead for this claim (for audit linkage).
  const { data: claim } = await sb.from("claims").select("lead_id").eq("id", claim_id).maybeSingle();

  // Save answers onto the claim. Move claim into in_progress as intake is worked.
  const { error: cErr } = await sb.from("claims")
    .update({ answers: answers ?? {}, status: "in_progress" })
    .eq("id", claim_id);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // Replace property rows for this claim.
  if (Array.isArray(properties)) {
    await sb.from("claim_properties").delete().eq("claim_id", claim_id);
    if (properties.length) {
      const rows = properties.map((p: any, i: number) => ({
        ...p, claim_id, firm_id, sequence_order: i + 1,
      }));
      const { error: pErr } = await sb.from("claim_properties").insert(rows);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
  }

  await recordAudit({
    firm_id, lead_id: claim?.lead_id ?? undefined, claim_id,
    actor: auth.user.id, actor_name: me.full_name ?? "Staff",
    category: "change", description: "Claim intake updated",
    meta: { property_count: Array.isArray(properties) ? properties.length : 0 },
  });

  return NextResponse.json({ ok: true });
}
