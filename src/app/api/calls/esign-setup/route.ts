import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { createTemplate, docusealConfigured, MISSING_DOCUSEAL } from "@/lib/docuseal";
import { packetsFor } from "@/lib/mva-call/esign";
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
// Safe to run again; it only makes the ones that are missing.
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
  const { data: have } = await admin.from("esign_templates").select("key").eq("campaign_id", camp.id).eq("provider", "docuseal");
  const done = new Set((have ?? []).map((r: any) => r.key));
  const origin = new URL(req.url).origin;
  const made: string[] = [];
  for (const [key, packet] of Object.entries(packets)) {
    if (done.has(key)) continue;
    const res = await createTemplate(packet, origin + packet.path);
    if (!res.ok) return NextResponse.json({ error: `DocuSeal would not make the ${key} template: ${res.error}`, made }, { status: 502 });
    const { error } = await admin.from("esign_templates").insert({
      firm_id: camp.firm_id, campaign_id: camp.id, provider: "docuseal", key,
      template_id: String(res.data.id), name: packet.name, created_by: me.id,
    });
    if (error) return NextResponse.json({ error: `Made the ${key} template in DocuSeal (id ${res.data.id}) but could not save it here: ${error.message}`, made }, { status: 500 });
    made.push(key);
  }
  await recordAudit({ firm_id: camp.firm_id, actor: me.id, actor_name: me.name ?? "Admin", category: "system",
    description: `Set up DocuSeal agreements for ${camp.name}: ${made.length ? made.join(", ") : "already done"}.` });
  return NextResponse.json({ ok: true, made });
}
