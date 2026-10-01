import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { deliverLeadToFirm, matterSendState } from "@/lib/firm-delivery";
import { resolveMatter, matterRowsFilter } from "@/lib/matter";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { readFirmDispatch } from "@/lib/firm-delivery-dispatch";
import { recordAudit } from "@/lib/audit";
import { confirmedFirmDeliveryAt } from "@/lib/firm-delivery-state";
export const runtime = "edge";

const uuid = (x: any) => String(x || "").replace(/[^0-9a-f-]/gi, "");

// GET /api/firm-delivery?lead_id=...&claim_id=...
//   -> ONE matter's delivery state and history. Without claim_id, the file's
//      single matter (or the single matter on its campaign); several matters
//      and none named is a 409, never a guess (Astra round 7b #57).
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isInternalRole(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const leadId = uuid(sp.get("lead_id"));
  const claimId = uuid(sp.get("claim_id")) || null;
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: lead, error: leadErr } = await sb.from("leads").select("id, firm_id, campaign_id, firm_sent_at, firm_send_result").eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ error: `Could not read the file: ${leadErr.message}` }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const m = await resolveMatter(sb, leadId, { claimId, campaignId: lead.campaign_id ?? null, authoritativeDb: admin });
  if (!m.ok) return NextResponse.json({ error: m.error, ambiguous: !!m.ambiguous, candidates: m.candidates }, { status: m.status });
  if (m.claim.firm_id && m.claim.firm_id !== lead.firm_id) return NextResponse.json({ error: "This matter and file belong to different firms." }, { status: 409 });
  const matter = { claim: m.claim, sole: m.sole };
  const st = await matterSendState(admin, lead, matter);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: 500 });
  const { data: history, error: hErr } = await admin.from("firm_deliveries").select("*")
    .eq("lead_id", leadId).or(matterRowsFilter(matter)).order("created_at", { ascending: false });
  if (hErr) return NextResponse.json({ error: `Could not read the delivery history: ${hErr.message}` }, { status: 500 });
  const dispatch = await readFirmDispatch(admin, leadId, m.claim.id);
  if (dispatch.error) return NextResponse.json({ error: `Could not read the delivery reservation: ${dispatch.error}` }, { status: 500 });
  const campaignId = m.claim.campaign_id ?? (m.sole ? lead.campaign_id : null);
  const config = campaignId ? await sb.from("campaigns").select("name, firm_id, firm_email, firm_cc, firm_delivery_on").eq("id", campaignId).maybeSingle() : { data: null, error: null };
  const firm = lead.firm_id ? await sb.from("firms").select("name").eq("id", lead.firm_id).maybeSingle() : { data: null, error: null };
  if (config.error || firm.error) return NextResponse.json({ error: "Could not read the delivery recipient. Refresh before sending." }, { status: 500 });
  if (config.data?.firm_id && config.data.firm_id !== lead.firm_id) return NextResponse.json({ error: "This matter's campaign belongs to a different firm." }, { status: 409 });
  const { data: owners, error: ownerErr } = await sb.from("app_users").select("email").eq("role", "owner").eq("active", true);
  if (ownerErr) return NextResponse.json({ error: "Could not verify the owner recipient." }, { status: 500 });
  const ownerEmail = (owners ?? []).map((row: any) => String(row.email || "").toLowerCase()).find((email: string) => email === "bmc@innovativeintake.com") ?? null;
  const confirmedAt = confirmedFirmDeliveryAt(history ?? [], config.data?.firm_email, ownerEmail);
  const { data: latestQa, error: qaErr } = await sb.from("qa_reviews").select("decision, reviewer")
    .eq("claim_id", m.claim.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (qaErr) return NextResponse.json({ error: "Could not verify the signed-file QA decision." }, { status: 500 });
  return NextResponse.json({
    claim_id: m.claim.id,
    firm_sent_at: st.state.sentAt,
    confirmed_firm_sent_at: confirmedAt,
    prior_owner_only: !!st.state.sentAt && !confirmedAt && (history ?? []).some((row: any) => row.ok === true && String(row.to_email || "").toLowerCase() === ownerEmail),
    firm_send_result: st.state.result,
    legacy: st.state.legacy,
    history: history ?? [],
    dispatch: dispatch.row,
    can_reconcile: ["owner", "admin"].includes(g.role),
    qa_approved: latestQa?.decision === "approve" && (g.role !== "agent" || latestQa.reviewer === g.id)
      && ["signed_approved", "delivered", "retained"].includes(String(m.claim.status || "")),
    delivery: { firm: firm.data?.name ?? null, campaign: config.data?.name ?? null, to: config.data?.firm_email ?? null, cc: config.data?.firm_cc ?? null, owner_email: ownerEmail, auto_on: config.data?.firm_delivery_on === true },
  });
}

// POST /api/firm-delivery  { lead_id, claim_id?, force? }  -> manual send / resend
// of ONE matter: the claim the screen is showing.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Sending a file to the firm is an internal, status-moving action. A firm
  // login could otherwise trigger delivery of any lead id it guessed (Astra
  // audit, Sep 27): internal roles only, plus the claims.status permission.
  if (!isInternalRole(g.role) || !g.can("claims.status")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const leadId = uuid(b?.lead_id);
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const { data: leadRow, error: leadErr } = await sb.from("leads").select("id, firm_id, campaign_id").eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ error: `Could not read the file: ${leadErr.message}` }, { status: 500 });
  if (!leadRow) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const matter = await resolveMatter(sb, leadId, { claimId: uuid(b?.claim_id) || null, campaignId: leadRow.campaign_id ?? null, authoritativeDb: supabaseAdmin() });
  if (!matter.ok) return NextResponse.json({ error: matter.error }, { status: matter.status });
  if (matter.claim.firm_id && matter.claim.firm_id !== leadRow.firm_id) return NextResponse.json({ error: "This matter and file belong to different firms." }, { status: 409 });
  if (g.role === "agent" && b?.include_owner !== true) return NextResponse.json({ error: "Use the final handoff to send the complete packet to Brett and the firm together." }, { status: 403 });
  if (g.role === "agent") {
    const [{ data: ownCall, error: callErr }, { data: latestQa, error: qaErr }] = await Promise.all([
      sb.from("intake_calls").select("id").eq("lead_id", leadId).eq("claim_id", matter.claim.id)
        .eq("agent_id", g.id).eq("disposition", "signed").not("ended_at", "is", null).limit(1).maybeSingle(),
      sb.from("qa_reviews").select("reviewer, decision").eq("claim_id", matter.claim.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (callErr || qaErr) return NextResponse.json({ error: "Could not verify the completed call and QA review. Nothing was emailed." }, { status: 503 });
    if (!ownCall || latestQa?.reviewer !== g.id || latestQa?.decision !== "approve") {
      return NextResponse.json({ error: "End and disposition your signed call, then approve your own file review before sending. Nothing was emailed." }, { status: 409 });
    }
  }

  if (b.op === "reconcile") {
    if (!["owner", "admin"].includes(g.role)) return NextResponse.json({ error: "Only an owner or admin can reconcile a delivery." }, { status: 403 });
    const claimId = uuid(b.claim_id);
    const attemptKey = String(b.attempt_key || "");
    const note = String(b.note || "").trim();
    if (!claimId || !/^[0-9a-f-]{36}$/i.test(attemptKey) || typeof b.delivered !== "boolean" || note.length < 10) {
      return NextResponse.json({ error: "Name the matter and attempt, confirm whether the provider delivered it, and explain the check (at least 10 characters)." }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin().rpc("reconcile_firm_delivery", {
      p_lead_id: leadId, p_claim_id: claimId, p_attempt_key: attemptKey,
      p_delivered: b.delivered, p_actor_id: g.id, p_note: note,
    });
    if (error) return NextResponse.json({ error: `Delivery was not reconciled: ${error.message}` }, { status: 409 });
    if (data !== true) return NextResponse.json({ error: "That attempt is no longer awaiting reconciliation. Refresh the file." }, { status: 409 });
    await recordAudit({ firm_id: leadRow.firm_id, lead_id: leadId, claim_id: claimId, actor: g.id, actor_name: g.name || undefined,
      category: "system", description: `Delivery reconciled as ${b.delivered ? "delivered" : "not delivered"}: ${note}`,
      meta: { attempt_key: attemptKey, delivered: b.delivered, note } });
    return NextResponse.json({ ok: true, reconciled: true, delivered: b.delivered, message: "Delivery outcome recorded. No email was sent by this action." });
  }

  let correctedOwnerOnly = false;
  if (b?.include_owner === true) {
    const admin = supabaseAdmin();
    const [{ data: config }, { data: owners }, { data: history, error: historyError }] = await Promise.all([
      admin.from("campaigns").select("firm_email").eq("id", matter.claim.campaign_id).maybeSingle(),
      admin.from("app_users").select("email").eq("role", "owner").eq("active", true),
      admin.from("firm_deliveries").select("ok, to_email, cc_email, created_at").eq("claim_id", matter.claim.id).order("created_at", { ascending: false }),
    ]);
    if (historyError) return NextResponse.json({ error: "Could not verify prior delivery; nothing was resent." }, { status: 503 });
    const ownerEmail = (owners ?? []).map((row: any) => String(row.email || "").toLowerCase()).find((address: string) => address === "bmc@innovativeintake.com") || null;
    if (ownerEmail && !confirmedFirmDeliveryAt(history ?? [], config?.firm_email, ownerEmail)) {
      correctedOwnerOnly = (history ?? []).some((row: any) => row.ok === true && String(row.to_email || "").toLowerCase() === ownerEmail);
    }
  }
  if (b?.force && g.role === "agent") return NextResponse.json({ error: "Agents cannot force a resend." }, { status: 403 });
  const res = await deliverLeadToFirm({
    leadId,
    claimId: matter.claim.id,
    triggeredBy: "manual",
    actorName: g.name || "User",
    force: correctedOwnerOnly || !!b?.force,
    expectedTo: typeof b?.expected_to === "string" ? b.expected_to : undefined,
    expectedCc: Array.isArray(b?.expected_cc) ? b.expected_cc : undefined,
    includeOwner: b?.include_owner === true,
    additionalRecipients: Array.isArray(b?.additional_recipients) ? b.additional_recipients.map(String) : [],
  });
  if (!res.ok && !res.skipped) return NextResponse.json(res, { status: res.ambiguous ? 409 : 400 });
  return NextResponse.json(res);
}

