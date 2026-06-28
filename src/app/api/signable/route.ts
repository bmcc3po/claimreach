import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getEsignAccount, createSignwellDocument } from "@/lib/signwell";
export const runtime = "edge";

// Manage signable documents. Two tiers:
//   certified=true  -> SignWell
//   certified=false -> built-in signing page
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const leadId = new URL(req.url).searchParams.get("lead_id");
  const { data } = await sb.from("signable_documents").select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
  return NextResponse.json({ docs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const admin = supabaseAdmin();

  if (b.op === "create") {
    const { data: lead } = await admin.from("leads").select("firm_id, claimant_name, first_name, last_name, phone, email").eq("id", b.lead_id).maybeSingle();
    const signerName = b.signer_name || lead?.claimant_name || `${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`.trim();
    const row: any = {
      firm_id: lead?.firm_id ?? me.firm_id, lead_id: b.lead_id, title: b.title || "Document",
      doc_type: b.doc_type || "other", certified: !!b.certified, body_html: b.body_html || "",
      signer_name: signerName, signer_email: b.signer_email || lead?.email, signer_phone: b.signer_phone || lead?.phone,
      status: "draft", created_by: auth.user.id,
    };

    if (b.certified) {
      const acct = await getEsignAccount(lead?.firm_id ?? me.firm_id);
      if (!acct) return NextResponse.json({ error: "No SignWell account configured." }, { status: 200 });
      if (!row.signer_email) return NextResponse.json({ error: "Signer email required for certified signing." }, { status: 200 });
      const html = `<html><body style="font-family:Georgia,serif;line-height:1.6;padding:40px;">${(b.body_html || "").replace(/\n/g, "<br>")}</body></html>`;
      const res = await createSignwellDocument({
        apiKey: acct.api_key, testMode: acct.test_mode, name: b.title || "Document",
        html, signerName, signerEmail: row.signer_email, withSignaturePage: true,
        metadata: { claimreach_signable_lead: b.lead_id },
      });
      if ((res as any).error) return NextResponse.json({ error: (res as any).error }, { status: 200 });
      row.provider = "signwell"; row.provider_ref = (res as any).id; row.signing_url = (res as any).signing_url;
      row.status = "sent"; row.sent_at = new Date().toISOString();
    } else {
      row.provider = "builtin";
    }

    const { data, error } = await admin.from("signable_documents").insert(row).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // built-in signing link (public page)
    const link = !b.certified ? `${new URL(req.url).origin}/sign/${data.id}` : row.signing_url;
    return NextResponse.json({ ok: true, id: data.id, link });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
