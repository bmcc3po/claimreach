import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// Public submit for BUILT-IN (non-certified) signing. Captures the drawn
// signature + typed name + IP. No auth: the doc id is the capability token.
export async function POST(req: NextRequest) {
  const b = await req.json();
  const admin = supabaseAdmin();
  const { data: doc } = await admin.from("signable_documents").select("id, status, certified, lead_id, firm_id, retainer_id, title, signer_name").eq("id", b.id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.certified) return NextResponse.json({ error: "this document uses certified signing" }, { status: 400 });
  if (doc.status === "signed") return NextResponse.json({ error: "already signed" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("cf-connecting-ip") || "";
  const { error } = await admin.from("signable_documents").update({
    status: "signed", signed_at: new Date().toISOString(),
    signature_data: b.signature_data || null, signed_name: b.signed_name || null, signed_ip: ip,
    audit: { signed_name: b.signed_name, ip, ts: new Date().toISOString(), ua: req.headers.get("user-agent") },
  }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If this signable was a retainer, flip the retainer + lead to signed.
  if (doc.retainer_id) {
    await admin.from("retainers").update({ status: "signed", signed_at: new Date().toISOString() }).eq("id", doc.retainer_id);
  }
  if (doc.lead_id) {
    await admin.from("leads").update({ status: "signed", esign_date: new Date().toISOString() }).eq("id", doc.lead_id);
  }
  try {
    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({ firm_id: doc.firm_id, lead_id: doc.lead_id, category: "retainer", actor_name: doc.signer_name || "Client", description: `Client signed "${doc.title}" on our signing page (built-in).` });
  } catch {}
  return NextResponse.json({ ok: true });
}

// GET ?id= -> fetch the doc to render the signing page (public)
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  const admin = supabaseAdmin();
  const { data } = await admin.from("signable_documents").select("id, title, body_html, status, signer_name, certified").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ doc: data });
}
