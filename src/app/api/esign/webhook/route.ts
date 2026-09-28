import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getEsignAccount, getSignwellDocument } from "@/lib/signwell";
import { fireEvent } from "@/lib/webhook-deliver";
export const runtime = "edge";

// Legacy SignWell webhook (historical retainers only; new signings are DocuSeal).
//
// SignWell's console carries no shared-secret header, so this endpoint treats
// the payload as a NUDGE and nothing more (Astra audit, Sep 27). It used to
// apply status straight from the posted JSON, which let anyone who found the
// URL flip a lead to signed and fire the firm webhook. Now:
//   1. The posted body only tells us which SignWell document to look at.
//   2. The retainer must already reference that document (provider_ref).
//   3. The status and PDF come from SignWell's API, fetched with our stored
//      account key — never from the posted body.
// No account key, no matching retainer, or no fetchable document = no write.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let p: any;
  try { p = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const admin = supabaseAdmin();
  try { await admin.from("webhook_events").insert({ direction: "inbound", event_type: "signwell." + (p.event?.type || "unknown"), status: "received", payload: p }); } catch {}

  const doc = p.data?.object || p.data || p.document || {};
  const docId = doc.id;
  if (!docId) return NextResponse.json({ ok: true, ignored: "no document id" });

  // The document must already be one of ours.
  const { data: ret } = await admin.from("retainers")
    .select("id, lead_id, status, leads(firm_id)")
    .eq("provider_ref", docId).maybeSingle();
  if (!ret) return NextResponse.json({ ok: true, ignored: "not ours" });

  try {
    // Re-read the document from SignWell; the fetched copy is the only truth.
    const acct = await getEsignAccount((ret as any)?.leads?.firm_id ?? null);
    if (!acct?.api_key) return NextResponse.json({ ok: true, ignored: "no esign account" });
    const full = await getSignwellDocument(acct.api_key, docId);
    if (!full) return NextResponse.json({ ok: true, ignored: "document not fetchable" });

    const st = String(full.status || "").toLowerCase();
    const patch: any = { audit: full };
    if (st.includes("declined")) { patch.status = "declined"; patch.declined_at = new Date().toISOString(); }
    if (st.includes("completed") || st.includes("signed")) {
      patch.status = "signed"; patch.signed_at = new Date().toISOString();
      if (full.completed_pdf_url) patch.completed_pdf_url = full.completed_pdf_url;
    }
    if (!patch.status && !st.includes("viewed")) return NextResponse.json({ ok: true, ignored: `status ${st || "unknown"}` });
    if (st.includes("viewed") || full.viewed_at) patch.viewed_at = new Date().toISOString();
    await admin.from("retainers").update(patch).eq("id", ret.id);

    // Flip the lead + fire the outbound firm webhook only on a verified signature,
    // and only for the lead the retainer itself points at.
    if (patch.status === "signed" && ret.lead_id) {
      await admin.from("leads").update({ status: "signed", esign_date: officeDate() }).eq("id", ret.lead_id);
      const { data: lead } = await admin.from("leads").select("firm_id, lead_no, first_name, last_name, phone, email, case_type").eq("id", ret.lead_id).maybeSingle();
      if (lead?.firm_id) await fireEvent(lead.firm_id, "retainer.signed", { lead_id: ret.lead_id, retainer_id: ret.id, completed_pdf_url: patch.completed_pdf_url, ...lead });
      try {
        const { recordAudit } = await import("@/lib/audit");
        await recordAudit({ firm_id: lead?.firm_id, lead_id: ret.lead_id, category: "retainer", actor_name: "SignWell", description: "Retainer signed and completed (verified with SignWell). File moved to Signed." });
      } catch {}
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    try { await admin.from("webhook_events").insert({ direction: "inbound", event_type: "signwell.error", status: "failed", error: String(e?.message ?? e) }); } catch {}
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}

// The office's calendar date (America/Chicago), not the UTC date: a signature
// at 6 PM in Vegas is "today", not tomorrow.
function officeDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}
