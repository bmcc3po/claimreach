import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// Public submit for BUILT-IN (non-certified) signing. Captures the drawn
// signature + typed name + IP. No auth: the doc id is the capability token.
export async function POST(req: NextRequest) {
  const b = await req.json();
  const admin = supabaseAdmin();
  const { data: doc } = await admin.from("signable_documents").select("id, status, certified").eq("id", b.id).maybeSingle();
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
