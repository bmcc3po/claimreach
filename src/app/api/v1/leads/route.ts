import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { lookupKey } from "@/lib/webhooks";
import { fireEvent } from "@/lib/webhook-deliver";
import { normPhone } from "@/lib/comms";
export const runtime = "edge";

// ============================================================================
// Public REST API: leads.
//
// Auth, both methods: X-CR-Key: <key_id>  and  Authorization: Bearer <secret>
// (X-CR-Secret: <secret> also works). The key_id alone is NOT a credential:
// it appears in inbound webhook URLs that lead vendors hold, so reading or
// writing needs the secret too.
//
// Firm key -> that firm only. Master key -> pass firm_id (query on GET, body
// on POST).
// ============================================================================

function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function authKey(req: NextRequest) {
  const keyId = req.headers.get("x-cr-key");
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const secret = bearer || (req.headers.get("x-cr-secret") || "").trim();
  if (!keyId || !secret) return { error: "Send X-CR-Key and Authorization: Bearer <secret>.", status: 401 as const };
  const key = await lookupKey(keyId);
  if (!key || !same(String(key.secret || ""), secret)) return { error: "invalid key", status: 401 as const };
  return { key };
}

export async function GET(req: NextRequest) {
  const a = await authKey(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const key = a.key;
  const url = new URL(req.url);
  const admin = supabaseAdmin();
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  let firmId = key.firm_id;
  if (key.scope === "master") firmId = url.searchParams.get("firm_id") || null;
  if (!firmId) return NextResponse.json({ error: "firm_id required for master key" }, { status: 400 });

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const since = url.searchParams.get("since");
  // leads has no status column; claim status is joined below.
  let q = admin.from("leads")
    .select("id, lead_no, first_name, last_name, claimant_name, phone, email, case_type, campaign, campaign_id, external_id, created_at, updated_at")
    .eq("firm_id", firmId).is("archived_at", null).order("created_at", { ascending: false }).limit(limit);
  if (since && !isNaN(Date.parse(since))) q = q.gte("updated_at", new Date(since).toISOString());
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data ?? []).map((l: any) => l.id);
  const statusBy: Record<string, string> = {};
  if (ids.length) {
    const { data: claims } = await admin.from("claims").select("lead_id, status, created_at").in("lead_id", ids).order("created_at", { ascending: true });
    for (const c of claims ?? []) if (!statusBy[c.lead_id]) statusBy[c.lead_id] = c.status;
  }
  const status = url.searchParams.get("status");
  const leads = (data ?? []).map((l: any) => ({ ...l, status: statusBy[l.id] ?? null })).filter((l: any) => !status || l.status === status);
  return NextResponse.json({ leads, count: leads.length });
}

// POST /api/v1/leads
// { campaign_id, first_name?, last_name?, name?, phone, email?, external_id?, source?, notes?, firm_id? (master) }
// Creates a lead (and its claim) in the campaign. Duplicates by external_id or
// by phone on the same campaign return the existing lead with duplicate: true.
export async function POST(req: NextRequest) {
  const a = await authKey(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const key = a.key;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "invalid json" }, { status: 400 });
  const admin = supabaseAdmin();

  const campaignId = String(b.campaign_id || "");
  if (!campaignId) return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
  const { data: camp } = await admin.from("campaigns").select("id, name, firm_id, case_type, active").eq("id", campaignId).maybeSingle();
  if (!camp || !camp.active) return NextResponse.json({ error: "unknown or inactive campaign" }, { status: 404 });
  // A firm key only writes to its own firm. A master key must name the firm it means.
  const firmId = key.scope === "master" ? String(b.firm_id || "") : key.firm_id;
  if (!firmId || firmId !== camp.firm_id) return NextResponse.json({ error: "campaign does not belong to this key's firm" }, { status: 403 });

  const clean = (v: unknown, n = 120) => (v == null ? null : String(v).trim().slice(0, n) || null);
  let first = clean(b.first_name), last = clean(b.last_name);
  const name = clean(b.name) || [first, last].filter(Boolean).join(" ") || null;
  if (name && !first) { const p = name.split(/\s+/); first = p[0]; last = p.slice(1).join(" ") || null; }
  const phone = clean(b.phone, 40);
  const email = clean(b.email, 200);
  const externalId = clean(b.external_id, 120);
  if (!phone && !email) return NextResponse.json({ error: "phone or email required" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "email is not valid" }, { status: 400 });

  if (externalId) {
    const { data: dupe } = await admin.from("leads").select("id, lead_no").eq("firm_id", firmId).eq("external_id", externalId).maybeSingle();
    if (dupe) return NextResponse.json({ ok: true, lead_id: dupe.id, lead_no: dupe.lead_no, duplicate: true });
  }
  const norm = normPhone(phone);
  if (norm.length === 10) {
    const { data: dupe } = await admin.from("leads").select("id, lead_no").eq("campaign_id", camp.id).eq("phone_norm", norm)
      .is("archived_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (dupe) return NextResponse.json({ ok: true, lead_id: dupe.id, lead_no: dupe.lead_no, duplicate: true });
  }

  const insert: Record<string, any> = {
    firm_id: firmId, campaign_id: camp.id, campaign: camp.name, case_type: camp.case_type,
    first_name: first, last_name: last, claimant_name: name, phone, email,
    external_id: externalId, marketing_source: clean(b.source), case_description: clean(b.notes, 4000),
    source_key: key.key_id, origin: "api",
  };
  const { data: lead, error } = await admin.from("leads").insert(insert).select("id, lead_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: cErr } = await admin.from("claims").insert({ firm_id: firmId, lead_id: lead.id, claim_type: camp.case_type, campaign: camp.name, campaign_id: camp.id, status: "new", is_this_file: true });
  if (cErr) return NextResponse.json({ error: `lead ${lead.lead_no} created, claim failed: ${cErr.message}`, lead_id: lead.id }, { status: 500 });

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  try { await admin.from("webhook_events").insert({ firm_id: firmId, direction: "inbound", event_type: "api.lead.create", status: "received", http_status: 200, payload: { lead_id: lead.id, campaign_id: camp.id, external_id: externalId } }); } catch {}
  if (phone) { try { const { reconcileUnmatched } = await import("@/lib/comms"); await reconcileUnmatched(lead.id, phone, firmId); } catch {} }
  await fireEvent(firmId, "lead.created", { lead_id: lead.id, lead_no: lead.lead_no, ...insert, source: "api" }, { campaignId: camp.id });

  return NextResponse.json({ ok: true, lead_id: lead.id, lead_no: lead.lead_no }, { status: 201 });
}
