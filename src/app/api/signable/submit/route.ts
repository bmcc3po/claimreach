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
    .select("id, status, certified, lead_id, firm_id, retainer_id, title, signer_name, body_html, envelope_id, viewed_at, audit, pdf_template_id")
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

    // Stage 3: if this signable renders an uploaded PDF, stamp the signature
    // onto the PDF at the client field boxes, flatten, and store the result.
    let completedUrl: string | null = null;
    if (doc.pdf_template_id) {
      try {
        const { data: tpl } = await admin.from("pdf_templates").select("file_path, fields").eq("id", doc.pdf_template_id).maybeSingle();
        if (tpl?.file_path) {
          const { data: file } = await admin.storage.from("retainer-pdfs").download(tpl.file_path);
          if (file) {
            const srcBytes = new Uint8Array(await file.arrayBuffer());
            // Build the autofill token map from the lead + intake answers.
            let tokens: Record<string, string> = {};
            if (doc.lead_id) {
              try {
                const { data: lead } = await admin.from("leads").select("*").eq("id", doc.lead_id).maybeSingle();
                const { data: claim } = await admin.from("claims").select("answers").eq("lead_id", doc.lead_id).limit(1).maybeSingle();
                const { retainerTokens } = await import("@/lib/retainer-tokens");
                tokens = retainerTokens(lead, claim?.answers ?? {});
              } catch {}
            }
            const { stampPdf } = await import("@/lib/pdf-stamp");
            const signedDate = (b.lock_date === false && b.manual_date) ? new Date(b.manual_date + "T12:00:00") : new Date(now);
            const stamped = await stampPdf({
              sourceBytes: srcBytes, fields: tpl.fields || [],
              signaturePng: b.signature_data || null, signerName: b.signed_name || doc.signer_name || "Client",
              signedDate, tokens,
            });
            const cpath = `${doc.firm_id || "master"}/signed-${doc.envelope_id}.pdf`;
            const up = await admin.storage.from("signed-docs").upload(cpath, stamped, { contentType: "application/pdf", upsert: true });
            if (!up.error) {
              const { data: pub } = admin.storage.from("signed-docs").getPublicUrl(cpath);
              completedUrl = pub?.publicUrl || null;
              if (completedUrl) await admin.from("signable_documents").update({ completed_pdf_url: completedUrl }).eq("id", b.id);
            }
          }
        }
      } catch { /* stamping best-effort; signature already recorded */ }
    }
    let certUrl: string | null = null;
    try {
      const { data: full } = await admin.from("signable_documents")
        .select("envelope_id, title, signer_name, signer_email, signed_ip, sender_ip, sent_at, viewed_at, consent_at, signed_at, doc_hash, signature_type, firm_id")
        .eq("id", b.id).maybeSingle();
      if (full) {
        const { buildCertificatePdf } = await import("@/lib/certificate");
        const bytes = await buildCertificatePdf({
          envelopeId: full.envelope_id, title: full.title, signerName: full.signer_name,
          signerEmail: full.signer_email, signerIp: full.signed_ip, senderIp: full.sender_ip,
          sentAt: full.sent_at, viewedAt: full.viewed_at, consentAt: full.consent_at,
          signedAt: full.signed_at, docHash: full.doc_hash, signatureType: full.signature_type,
        });
        const path = `${full.firm_id || "master"}/cert-${full.envelope_id}.pdf`;
        const up = await admin.storage.from("signed-docs").upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (!up.error) {
          const { data: pub } = admin.storage.from("signed-docs").getPublicUrl(path);
          certUrl = pub?.publicUrl || null;
          if (certUrl) await admin.from("signable_documents").update({ cert_pdf_url: certUrl }).eq("id", b.id);
        }
      }
    } catch { /* cert is best-effort; signing already recorded */ }

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
        await admin.from("leads").update({ signed_at: now, esign_sent_at: null }).eq("id", doc.lead_id);
      }
      // Alert the dashboard: an e-sign just completed. Broadcast (no recipient).
      try {
        const { data: ld } = await admin.from("leads").select("lead_no, claimant_name, firm_id").eq("id", doc.lead_id).maybeSingle();
        await admin.from("notifications").insert({
          firm_id: ld?.firm_id ?? doc.firm_id ?? null, sender: null, sender_name: "E-Sign",
          recipient: null, lead_id: doc.lead_id,
          body: `Signed: ${ld?.claimant_name || doc.signer_name || "Client"} signed ${doc.title || "the retainer"}${ld?.lead_no ? ` (${ld.lead_no})` : ""}.`,
        });
      } catch {}
    }
    try {
      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({ firm_id: doc.firm_id, lead_id: doc.lead_id, category: "retainer", actor_name: doc.signer_name || "Client", description: `Client completed in-house e-sign of "${doc.title}" (envelope ${doc.envelope_id}). IP ${ip}.` });
    } catch {}
    return NextResponse.json({ ok: true, envelope_id: doc.envelope_id, cert_pdf_url: certUrl, completed_pdf_url: completedUrl, document_url: completedUrl || certUrl });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

// GET ?id= -> fetch the doc to render the signing page (public)
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  const admin = supabaseAdmin();
  const { data } = await admin.from("signable_documents")
    .select("id, title, body_html, status, signer_name, certified, envelope_id, pdf_template_id, cert_pdf_url, completed_pdf_url, lead_id")
    .eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  // If this signable renders an uploaded PDF, attach a temporary signed URL and
  // the placed field layout so the public page can show the document + tabs.
  let pdf: any = null;
  if (data.pdf_template_id) {
    const { data: tpl } = await admin.from("pdf_templates").select("file_path, fields, page_count, page_dims, file_name").eq("id", data.pdf_template_id).maybeSingle();
    if (tpl?.file_path) {
      const { data: signed } = await admin.storage.from("retainer-pdfs").createSignedUrl(tpl.file_path, 3600);
      // Resolve the autofill values for this signer's file so the review screen can
      // show the client exactly what data will be filled in (name, address, etc.).
      let values: Record<string, string> = {};
      try {
        if ((data as any).lead_id) {
          const { data: ld } = await admin.from("leads").select("*").eq("id", (data as any).lead_id).maybeSingle();
          const { data: claim } = await admin.from("claims").select("answers").eq("lead_id", (data as any).lead_id).limit(1).maybeSingle();
          const { retainerTokens } = await import("@/lib/retainer-tokens");
          values = retainerTokens(ld || {}, claim?.answers ?? {});
        }
      } catch {}
      pdf = { url: signed?.signedUrl || null, fields: tpl.fields || [], page_count: tpl.page_count || 1, page_dims: tpl.page_dims || {}, file_name: tpl.file_name, values };
    }
  }
  return NextResponse.json({ doc: data, pdf });
}
