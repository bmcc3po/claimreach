import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { docusealConfigured, MISSING_DOCUSEAL } from "@/lib/docuseal";
import { packetsFor, templateFor } from "@/lib/mva-call/esign";
import { recordAudit } from "@/lib/audit";
import { REHEARSAL_PACKET, rehearsalKey, syntheticName } from '@/lib/mva-call/rehearsal';
import { toE164 } from '@/lib/justcall-send';

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
  if (b?.rehearsal_lead_id) {
    const leadId = String(b.rehearsal_lead_id);
    const found = await sb.from('leads').select('id,claimant_name,external_id,vendor_fields,archived_at')
      .eq('id', leadId).eq('firm_id', camp.firm_id).eq('campaign_id', camp.id).maybeSingle();
    if (found.error || !found.data || found.data.archived_at || !syntheticName(found.data.claimant_name) || found.data.external_id?.includes(':pax:') || camp.firm_slug !== 'tmp' || camp.name !== 'INNO MVA')
      return NextResponse.json({ error: 'Use an active synthetic TEST driver file in INNO MVA.' }, { status: 409 });
    const prior = await sb.from('esign_submissions').select('id').eq('lead_id', leadId).eq('firm_id', camp.firm_id).limit(1);
    const children = await sb.from('leads').select('id').eq('firm_id', camp.firm_id).like('external_id', `${leadId}:pax:%`).limit(1);
    if (prior.error || children.error || prior.data?.length || children.data?.length)
      return NextResponse.json({ error: 'Rehearsal setup requires a fresh driver file with no agreements or passenger files.' }, { status: 409 });
    const phone = toE164(String(b.rehearsal_phone || ''));
    const emails = String(b.rehearsal_emails || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!phone || !/^\+[1-9]\d{9,14}$/.test(phone) || !emails.length || emails.length > 5 || emails.some(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
      return NextResponse.json({ error: 'Enter the approved test phone and valid test email addresses.' }, { status: 400 });
    // Keep the approved destinations on the root file; child files resolve it.
    // Normal lead-edit routes do not accept vendor_fields or source_key.
    const old = found.data.vendor_fields || {};
    const config = { version: 1, phone, emails, prepared_by: me.id, prepared_at: new Date().toISOString() };
    let write = admin.from('leads').update({ source_key: 'test_lead', vendor_fields: { ...old, signing_rehearsal: config } })
      .eq('id', leadId).eq('firm_id', camp.firm_id).eq('campaign_id', camp.id);
    write = found.data.vendor_fields == null ? write.is('vendor_fields', null) : write.eq('vendor_fields', JSON.stringify(found.data.vendor_fields));
    const saved = await write.select('id').maybeSingle();
    if (saved.error || !saved.data) return NextResponse.json({ error: 'Test destinations did not save. Refresh and retry.' }, { status: 409 });
    const result = await templateFor(admin, { firmId: camp.firm_id, campaignId: camp.id, key: rehearsalKey(leadId),
      packet: REHEARSAL_PACKET, origin, actorId: me.id, create: true });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 424 });
    await recordAudit({ firm_id: camp.firm_id, lead_id: leadId, actor: me.id, actor_name: me.name || 'Owner', category: 'system',
      description: 'Prepared an explicitly nonbinding signing rehearsal. Live campaign templates were not changed.',
      meta: { template_id: result.templateId, test_only: true } });
    return NextResponse.json({ ok: true, test_only: true });
  }
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
