import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "edge";

// POST { claim_id, firm_id, answers, properties[] }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { claim_id, firm_id, answers, properties } = await req.json();
  if (!claim_id) return NextResponse.json({ error: "claim_id required" }, { status: 400 });

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

  return NextResponse.json({ ok: true });
}
