import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { normalizeLead, loadCampaigns, chooseCampaign, ingestLead, parseLeadBody, redactForLog } from "@/lib/lead-ingest";
export const runtime = "edge";

// ---------------------------------------------------------------------------
// Marketer webhook: a lead vendor posts leads straight into the App.
//
//   POST https://claimreach.com/api/webhooks/marketer
//   Header: x-cr-secret: <that marketer's secret>   (or ?key=<secret> when the
//           platform cannot set a header)
//   Body:   JSON, form-data or urlencoded. Any field names.
//
// Each marketer gets its own secret, set in Cloudflare as
//   MARKETER_WEBHOOK_SECRETS = prdigital:abc123...,othervendor:def456...
// The name before the colon is who sent it, so a lead is tagged with its
// marketer even when the payload does not say. Cutting one vendor off is
// deleting their entry.
//
// Case type picks the campaign ("INNO MVA", "TMP MVA"); no case type means MVA.
// The same person later arriving from LawRuler lands on the same file.
// ---------------------------------------------------------------------------

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function whoSent(req: NextRequest): string | null {
  const got = req.headers.get("x-cr-secret") || new URL(req.url).searchParams.get("key") || "";
  if (!got) return null;
  const entries = (process.env.MARKETER_WEBHOOK_SECRETS || "").split(",").map((e) => e.trim()).filter(Boolean);
  let who: string | null = null;
  for (const e of entries) {
    const i = e.indexOf(":");
    if (i < 1) continue;
    const name = e.slice(0, i).trim(), secret = e.slice(i + 1).trim();
    if (secret.length >= 16 && sameText(secret, got)) who = name;
  }
  return who;
}

export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();
  const marketer = whoSent(req);
  const { fields, rawNote } = await parseLeadBody(req);
  const envelope = { content_type: rawNote, marketer, field_keys: Object.keys(fields), fields: redactForLog(fields) };
  if (!marketer) {
    await log(admin, null, "failed", 401, { content_type: rawNote, field_keys: Object.keys(fields) }, "bad or missing x-cr-secret");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const norm = normalizeLead(fields);
  const camp = chooseCampaign(norm.caseType, await loadCampaigns(admin), { defaultToMva: true });
  if (!camp) {
    await log(admin, null, "failed", 422, envelope, `no active campaign for case type "${norm.caseType ?? ""}"`);
    return NextResponse.json({ error: `No active campaign matches case type "${norm.caseType ?? ""}".` }, { status: 422 });
  }

  const r = await ingestLead(admin, { lead: norm, campaign: camp, via: "marketer", marketerName: marketer });
  await log(admin, camp.firm_id, r.ok ? "received" : "failed", r.ok ? 200 : (r.status || 500),
    { ...envelope, lead_no: r.lead_no ?? null, created: !!r.created, campaign: camp.name }, r.error ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 500 });
  return NextResponse.json({ ok: true, lead_id: r.lead_id, lead_no: r.lead_no, created: r.created, duplicate: !r.created });
}

async function log(admin: any, firm_id: string | null, status: string, http: number, payload: any, error: string | null) {
  try {
    await admin.from("webhook_events").insert({ firm_id, direction: "inbound", event_type: "marketer.lead", status, http_status: http, payload, error });
  } catch { /* the lead matters more than the log */ }
}
