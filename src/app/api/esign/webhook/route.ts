import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getEsignAccount, getSignwellDocument } from "@/lib/signwell";
import { fireEvent } from "@/lib/webhook-deliver";
export const runtime = "edge";

// SignWell posts document events here. We match by metadata.claimreach_retainer_id.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let p: any;
  try { p = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const admin = supabaseAdmin();
  // log raw for diagnosis
  try { await admin.from("webhook_events").insert({ direction: "inbound", event_type: "signwell." + (p.event?.type || "unknown"), status: "received", payload: p }); } catch {}

  // SignWell payload shape: { event: { type }, data: { object: {...document...} } }
  const evt = (p.event?.type || p.type || "").toLowerCase();
  const doc = p.data?.object || p.data || p.document || {};
  const meta = doc.metadata || {};
  let retainerId = meta.claimreach_retainer_id;
  const leadId = meta.claimreach_lead_id;
  const docId = doc.id;

  // PDF-template sends only carry lead_id; find the matching sent retainer by SignWell doc id or lead.
  if (!retainerId && docId) {
    const { data: byRef } = await admin.from("retainers").select("id").eq("provider_ref", docId).maybeSingle();
    if (byRef) retainerId = byRef.id;
  }
  if (!retainerId && leadId) {
    const { data: byLead } = await admin.from("retainers").select("id").eq("lead_id", leadId).eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle();
    if (byLead) retainerId = byLead.id;
  }

  try {
    if (retainerId) {
      const patch: any = { audit: doc };
      if (evt.includes("viewed")) patch.viewed_at = new Date().toISOString();
      if (evt.includes("declined")) { patch.status = "declined"; patch.declined_at = new Date().toISOString(); }
      if (evt.includes("completed") || evt.includes("signed")) {
        patch.status = "signed"; patch.signed_at = new Date().toISOString();
        // fetch the completed PDF url
        const { data: ret } = await admin.from("retainers").select("leads(firm_id)").eq("id", retainerId).maybeSingle();
        const acct = await getEsignAccount((ret as any)?.leads?.firm_id ?? null);
        if (acct && docId) {
          const full = await getSignwellDocument(acct.api_key, docId);
          if (full?.completed_pdf_url) patch.completed_pdf_url = full.completed_pdf_url;
        }
      }
      await admin.from("retainers").update(patch).eq("id", retainerId);

      // flip the lead + fire outbound webhook on full signature
      if (patch.status === "signed" && leadId) {
        await admin.from("leads").update({ status: "signed", esign_date: new Date().toISOString().slice(0, 10) }).eq("id", leadId);
        const { data: lead } = await admin.from("leads").select("firm_id, lead_no, first_name, last_name, phone, email, case_type").eq("id", leadId).maybeSingle();
        if (lead?.firm_id) await fireEvent(lead.firm_id, "retainer.signed", { lead_id: leadId, retainer_id: retainerId, completed_pdf_url: patch.completed_pdf_url, ...lead });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    try { await admin.from("webhook_events").insert({ direction: "inbound", event_type: "signwell." + evt, status: "failed", payload: p, error: String(e?.message ?? e) }); } catch {}
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
