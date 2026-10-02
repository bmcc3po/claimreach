import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { resolveMatter } from "@/lib/matter";
import { confirmedFirmDeliveryAt } from "@/lib/firm-delivery-state";
import { setClaimStatusForLeads } from "@/lib/claim-status";

export const runtime = "edge";
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "")) ? String(value) : "";
const email = (value: unknown) => String(value || "").trim().toLowerCase();

// This records an email the owner already sent outside ClaimReach. It never
// calls the mail provider, and it never masquerades as an app-sent packet.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const user = await gateUser(sb);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner" || !user.can("claims.status")) return NextResponse.json({ error: "Only the owner can record an outside firm delivery." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const leadId = uuid(body.lead_id), claimId = uuid(body.claim_id);
  const finishExisting = body.op === "finish-existing";
  const sentAt = String(body.sent_at || "");
  let sentMs = Date.parse(sentAt);
  const note = String(body.evidence_note || "").trim();
  if (!leadId || !claimId || body.confirmed !== true || (!finishExisting && (!Number.isFinite(sentMs) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(sentAt) ||
    sentMs > Date.now() + 60_000 || sentMs < Date.now() - 366 * 86400000 || note.length < 10 || note.length > 500))) {
    return NextResponse.json({ error: "Confirm the actual send time, recipient, and sent-email evidence (10–500 characters)." }, { status: 400 });
  }
  const { data: lead, error: leadError } = await sb.from("leads").select("id,firm_id,campaign_id,archived_at").eq("id", leadId).maybeSingle();
  if (leadError || !lead) return NextResponse.json({ error: "File unavailable." }, { status: 404 });
  if (lead.archived_at) return NextResponse.json({ error: "Restore this file before recording delivery." }, { status: 409 });
  const admin = supabaseAdmin();
  const matter = await resolveMatter(sb, leadId, { claimId, campaignId: lead.campaign_id, authoritativeDb: admin });
  if (!matter.ok) return NextResponse.json({ error: matter.error }, { status: matter.status });
  const claim = matter.claim;
  if (claim.firm_id !== lead.firm_id || claim.claim_type !== "mva" || claim.campaign !== "INNO MVA" || !["signed_grievous", "signed_qa", "signed_wip", "signed_approved", "delivered"].includes(String(claim.status || ""))) {
    return NextResponse.json({ error: "This is not a signed INNO MVA matter awaiting firm-delivery reconciliation." }, { status: 409 });
  }
  const [campaign, owners, signed, history, dispatch] = await Promise.all([
    admin.from("campaigns").select("id,firm_id,firm_email").eq("id", claim.campaign_id).maybeSingle(),
    admin.from("app_users").select("email").eq("role", "owner").eq("active", true),
    admin.from("esign_submissions").select("signed_at,voided_at").eq("lead_id", leadId).eq("claim_id", claimId).limit(100),
    admin.from("firm_deliveries").select("id,ok,to_email,cc_email,created_at,triggered_by").eq("claim_id", claimId).eq("lead_id", leadId).eq("firm_id", lead.firm_id).eq("ok", true),
    admin.from("firm_delivery_dispatch").select("state").eq("claim_id", claimId).maybeSingle(),
  ]);
  if (campaign.error || owners.error || signed.error || history.error || dispatch.error) return NextResponse.json({ error: "Could not verify this matter's recipient and delivery history." }, { status: 503 });
  const firmTo = email(campaign.data?.firm_email);
  const ownerTo = (owners.data || []).map((row: any) => email(row.email)).find((value: string) => value === "bmc@innovativeintake.com") || "";
  if (campaign.data?.firm_id !== lead.firm_id || !firmTo || !ownerTo || firmTo === ownerTo || (!finishExisting && email(body.to_email) !== firmTo)) {
    return NextResponse.json({ error: "The actual recipient must match this matter's configured firm email. Refresh and check it." }, { status: 409 });
  }
  const priorAt = confirmedFirmDeliveryAt(history.data || [], firmTo, ownerTo);
  const priorExternal = (history.data || []).find((row: any) => row.triggered_by === "external_owner_confirmed" && email(row.to_email) === firmTo && (finishExisting || row.created_at === new Date(sentMs).toISOString()));
  const priorApp = (history.data || []).some((row: any) => row.triggered_by !== "external_owner_confirmed" &&
    [row.to_email, ...String(row.cc_email || "").split(/[,;]/)].some((value) => email(value) === firmTo));
  if (priorApp) return NextResponse.json({ error: "ClaimReach already logged delivery to this firm. Refresh the file before reconciling it." }, { status: 409 });
  if (finishExisting) {
    if (!priorExternal) return NextResponse.json({ error: "No previously recorded outside delivery needs repair." }, { status: 409 });
    sentMs = Date.parse(priorExternal.created_at);
  }
  const firstSignature = (signed.data || []).filter((row: any) => row.signed_at && !row.voided_at).map((row: any) => String(row.signed_at)).sort()[0];
  if ((signed.data || []).length >= 100 || !firstSignature || sentMs < Date.parse(firstSignature)) return NextResponse.json({ error: "The recorded firm send cannot predate the client's verified signature." }, { status: 409 });
  if (["sending", "uncertain"].includes(dispatch.data?.state || "")) return NextResponse.json({ error: "An app delivery is unresolved. Reconcile that attempt before recording an outside send." }, { status: 409 });
  if (priorAt && !priorExternal) return NextResponse.json({ error: "Firm delivery is already recorded for this matter. Refresh the file." }, { status: 409 });

  // The distinct trigger names owner-attested external evidence. No PDF is
  // claimed as an attachment here because ClaimReach did not send this email.
  const logged = priorExternal ? { data: priorExternal, error: null } : await admin.from("firm_deliveries").insert({ lead_id: leadId, claim_id: claimId,
    firm_id: lead.firm_id, campaign_id: claim.campaign_id, to_email: firmTo, cc_email: null,
    subject: "Outside firm email confirmed by owner", attachments: [], ok: true,
    triggered_by: "external_owner_confirmed", actor_name: user.name || "Owner", created_at: new Date(sentMs).toISOString(),
  }).select("id").single();
  if (logged.error || !logged.data) return NextResponse.json({ error: "The outside delivery evidence did not save; no status changed." }, { status: 503 });
  const changed = claim.status === "delivered" ? { ok: true } : await setClaimStatusForLeads({ leadIds: [leadId], claimIds: [claimId],
    status: "delivered", expectedStatus: claim.status, actorId: user.id, actorName: user.name || "Owner", historical: true, suppressAutoDelivery: true });
  if (!changed.ok) return NextResponse.json({ error: `Outside delivery was recorded, but the status did not update: ${changed.error}. Refresh and contact the owner before retrying.`, recorded: true }, { status: 503 });
  const [claimUpdate, leadUpdate, activity] = await Promise.all([
    admin.from("claims").update({ firm_sent_at: new Date(sentMs).toISOString(), firm_send_result: "outside email confirmed by owner" }).eq("id", claimId).eq("lead_id", leadId),
    admin.from("leads").update({ firm_sent_at: new Date(sentMs).toISOString(), firm_send_result: "outside email confirmed by owner", stage: "sent_to_firm" }).eq("id", leadId).eq("firm_id", lead.firm_id),
    admin.from("lead_activity").insert({ firm_id: lead.firm_id, lead_id: leadId, kind: "system", actor: user.id,
      body: "Owner recorded that the signed packet was emailed to the firm outside ClaimReach.",
      meta: { event: finishExisting ? "external_firm_delivery_repaired" : "external_firm_delivery", claim_id: claimId, firm_email: firmTo, sent_at: new Date(sentMs).toISOString(), evidence_note: finishExisting ? "Recovered the previously recorded outside delivery." : note, actor_name: user.name || "Owner", delivery_id: logged.data.id },
    }),
  ]);
  if (claimUpdate.error || leadUpdate.error || activity.error) return NextResponse.json({ error: "Outside delivery was recorded, but a file or audit update needs review. Refresh the file; do not send it again.", recorded: true }, { status: 503 });
  return NextResponse.json({ ok: true, sent_at: new Date(sentMs).toISOString(), to: firmTo, message: "Outside firm delivery recorded. The seven-day return window now uses the actual send time. No email was sent by ClaimReach." });
}
