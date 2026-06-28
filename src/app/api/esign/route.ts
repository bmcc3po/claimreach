import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getEsignAccount, createSignwellDocument } from "@/lib/signwell";
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

    return NextResponse.json({ ok: true, signing_url: (res as any).signing_url });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
