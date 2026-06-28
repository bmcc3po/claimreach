import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { lookupKey, verifySignature, mapInbound } from "@/lib/webhooks";
import { fireEvent } from "@/lib/webhook-deliver";
export const runtime = "edge";

// Inbound lead webhook. Any source POSTs a lead here.
// Header: X-CR-Key: <key_id>, X-CR-Signature: sha256=<hmac of raw body using the key secret>
export async function POST(req: NextRequest, { params }: { params: Promise<{ key_id: string }> }) {
  const { key_id } = await params;
  const raw = await req.text();
  const admin = supabaseAdmin();

  const key = await lookupKey(key_id);
  if (!key) { await log(admin, null, "inbound", "lead.in", "failed", 401, raw, "unknown key"); return NextResponse.json({ error: "unknown key" }, { status: 401 }); }

  const sig = req.headers.get("x-cr-signature");
  const ok = await verifySignature(key.secret, raw, sig);
  if (!ok) { await log(admin, key.firm_id, "inbound", "lead.in", "failed", 401, raw, "bad signature"); return NextResponse.json({ error: "bad signature" }, { status: 401 }); }

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  // field mapping for this firm (inbound)
  const { data: fm } = await admin.from("field_mappings").select("map, transforms").eq("firm_id", key.firm_id).eq("direction", "inbound").maybeSingle();
  const mapped = mapInbound(body, fm ?? undefined);
  if (mapped.full_name) delete mapped.full_name; // generated column

  const firmId = key.firm_id;
  const insert: any = {
    firm_id: firmId,
    first_name: mapped.first_name ?? null,
    last_name: mapped.last_name ?? null,
    claimant_name: mapped.claimant_name ?? null,
    phone: mapped.phone ?? null,
    email: mapped.email ?? null,
    case_type: mapped.case_type ?? "motel_trafficking",
    campaign: mapped.campaign ?? null,
    source_key: key_id,
    external_id: mapped.external_id ?? null,
    status: "new",
  };

  // de-dupe: skip if we already have this external_id for this firm
  if (insert.external_id) {
    const { data: dupe } = await admin.from("leads").select("id").eq("firm_id", firmId).eq("external_id", insert.external_id).maybeSingle();
    if (dupe) { await log(admin, firmId, "inbound", "lead.in", "received", 200, raw, "duplicate external_id"); return NextResponse.json({ ok: true, lead_id: dupe.id, duplicate: true }); }
  }

  const { data: lead, error } = await admin.from("leads").insert(insert).select("id, lead_no").single();
  if (error) { await log(admin, firmId, "inbound", "lead.in", "failed", 500, raw, error.message); return NextResponse.json({ error: error.message }, { status: 500 }); }

  // create a default claim for the case type
  await admin.from("claims").insert({ firm_id: firmId, lead_id: lead.id, claim_type: insert.case_type, campaign: insert.campaign, status: "new" });

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  await log(admin, firmId, "inbound", "lead.in", "received", 200, raw, null);

  // fire outbound lead.created to any subscribed endpoints
  // claim any orphaned calls/SMS that arrived before this file existed
  try { const { reconcileUnmatched } = await import("@/lib/comms"); await reconcileUnmatched(lead.id, insert.phone, firmId); } catch {}

  await fireEvent(firmId, "lead.created", { lead_id: lead.id, lead_no: lead.lead_no, ...insert });

  return NextResponse.json({ ok: true, lead_id: lead.id, lead_no: lead.lead_no });
}

async function log(admin: any, firm_id: string | null, direction: string, event_type: string, status: string, http: number, payload: string, error: string | null) {
  try { await admin.from("webhook_events").insert({ firm_id, direction, event_type, status, http_status: http, payload: safe(payload), error }); } catch {}
}
function safe(s: string) { try { return JSON.parse(s); } catch { return { raw: s.slice(0, 500) }; } }
