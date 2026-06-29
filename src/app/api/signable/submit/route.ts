import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

function clientIp(req: NextRequest): string {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

async function sha256Hex(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}

// Public submit for BUILT-IN (non-certified) signing. The doc id is the
// capability token. Handles the ceremony ops: viewed, consent, sign.
export async function POST(req: NextRequest) {
  const b = await req.json();
  const admin = supabaseAdmin();
  const { data: doc } = await admin.from("signable_documents")
    .select("id, status, certified, lead_id, firm_id, retainer_id, title, signer_name, body_html, envelope_id, viewed_at, audit")
    .eq("id", b.id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.certified) return NextResponse.json({ error: "this document uses certified signing" }, { status: 400 });

  const ip = clientIp(req);
  const now = new Date().toISOString();
  const audit = (doc.audit && typeof doc.audit === "object") ? doc.audit : {};

  // Step 1: first view.
  if (b.op === "viewed") {
    if (!doc.viewed_at) {
      await admin.from("signable_documents").update({
        status: doc.status === "draft" || doc.status === "sent" ? "viewed" : doc.status,
        viewed_at: now, viewed_ip: ip,
        audit: { ...audit, viewed: { ip, ts: now, ua: req.headers.get("user-agent") } },
      }).eq("id", b.id);
    }
    return NextResponse.json({ ok: true });
  }

  // Step 2: E-SIGN consent accepted.
  if (b.op === "consent") {
    await admin.from("signable_documents").update({
      consent_at: now,
      audit: { ...audit, consent: { ip, ts: now } },
    }).eq("id", b.id);
    return NextResponse.json({ ok: true });
  }

  // Step 3: final signature.
  if (b.op === "sign" || b.signature_data) {
    if (doc.status === "signed") return NextResponse.json({ error: "already signed" }, { status: 400 });
    const docHash = await sha256Hex((doc.body_html || doc.title || "") + "|" + (doc.envelope_id || ""));
    const { error } = await admin.from("signable_documents").update({
      status: "signed", signed_at: now,
      signature_data: b.signature_data || null, signed_name: b.signed_name || null,
      signature_type: b.signature_type || "drawn", signed_ip: ip, doc_hash: docHash,
      audit: {
        ...audit,
        signed: { name: b.signed_name, ip, ts: now, type: b.signature_type || "drawn", ua: req.headers.get("user-agent") },
        hash: docHash,
      },
    }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If this was a retainer, advance the retainer + lead. New status model:
    // a client signature enters the QA pipeline at signed_grievous.
    if (doc.retainer_id) {
      await admin.from("retainers").update({ status: "signed", signed_at: now }).eq("id", doc.retainer_id);
    }
    if (doc.lead_id) {
      try {
        const { setClaimStatusForLeads } = await import("@/lib/claim-status");
        await setClaimStatusForLeads({ leadIds: [doc.lead_id], status: "signed_grievous", actorName: doc.signer_name || "Client" });
      } catch {
        await admin.from("leads").update({ signed_at: now }).eq("id", doc.lead_id);
      }
    }
    try {
      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({ firm_id: doc.firm_id, lead_id: doc.lead_id, category: "retainer", actor_name: doc.signer_name || "Client", description: `Client completed in-house e-sign of "${doc.title}" (envelope ${doc.envelope_id}). IP ${ip}.` });
    } catch {}
    return NextResponse.json({ ok: true, envelope_id: doc.envelope_id });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

// GET ?id= -> fetch the doc to render the signing page (public)
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  const admin = supabaseAdmin();
  const { data } = await admin.from("signable_documents")
    .select("id, title, body_html, status, signer_name, certified, envelope_id")
    .eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ doc: data });
}
