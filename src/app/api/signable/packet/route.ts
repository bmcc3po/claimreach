import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// GET ?group= -> list the docs in this packet for the public signing page.
export async function GET(req: NextRequest) {
  const group = new URL(req.url).searchParams.get("group");
  if (!group) return NextResponse.json({ error: "missing group" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: docs } = await admin.from("signable_documents")
    .select("id, title, body_html, status, signer_name, certified, envelope_id, pdf_template_id, packet_seq")
    .eq("packet_group", group).order("packet_seq");
  if (!docs || docs.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Attach PDF render info for any PDF docs.
  const out: any[] = [];
  for (const d of docs) {
    let pdf: any = null;
    if (d.pdf_template_id) {
      const { data: tpl } = await admin.from("pdf_templates").select("file_path, fields, page_count, file_name").eq("id", d.pdf_template_id).maybeSingle();
      if (tpl?.file_path) {
        const { data: signed } = await admin.storage.from("retainer-pdfs").createSignedUrl(tpl.file_path, 3600);
        pdf = { url: signed?.signedUrl || null, fields: tpl.fields || [], page_count: tpl.page_count || 1, file_name: tpl.file_name };
      }
    }
    out.push({ ...d, pdf });
  }
  return NextResponse.json({ group, docs: out, signer_name: docs[0].signer_name });
}

// POST -> sign EVERY doc in the packet with one signature (the 5-tap ceremony's
// final "Insert Everywhere + I Agree" step). Applies signature, stamps PDFs.
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.group) return NextResponse.json({ error: "missing group" }, { status: 400 });
  const admin = supabaseAdmin();
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const now = new Date().toISOString();

  const { data: docs } = await admin.from("signable_documents").select("*").eq("packet_group", b.group).order("packet_seq");
  if (!docs || docs.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (b.op === "viewed") {
    await admin.from("signable_documents").update({ status: "viewed", viewed_at: now, viewed_ip: ip }).eq("packet_group", b.group).eq("status", "sent");
    return NextResponse.json({ ok: true });
  }

  // Sign all docs in the group.
  const lead_id = docs[0].lead_id;
  let tokens: Record<string, string> = {};
  try {
    const { data: lead } = await admin.from("leads").select("*").eq("id", lead_id).maybeSingle();
    const { data: claim } = await admin.from("claims").select("answers").eq("lead_id", lead_id).limit(1).maybeSingle();
    const { retainerTokens } = await import("@/lib/retainer-tokens");
    tokens = retainerTokens(lead, claim?.answers ?? {});
  } catch {}

  for (const doc of docs) {
    const docHash = await sha256Hex((doc.body_html || doc.title || "") + "|" + (doc.envelope_id || ""));
    let completedUrl: string | null = null;
    if (doc.pdf_template_id) {
      try {
        const { data: tpl } = await admin.from("pdf_templates").select("file_path, fields").eq("id", doc.pdf_template_id).maybeSingle();
        if (tpl?.file_path) {
          const { data: file } = await admin.storage.from("retainer-pdfs").download(tpl.file_path);
          if (file) {
            const srcBytes = new Uint8Array(await file.arrayBuffer());
            const { stampPdf } = await import("@/lib/pdf-stamp");
            const stamped = await stampPdf({ sourceBytes: srcBytes, fields: tpl.fields || [], signaturePng: b.signature_data || null, signerName: b.signed_name || doc.signer_name || "Client", signedDate: new Date(now), tokens });
            const cpath = `${doc.firm_id || "master"}/signed-${doc.envelope_id}.pdf`;
            const up = await admin.storage.from("signed-docs").upload(cpath, stamped, { contentType: "application/pdf", upsert: true });
            if (!up.error) { const { data: pub } = admin.storage.from("signed-docs").getPublicUrl(cpath); completedUrl = pub?.publicUrl || null; }
          }
        }
      } catch {}
    }
    await admin.from("signable_documents").update({
      status: "signed", signed_at: now, signature_data: b.signature_data || null,
      signed_name: b.signed_name || null, signature_type: b.signature_type || "drawn",
      signed_ip: ip, doc_hash: docHash, completed_pdf_url: completedUrl,
    }).eq("id", doc.id);
  }

  // Route the file forward (first doc carries the lead; set the signed status).
  try {
    const { setClaimStatusForLeads } = await import("@/lib/claim-status");
    await setClaimStatusForLeads({ leadIds: [lead_id], status: "signed_grievous" });
  } catch {}

  return NextResponse.json({ ok: true, signed: docs.length });
}
