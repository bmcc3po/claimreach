import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
export const runtime = "edge";

// POST /api/intake-calls  -> land a completed console call.
// Additive only: writes to intake_calls. Promotion to a lead is phase two.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (g.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.caller_id) return NextResponse.json({ error: "caller_id required" }, { status: 400 });

  const admin = supabaseAdmin();

  // Resolve the tenant from the console's firm slug; fall back to the agent's firm.
  let firmId: string | null = g.firmId;
  if (b.firm_slug) {
    const { data: f } = await admin.from("firms").select("id").eq("slug", b.firm_slug).maybeSingle();
    if (f?.id) firmId = f.id;
  }

  const row = {
    firm_id: firmId,
    firm_slug: b.firm_slug ?? null,
    agent_id: g.id,
    agent_name: g.name ?? null,
    caller_id: String(b.caller_id).trim(),
    first_name: b.first_name ?? null,
    callback: b.callback ?? null,
    call_type: b.call_type ?? null,
    matter: b.matter ?? null,
    answers: b.answers ?? {},
    disposition: b.disposition ?? null,
    reason: b.reason ?? null,
    close_key: b.close_key ?? null,
    flags: Array.isArray(b.flags) ? b.flags : [],
    summary: b.summary ?? null,
    post_sign: b.post_sign ?? null,
  };

  const { data, error } = await admin.from("intake_calls").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// PATCH /api/intake-calls  { id, post_sign } -> attach post-signature capture.
export async function PATCH(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("intake_calls").update({ post_sign: b.post_sign ?? null }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
