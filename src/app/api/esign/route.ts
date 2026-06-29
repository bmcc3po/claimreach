import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getEsignAccount, createSignwellDocument, createSignwellFromPdf } from "@/lib/signwell";
import { recordAudit } from "@/lib/audit";
export const runtime = "edge";

// POST { op:'send_retainer', retainer_id, signer_name, signer_email, signer_phone, send_via }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id, full_name").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin", "agent", "qa", "manager"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json();
  const admin = supabaseAdmin();

  if (b.op === "send_retainer") {
    const { data: ret } = await admin.from("retainers").select("*, leads(id, firm_id, grievous_approved, first_name, last_name, claimant_name, phone, email)").eq("id", b.retainer_id).maybeSingle();
    if (!ret) return NextResponse.json({ error: "retainer not found" }, { status: 404 });
    const lead = ret.leads;

    // Grievous gate: block send unless approved (owner/admin override handled in UI)
    if (!lead?.grievous_approved && !["owner", "admin"].includes(me.role)) {
      return NextResponse.json({ error: "Grievous has not approved this file yet." }, { status: 200 });
    }

    const acct = await getEsignAccount(lead?.firm_id ?? me.firm_id);
    if (!acct) return NextResponse.json({ error: "No SignWell account configured. Add one in Integrations." }, { status: 200 });

    const signerName = b.signer_name || lead?.claimant_name || `${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`.trim() || "Client";
    const signerEmail = b.signer_email || lead?.email;
    const signerPhone = b.signer_phone || lead?.phone;
    if (!signerEmail) return NextResponse.json({ error: "A signer email is required for SignWell." }, { status: 200 });

    const html = `<html><body style="font-family:Georgia,serif;line-height:1.6;padding:40px;">${(ret.rendered_body || "").replace(/\n/g, "<br>")}</body></html>`;
    const res = await createSignwellDocument({
      apiKey: acct.api_key, testMode: acct.test_mode,
      name: `Retainer - ${signerName}`,
      subject: "Your retainer agreement is ready to sign",
      message: "Please review and sign your retainer agreement. Reach out with any questions.",
      html, signerName, signerEmail,
      withSignaturePage: true,
      metadata: { claimreach_retainer_id: ret.id, claimreach_lead_id: lead?.id },
    });
    if ((res as any).error) return NextResponse.json({ error: (res as any).error }, { status: 200 });

    await admin.from("retainers").update({
      status: "sent", sent_at: new Date().toISOString(), provider: "signwell",
      provider_ref: (res as any).id, signing_url: (res as any).signing_url,
      signer_name: signerName, signer_email: signerEmail, signer_phone: signerPhone,
      sent_via: b.send_via || "email",
    }).eq("id", ret.id);

    // SMS the signing link too (SignWell emails automatically; we add the text)
    if ((b.send_via === "sms" || b.send_via === "both") && signerPhone) {
      try {
        await fetch(new URL("/api/justcall/action", req.url).toString(), {
          method: "POST", headers: { "Content-Type": "application/json", "cookie": req.headers.get("cookie") || "" },
          body: JSON.stringify({ op: "sms", lead_id: lead?.id, to: signerPhone, body: `Your retainer is ready to sign. Check your email (${signerEmail}) for the secure link from SignWell.` }),
        });
      } catch {}
    }

    await recordAudit({ firm_id: lead?.firm_id ?? me.firm_id, lead_id: lead?.id, actor: auth.user.id, actor_name: me.full_name, category: "retainer", description: `Sent retainer for signature via SignWell to ${signerName} (${b.send_via || "email"}).` });

    return NextResponse.json({ ok: true, signing_url: (res as any).signing_url });
  }

  if (b.op === "send_pdf_retainer") {
    // b: { lead_id, pdf_template_id, signer_name, signer_email, signer_phone, send_via, page_dims, certified }
    const { data: lead } = await admin.from("leads").select("id, firm_id, grievous_approved, first_name, last_name, claimant_name, phone, email").eq("id", b.lead_id).maybeSingle();
    if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
    const ownerAdmin = ["owner", "admin"].includes(me.role);
    if (!lead.grievous_approved && !ownerAdmin && !(b.override && ownerAdmin)) {
      return NextResponse.json({ error: "Grievous has not approved this file yet. Run a Grievous review or use owner override." }, { status: 200 });
    }

    const { data: tplFor } = await admin.from("pdf_templates").select("*").eq("id", b.pdf_template_id).maybeSingle();
    if (!tplFor) return NextResponse.json({ error: "PDF template not found." }, { status: 404 });

    const signerNameP = b.signer_name || lead.claimant_name || `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "Client";
    const signerPhoneP = b.signer_phone || lead.phone;

    // ---- IN-HOUSE (non-certified) PDF path: create a signable doc that the
    // public sign page renders as a PDF, signs, stamps, and certifies in-house.
    if (b.certified === false || b.method === "builtin") {
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      const senderIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
      const { data: sig, error: sigErr } = await admin.from("signable_documents").insert({
        firm_id: lead.firm_id ?? me.firm_id, lead_id: lead.id, title: tplFor.name || "Retainer",
        doc_type: "retainer", certified: false, provider: "builtin",
        pdf_template_id: tplFor.id, signer_name: signerNameP, signer_email: b.signer_email || lead.email, signer_phone: signerPhoneP,
        status: "sent", sent_at: new Date().toISOString(), envelope_id: `CR-${rand}`, sender_ip: senderIp,
        created_by: auth.user.id,
      }).select("id, envelope_id").single();
      if (sigErr) return NextResponse.json({ error: sigErr.message }, { status: 500 });

      const link = `${new URL(req.url).origin}/sign/${sig.id}`;
      if ((b.send_via === "sms" || b.send_via === "both") && signerPhoneP) {
        try {
          await fetch(new URL("/api/justcall/action", req.url).toString(), {
            method: "POST", headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify({ action: "send_sms", to: signerPhoneP, body: `Please review and sign your retainer: ${link}` }),
          });
        } catch {}
      }
      try {
        const { recordAudit } = await import("@/lib/audit");
        await recordAudit({ firm_id: lead.firm_id, lead_id: lead.id, actor: auth.user.id, category: "retainer", description: `Sent PDF retainer "${tplFor.name}" via in-house e-sign (envelope ${sig.envelope_id}).` });
      } catch {}
      return NextResponse.json({ ok: true, id: sig.id, link, envelope_id: sig.envelope_id });
    }

    // ---- CERTIFIED (SignWell) path ----
    const acct = await getEsignAccount(lead.firm_id ?? me.firm_id);
    if (!acct) return NextResponse.json({ error: "No SignWell account configured." }, { status: 200 });

    const { data: tpl } = await admin.from("pdf_templates").select("*").eq("id", b.pdf_template_id).maybeSingle();
    if (!tpl) return NextResponse.json({ error: "PDF template not found." }, { status: 404 });

    // download the PDF from storage, base64-encode
    const { data: file } = await admin.storage.from("retainer-pdfs").download(tpl.file_path);
    if (!file) return NextResponse.json({ error: "Could not load the PDF file." }, { status: 200 });
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ""; buf.forEach((x) => { bin += String.fromCharCode(x); });
    const pdfBase64 = btoa(bin);

    const signerName = b.signer_name || lead.claimant_name || `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "Client";
    const signerEmail = b.signer_email || lead.email;
    const signerPhone = b.signer_phone || lead.phone;
    if (!signerEmail) return NextResponse.json({ error: "A signer email is required." }, { status: 200 });

    const res = await createSignwellFromPdf({
      apiKey: acct.api_key, testMode: acct.test_mode,
      name: tpl.name || "Retainer", subject: "Your retainer agreement is ready to sign",
      message: "Please review and sign your retainer agreement.",
      pdfBase64, fileName: tpl.file_name || "retainer.pdf",
      placed: tpl.fields || [],
      pageDims: tpl.page_dims || {},
      client: { name: signerName, email: signerEmail },
      agent: { name: me.full_name || "Agent", email: `agent+${me.firm_id}@claimreach.com` },
      metadata: { claimreach_lead_id: lead.id, claimreach_pdf_template: tpl.id },
    });
    if ((res as any).error) return NextResponse.json({ error: (res as any).error }, { status: 200 });

    // record on a retainer row so status flows back through the same webhook
    const { data: ret } = await admin.from("retainers").insert({
      lead_id: lead.id, status: "sent", sent_at: new Date().toISOString(), provider: "signwell",
      provider_ref: (res as any).id, signing_url: (res as any).signing_url,
      signer_name: signerName, signer_email: signerEmail, signer_phone: signerPhone, sent_via: b.send_via || "email",
      rendered_body: `[PDF template: ${tpl.name}]`,
    }).select("id").single();
    // re-tag the SignWell metadata retainer id by updating (best-effort; webhook also matches lead)
    if (ret?.id) await admin.from("retainers").update({ audit: { signwell_id: (res as any).id } }).eq("id", ret.id);

    if ((b.send_via === "sms" || b.send_via === "both") && signerPhone) {
      try {
        await fetch(new URL("/api/justcall/action", req.url).toString(), {
          method: "POST", headers: { "Content-Type": "application/json", "cookie": req.headers.get("cookie") || "" },
          body: JSON.stringify({ op: "sms", lead_id: lead.id, to: signerPhone, body: `Your retainer is ready to sign. Check your email (${signerEmail}) for the secure link.` }),
        });
      } catch {}
    }
    await recordAudit({ firm_id: lead.firm_id ?? me.firm_id, lead_id: lead.id, actor: auth.user.id, actor_name: me.full_name, category: "retainer", description: `Sent PDF retainer "${tpl.name}" for signature via SignWell to ${signerName}.` });
    return NextResponse.json({ ok: true, signing_url: (res as any).signing_url });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}