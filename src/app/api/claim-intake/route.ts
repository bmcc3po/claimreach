import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
import { fieldLabelMap } from "@/lib/questionnaire";

export const runtime = "edge";

function fmt(v: any): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// POST { claim_id, firm_id, answers, properties[] }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { claim_id, firm_id, answers, properties } = await req.json();
  if (!claim_id) return NextResponse.json({ error: "claim_id required" }, { status: 400 });

  // Fetch existing claim (lead linkage + prior answers for diffing).
  const { data: claim } = await sb.from("claims").select("lead_id, answers, status").eq("id", claim_id).maybeSingle();
  const prior: Record<string, any> = (claim?.answers as any) ?? {};
  const next: Record<string, any> = answers ?? {};

  // Save answers. Move the claim to "contacting" (a real status key) only when it
  // is still at the very start (new/blank). Never downgrade a file that has moved
  // further along the pipeline (esign_sent, signed_*, qa, approved, etc.), since
  // a mid-pipeline intake edit must not reset its status.
  const START_STATUSES = new Set(["new", "", null as any, undefined as any]);
  const patch: any = { answers: next };
  if (START_STATUSES.has(claim?.status as any)) patch.status = "contacting";
  const { error: cErr } = await sb.from("claims").update(patch).eq("id", claim_id);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  if (Array.isArray(properties)) {
    await sb.from("claim_properties").delete().eq("claim_id", claim_id);
    if (properties.length) {
      const rows = properties.map((p: any, i: number) => ({ ...p, claim_id, firm_id, sequence_order: i + 1 }));
      const { error: pErr } = await sb.from("claim_properties").insert(rows);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
  }

  // ---- Field-level audit: diff prior vs next, log each change with old→new ----
  const labels = fieldLabelMap();
  const keys = new Set([...Object.keys(prior), ...Object.keys(next)]);
  const actor_name = me.full_name ?? "Staff";
  let changeCount = 0;

  for (const k of keys) {
    const before = prior[k];
    const after = next[k];
    const same = JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
    if (same) continue;
    changeCount++;

    const label = labels[k] ?? k;
    const had = before !== undefined && before !== null && before !== "";
    const has = after !== undefined && after !== null && after !== "";

    let category = "change";
    let description = "";
    if (!had && has) { category = "entered"; description = `entered "${label}": ${fmt(after)}`; }
    else if (had && !has) { category = "deleted"; description = `deleted "${fmt(before)}" from "${label}"`; }
    else { category = "change"; description = `changed "${label}" from "${fmt(before)}" to "${fmt(after)}"`; }

    await recordAudit({
      firm_id, lead_id: claim?.lead_id ?? undefined, claim_id,
      actor: auth.user.id, actor_name, category, description,
      meta: { field: k, before, after },
    });
  }

  // If nothing field-level changed but properties did, still note it.
  if (changeCount === 0 && Array.isArray(properties)) {
    await recordAudit({
      firm_id, lead_id: claim?.lead_id ?? undefined, claim_id,
      actor: auth.user.id, actor_name, category: "change",
      description: `updated properties (${properties.length})`,
    });
  }

  return NextResponse.json({ ok: true, changes: changeCount });
}
