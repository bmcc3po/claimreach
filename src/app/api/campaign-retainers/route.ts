import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
export const runtime = "edge";

// Which retainers a campaign is allowed to send. The agent picker populates from
// here and nowhere else, so a Turnbull MVA client cannot be sent another firm's
// paper. A campaign can legitimately hold several (per-state partners, per
// diagnosis in mass tort), which is why this is a set rather than one field.

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const campaignId = new URL(req.url).searchParams.get("campaign_id");
  if (!campaignId) return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data } = await admin.from("campaign_retainers")
    .select("id, label, kind, template_id, is_default, active, sort")
    .eq("campaign_id", campaignId).order("sort");
  return NextResponse.json({ retainers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(g.role)) return NextResponse.json({ error: "Only an owner or admin can change a campaign's retainers." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  if (b.op === "add") {
    if (!b.campaign_id || !b.template_id || !b.label) {
      return NextResponse.json({ error: "campaign, document and label are all required" }, { status: 400 });
    }
    const { data: existing } = await admin.from("campaign_retainers")
      .select("id").eq("campaign_id", b.campaign_id).eq("active", true);
    const first = (existing ?? []).length === 0;   // the first one added is the default
    const { error } = await admin.from("campaign_retainers").insert({
      campaign_id: b.campaign_id, label: b.label, kind: b.kind ?? "text",
      template_id: b.template_id, is_default: first, sort: (existing ?? []).length,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.op === "remove") {
    if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data: row } = await admin.from("campaign_retainers").select("campaign_id, is_default").eq("id", b.id).maybeSingle();
    const { error } = await admin.from("campaign_retainers").delete().eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Never leave a campaign with retainers but no default; the console would
    // have nothing pre-selected and the agent would be picking blind.
    if (row?.is_default) {
      const { data: rest } = await admin.from("campaign_retainers")
        .select("id").eq("campaign_id", row.campaign_id).eq("active", true).order("sort").limit(1);
      if (rest?.[0]) await admin.from("campaign_retainers").update({ is_default: true }).eq("id", rest[0].id);
    }
    return NextResponse.json({ ok: true });
  }

  if (b.op === "set_default") {
    if (!b.id || !b.campaign_id) return NextResponse.json({ error: "id and campaign_id required" }, { status: 400 });
    await admin.from("campaign_retainers").update({ is_default: false }).eq("campaign_id", b.campaign_id);
    const { error } = await admin.from("campaign_retainers").update({ is_default: true }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
