import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { emergencyView, finishEmergencyPacket } from "@/lib/emergency-signing";
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const result = await db.from("signable_documents").select("*").eq("id", new URL(req.url).searchParams.get("id")).maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: "Signing document not found." }, { status: 404 });
  const doc = result.data;
  if (doc.status === "signed") return NextResponse.json({ doc: { id: doc.id, status: doc.status, signer_name: doc.signer_name, cert_pdf_url: doc.cert_pdf_url, completed_pdf_url: doc.completed_pdf_url } });
  if (["cancelled", "declined"].includes(doc.status)) return NextResponse.json({ error: "This signing link is no longer open." }, { status: 409 });
  try { const view = await emergencyView(db, doc); return NextResponse.json({ doc: view, pdf: view.pdf }); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: 409 }); }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const db = supabaseAdmin();
  const result = await db.from("signable_documents").select("*").eq("id", b?.id).maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: "Signing document not found." }, { status: 404 });
  const doc = result.data;
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  if (b.op === "viewed") {
    const { error } = await db.from("signable_documents").update({ status: "viewed", viewed_at: new Date().toISOString(), viewed_ip: ip }).eq("id", doc.id).eq("status", "sent");
    return NextResponse.json(error ? { error: "Could not record the view." } : { ok: true }, { status: error ? 503 : 200 });
  }
  if (doc.packet_group && doc.audit?.emergency?.packet_manifest?.length !== 1) return NextResponse.json({ error: "Open the packet link to sign all its documents together." }, { status: 409 });
  try { return NextResponse.json(await finishEmergencyPacket(db, [doc], b, { ip, ua: req.headers.get("user-agent") || "" })); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: 409 }); }
}
