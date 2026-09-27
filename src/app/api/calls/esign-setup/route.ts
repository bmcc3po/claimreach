import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { docusealConfigured, MISSING_DOCUSEAL } from "@/lib/docuseal";
import { packetsFor, templateFor } from "@/lib/mva-call/esign";
import { recordAudit } from "@/lib/audit";

export const runtime = "edge";

async function campaignFor(sb: any, campaignId: string) {
  const { data: camp } = await sb.from("campaigns").select("id, name, firm_id, case_type").eq("id", campaignId).maybeSingle();
  if (!camp) return null;
  const { data: firm } = await sb.from("firms").select("slug").eq("id", camp.firm_id).maybeSingle();
  return { ...camp, firm_slug: firm?.slug ?? null };
}

// GET /api/calls/esign-setup?campaign_id=  -> which agreements are ready
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const campaignId = new URL(req.url).searchParams.get("campaign_id") || "";
  const camp = await campaignFor(sb, campaignId);
  if (!camp) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const packets = packetsFor(camp.firm_slug, camp.case_type);
  const { data: rows } = await sb.from("esign_templates").select("key, template_id").eq("campaign_id", camp.id).eq("provider", "docuseal");
  return NextResponse.json({
    has_packets: !!packets, keys: packets ? Object.keys(packets) : [],
    ready: (rows ?? []).map((r: any) => r.key), docuseal: docusealConfigured(),
  });
}

// POST /api/calls/esign-setup { campaign_id }
// Owner or admin, once per campaign: creates the DocuSeal templates (TX, FL,
// and everything else) from the packet PDFs with the checked field map.
// Safe to run again; it only makes the ones that are missing or out of date.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "Only an owner or admin can set up e-sign." }, { status: 403 });
  if (!docusealConfigured()) return NextResponse.json({ error: MISSING_DOCUSEAL }, { status: 500 });

  const b = await req.json().catch(() => null);
  const camp = await campaignFor(sb, String(b?.campaign_id || ""));
  if (!camp) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const packets = packetsFor(camp.firm_slug, camp.case_type);
  if (!packets) return NextResponse.json({ error: "There are no agreement files for this campaign yet." }, { status: 409 });

  const admin = supabaseAdmin();
  const origin = new URL(req.url).origin;
  const made: string[] = [];
  for (const [key, packet] of Object.entries(packets)) {
    const t = await templateFor(admin, { firmId: camp.firm_id, campaignId: camp.id, key, packet, origin, actorId: me.id, create: true });
    if (!t.ok) return NextResponse.json({ error: t.error, made }, { status: 424 });
    if (t.made) made.push(key);
  }
  await recordAudit({ firm_id: camp.firm_id, actor: me.id, actor_name: me.name ?? "Admin", category: "system",
    description: `Set up DocuSeal agreements for ${camp.name}: ${made.length ? made.join(", ") : "already done"}.` });
  return NextResponse.json({ ok: true, made });
}
