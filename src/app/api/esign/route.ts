import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { resolveSigningMatter, getMatterAgreement } from "@/lib/mva-call/signing-matter";
import { createEmergencyPacket } from "@/lib/emergency-signing";
import { recordAudit } from "@/lib/audit";
export const runtime = "edge";

// Primary signing is /api/calls/esign (DocuSeal). Explicit emergency only.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id, full_name, active").eq("id", auth.user.id).maybeSingle();
  if (!me || me.active === false || !["owner", "admin", "agent", "qa", "manager"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (b?.op !== "send_packet" || b?.method !== "builtin" || b?.certified === true) return NextResponse.json({ error: "Use DocuSeal for the primary agreement. For an emergency, explicitly choose In-house emergency and record the reason." }, { status: 409 });
  if (!String(b.emergency_reason || "").trim()) return NextResponse.json({ error: "Record why emergency signing is needed." }, { status: 400 });
  const context = await resolveSigningMatter(sb, String(b.lead_id || ""), { claimId: b.claim_id });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.campaignId) return NextResponse.json({ error: "Choose this matter's campaign first." }, { status: 409 });
  const camp = await sb.from("campaigns").select("id, firm_id, retainer_packet, retainer_template_id").eq("id", context.campaignId).maybeSingle();
  if (camp.error || !camp.data || (camp.data.firm_id && camp.data.firm_id !== context.lead.firm_id)) return NextResponse.json({ error: "This matter's campaign could not be verified." }, { status: 409 });
  const allowed = await sb.from("campaign_retainers").select("id, label, kind, template_id, is_default").eq("campaign_id", context.campaignId).eq("active", true).order("sort");
  if (allowed.error) return NextResponse.json({ error: "Could not read this campaign's emergency packet." }, { status: 503 });
  let documents: any[] = [];
  if (allowed.data?.length) {
    const chosen = b.retainer_id ? allowed.data.find((r: any) => r.id === b.retainer_id) : allowed.data.find((r: any) => r.is_default) || (allowed.data.length === 1 ? allowed.data[0] : null);
    if (!chosen) return NextResponse.json({ error: "Choose an emergency agreement configured for this campaign." }, { status: 400 });
    documents = [{ kind: chosen.kind, id: chosen.template_id, label: chosen.label }];
  } else documents = Array.isArray(camp.data.retainer_packet) ? camp.data.retainer_packet : [];
  if (!documents.length && camp.data.retainer_template_id) {
    const pdf = await sb.from("pdf_templates").select("id").eq("id", camp.data.retainer_template_id).maybeSingle();
    if (pdf.error) return NextResponse.json({ error: "Could not read the emergency template." }, { status: 503 });
    documents = [{ kind: pdf.data ? "pdf" : "text", id: camp.data.retainer_template_id, label: "Retainer" }];
  }
  if (!documents.length) return NextResponse.json({ error: "This campaign has no emergency packet configured. Add its approved documents in campaign setup." }, { status: 409 });
  const current = await getMatterAgreement(sb, context.lead, context.matter);
  if (!current.ok) return NextResponse.json({ error: current.error }, { status: current.status });
  const signerName = String(b.signer_name || context.lead.claimant_name || "").trim();
  const email = String(b.signer_email || context.lead.email || "").trim();
  const phone = String(b.signer_phone || context.lead.phone || "").trim();
  if (!signerName) return NextResponse.json({ error: "Add the signer's full name." }, { status: 400 });
  if (["sms", "both"].includes(b.send_via) && context.lead.perm_text === false) return NextResponse.json({ error: "This person asked not to receive texts." }, { status: 409 });
  if (["email", "both"].includes(b.send_via) && context.lead.perm_email === false) return NextResponse.json({ error: "This person asked not to receive email." }, { status: 409 });
  try {
    const packet = await createEmergencyPacket(supabaseAdmin(), context, { documents, signerName, email, phone, actorId: auth.user.id,
      senderIp: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
      reason: String(b.emergency_reason).trim().slice(0, 1000), replacesAgreementId: current.row?.id });
    const link = `${new URL(req.url).origin}/sign/packet/${packet.group}`;
    const results: string[] = [];
    if (["sms", "both"].includes(b.send_via) && phone) {
      try {
        const res = await fetch(new URL("/api/justcall/action", req.url), { method: "POST", headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
          body: JSON.stringify({ op: "sms", lead_id: context.lead.id, to: phone, body: `Please review your emergency agreement: ${link}` }) });
        const result = await res.json().catch(() => ({}));
        results.push(res.ok && !result.error ? "texted" : `text failed: ${result.error || res.status}`);
      } catch { results.push("text failed"); }
    }
    if (["email", "both"].includes(b.send_via) && email) {
      const { sendEmail, signingEmailHtml } = await import("@/lib/email");
      const result = await sendEmail({ to: email, subject: "Your emergency agreement is ready to review", html: signingEmailHtml({ clientName: signerName, link, message: "This is the in-house emergency agreement. A DocuSeal re-sign may follow." }) });
      results.push(result.ok ? "emailed" : `email failed: ${result.error}`);
    }
    await recordAudit({ firm_id: context.lead.firm_id, lead_id: context.lead.id, actor: auth.user.id, category: "retainer",
      description: `Issued emergency agreement (${documents.length} documents). DocuSeal re-sign required. Reason: ${String(b.emergency_reason).slice(0, 300)}`,
      meta: { claim_id: context.matter.claim.id, packet_group: packet.group, primary_agreement_id: current.row?.id || null } });
    return NextResponse.json({ ok: true, packet_group: packet.group, claim_id: context.matter.claim.id, link, doc_count: documents.length,
      needs_resign: true, delivered: results.join(", ") || "Link created; no message sent." });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "The emergency packet could not be created." }, { status: 409 }); }
}
