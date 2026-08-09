import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
export const runtime = "edge";

// ============================================================================
// One route for the whole call. "Take a call" is not a separate artifact that
// gets promoted later — it opens a real lead the moment there is a real person
// on the line, then writes every answer against it as the agent goes. A dropped
// call leaves a working file to resume, not a lost one.
//
//   op=open        create the lead + claim (fired at caller details)
//   op=save        incremental answer write
//   op=disposition set the file's status through the central setter
//   op=identity    attach the retainer identity fields before signing
//   (GET)          signature status for polling while the client signs
// ============================================================================

// Resolve the console's firm. Returns what it found AND how, because silently
// falling back to the agent's own firm meant the console could spend all day
// looking for campaigns under the wrong tenant while reporting only "no
// campaign" — true, but for a firm nobody asked about.
async function resolveFirm(admin: any, slug: string | null, fallback: string | null) {
  if (slug) {
    const { data } = await admin.from("firms").select("id, name").eq("slug", slug).maybeSingle();
    if (data?.id) return { id: data.id as string, name: data.name as string, matched: true };
  }
  if (!fallback) return { id: null, name: null, matched: false };
  const { data: fb } = await admin.from("firms").select("id, name").eq("id", fallback).maybeSingle();
  return { id: fallback as string, name: (fb?.name as string) ?? null, matched: false };
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (g.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  // ---------------------------------------------------------------- open
  // A file is not allowed to exist without a case type AND a campaign. The
  // console therefore opens it at case-type selection, not at caller details:
  // one screen later, but it is the first moment we actually know what the file
  // is. If no campaign is configured for that firm and case type we refuse and
  // say so plainly rather than creating an orphan.
  if (b.op === "open") {
    const firm = await resolveFirm(admin, b.firm_slug, g.firmId);
    const firmId = firm.id;
    if (!firmId) return NextResponse.json({ error: "no firm resolved for this console" }, { status: 400 });
    if (b.firm_slug && !firm.matched) {
      return NextResponse.json({
        error: "no_campaign",
        message: `No firm is set up with the code "${b.firm_slug}". The console is configured for it but there is no matching firm record, so it cannot find that firm's campaigns. Add the firm in Settings with slug "${b.firm_slug}", then reload.`,
      }, { status: 200 });
    }
    if (!b.first_name) return NextResponse.json({ error: "first name required" }, { status: 400 });
    if (!b.case_type) return NextResponse.json({ error: "case type required" }, { status: 400 });

    const caseType = b.case_type;                       // granular picker value
    const registryKey = b.registry_key || b.case_type;   // what the campaign is keyed on
    const { data: campaign } = await admin.from("campaigns")
      .select("id, name, retainer_template_id, retainer_packet, allow_live_sign")
      .eq("firm_id", firmId).eq("case_type", registryKey).eq("active", true).limit(1).maybeSingle();

    if (!campaign) {
      // No campaign means no file, per the rule. But the call still happened, so
      // log it rather than losing it: a supervisor can attach it to a campaign
      // later and it still counts toward the agent's volume.
      await admin.from("intake_calls").insert({
        firm_id: firmId, firm_slug: b.firm_slug ?? null, agent_id: g.id, agent_name: g.name ?? null,
        caller_id: b.caller_id ?? null, first_name: b.first_name, callback: b.callback ?? null,
        call_type: b.call_type ?? null, matter: caseType,
        disposition: "CALLBACK", reason: "No active campaign for this case type at the time of the call",
      });
      return NextResponse.json({
        error: "no_campaign",
        message: `${firm.name ?? "This firm"} has no active campaign for case type "${registryKey}", so a file cannot be opened. Create one in Settings, Campaigns: firm ${firm.name ?? ""}, case type ${registryKey.toUpperCase()}, active. Then reload. The call has been logged.`,
      }, { status: 200 });
    }

    const { data: leadNo, error: mintErr } = await admin.rpc("mint_lead_no", { p_firm: firmId });
    if (mintErr) return NextResponse.json({ error: mintErr.message }, { status: 500 });

    const { data: lead, error } = await admin.from("leads").insert({
      firm_id: firmId, lead_no: leadNo, case_type: registryKey,
      campaign_id: campaign.id, campaign: campaign.name,
      first_name: b.first_name, claimant_name: b.first_name,
      phone: b.callback ?? null, stage: "referral_received", origin: "console",
      created_by: g.id, assigned_agent: g.id,
    }).select("id, lead_no").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: claim } = await admin.from("claims").insert({
      firm_id: firmId, lead_id: lead.id, claim_type: registryKey,
      campaign: campaign.name, status: "contacting", answers: {},
    }).select("id").single();

    // Log the call alongside the file so the caller ID still ties to the recording.
    const { data: call } = await admin.from("intake_calls").insert({
      firm_id: firmId, firm_slug: b.firm_slug ?? null, agent_id: g.id, agent_name: g.name ?? null,
      caller_id: b.caller_id ?? null, first_name: b.first_name, callback: b.callback ?? null,
      call_type: b.call_type ?? null, matter: caseType, lead_id: lead.id,
      promoted_at: new Date().toISOString(),
    }).select("id").single();

    try {
      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({
        firm_id: firmId, lead_id: lead.id, actor: g.id, actor_name: g.name ?? "Agent",
        category: "system", description: `File opened live on an inbound call.`,
      });
    } catch {}

    // Only retainers tagged to this campaign are offerable.
    const { data: allowedRetainers } = await admin.from("campaign_retainers")
      .select("id, label, kind, is_default").eq("campaign_id", campaign.id).eq("active", true).order("sort");
    const hasPacket = (allowedRetainers ?? []).length > 0
      || !!((Array.isArray(campaign.retainer_packet) && campaign.retainer_packet.length) || campaign.retainer_template_id);
    return NextResponse.json({
      ok: true, lead_id: lead.id, lead_no: lead.lead_no, claim_id: claim?.id ?? null, call_id: call?.id ?? null,
      campaign: campaign?.name ?? null,
      retainers: allowedRetainers ?? [],
      can_send_retainer: !!(campaign && hasPacket && campaign.allow_live_sign),
      retainer_blocker: !campaign
        ? "No active campaign for this firm and case type, so there is no retainer to send."
        : !hasPacket ? `The ${campaign.name} campaign has no retainer packet configured.`
        : !campaign.allow_live_sign ? `The ${campaign.name} campaign is not enabled for signing live on a call.`
        : null,
    });
  }

  // ---------------------------------------------------------------- save
  // Fired after every answer. Cheap, idempotent, and the reason a dropped call
  // still leaves a usable file.
  if (b.op === "save") {
    if (!b.claim_id) return NextResponse.json({ error: "claim_id required" }, { status: 400 });
    const patch: any = { answers: b.answers ?? {} };
    if (b.summary) patch.case_summary = b.summary;
    const { error } = await admin.from("claims").update(patch).eq("id", b.claim_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (b.call_id) {
      await admin.from("intake_calls").update({ answers: b.answers ?? {}, summary: b.summary ?? null }).eq("id", b.call_id);
    }
    return NextResponse.json({ ok: true });
  }

  // ---------------------------------------------------------------- identity
  // Full legal identity for the retainer. Captured only once the file qualifies.
  if (b.op === "identity") {
    if (!b.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const c = b.client ?? {};
    const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    const { error } = await admin.from("leads").update({
      first_name: c.first_name ?? null, last_name: c.last_name ?? null, claimant_name: full || null,
      phone: c.phone ?? null, email: c.email ?? null, dob: c.dob || null,
      mail_addr1: c.addr1 ?? null, mail_city: c.city ?? null, mail_state: c.state ?? null, mail_zip: c.zip ?? null,
    }).eq("id", b.lead_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ---------------------------------------------------------------- disposition
  // Routes through the central status setter so the QA flags, activity log,
  // automations and firm-delivery trigger all fire exactly as they do elsewhere.
  if (b.op === "disposition") {
    if (!b.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    if (Array.isArray(b.modifiers)) {
      await admin.from("leads").update({ modifiers: b.modifiers }).eq("id", b.lead_id);
    }
    const map: Record<string, string> = {
      SIGN: "contacting", REFER: "contacting", DISQUALIFY: "dq",
      SECONDARY_REVIEW: "flag", CALLBACK: "contacting", TRANSFER: "contacting",
    };
    const status = b.status_key || map[b.disposition] || "contacting";
    try {
      const { setClaimStatusForLeads } = await import("@/lib/claim-status");
      const res = await setClaimStatusForLeads({
        leadIds: [b.lead_id], status,
        dqReasonKey: b.disposition === "DISQUALIFY" ? (b.dq_reason_key || "criteria") : null,
        dqNote: b.reason ?? null, actorId: g.id, actorName: g.name ?? "Agent",
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "status failed" }, { status: 500 });
    }
    if (b.call_id) {
      await admin.from("intake_calls").update({
        disposition: b.disposition ?? null, reason: b.reason ?? null, close_key: b.close_key ?? null,
        flags: Array.isArray(b.flags) ? b.flags : [], summary: b.summary ?? null,
        post_sign: b.post_sign ?? null,
      }).eq("id", b.call_id);
    }
    return NextResponse.json({ ok: true });
  }

  // ---------------------------------------------------------------- open_existing
  // Search-first entry: the agent found the caller already in the system and is
  // reopening their file live on this call. Load (or create) the active claim,
  // log THIS call against the existing lead, and hand back the saved answers so
  // the console resumes the questionnaire where the file left off — no duplicate.
  if (b.op === "open_existing") {
    if (!b.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { data: lead } = await admin.from("leads")
      .select("id, lead_no, firm_id, campaign_id, campaign, case_type, claimant_name, first_name, phone, email")
      .eq("id", b.lead_id).maybeSingle();
    if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 200 });
    const firmId = lead.firm_id;

    // Oldest claim is the primary file; make one if somehow none exists.
    let { data: claim } = await admin.from("claims")
      .select("id, claim_type, campaign, answers, status")
      .eq("lead_id", lead.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!claim) {
      const { data: created } = await admin.from("claims").insert({
        firm_id: firmId, lead_id: lead.id, claim_type: lead.case_type ?? null,
        campaign: lead.campaign ?? null, status: "contacting", answers: {},
      }).select("id, claim_type, campaign, answers, status").single();
      claim = created ?? null;
    }

    // Resolve campaign + offerable retainers exactly like `open`, so live-sign works.
    let campaign: any = null;
    if (lead.campaign_id) {
      const { data: c } = await admin.from("campaigns")
        .select("id, name, retainer_template_id, retainer_packet, allow_live_sign")
        .eq("id", lead.campaign_id).maybeSingle();
      campaign = c ?? null;
    }
    const { data: allowedRetainers } = campaign
      ? await admin.from("campaign_retainers").select("id, label, kind, is_default").eq("campaign_id", campaign.id).eq("active", true).order("sort")
      : { data: [] as any[] };
    const hasPacket = (allowedRetainers ?? []).length > 0
      || !!(campaign && ((Array.isArray(campaign.retainer_packet) && campaign.retainer_packet.length) || campaign.retainer_template_id));

    // Log this call against the existing file so the caller ID ties to the recording.
    const { data: call } = await admin.from("intake_calls").insert({
      firm_id: firmId, firm_slug: b.firm_slug ?? null, agent_id: g.id, agent_name: g.name ?? null,
      caller_id: b.caller_id ?? null, first_name: lead.first_name ?? lead.claimant_name ?? null,
      callback: lead.phone ?? null, call_type: b.call_type ?? "existing",
      matter: claim?.claim_type ?? lead.case_type ?? null, lead_id: lead.id,
      promoted_at: new Date().toISOString(),
    }).select("id").single();

    try {
      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({
        firm_id: firmId, lead_id: lead.id, actor: g.id, actor_name: g.name ?? "Agent",
        category: "system", description: "Existing file reopened live on a call.",
      });
    } catch {}

    return NextResponse.json({
      ok: true, lead_id: lead.id, lead_no: lead.lead_no, claim_id: claim?.id ?? null, call_id: call?.id ?? null,
      campaign: campaign?.name ?? lead.campaign ?? null,
      case_type: claim?.claim_type ?? lead.case_type ?? null,
      answers: claim?.answers ?? {},
      claimant_name: lead.claimant_name ?? lead.first_name ?? null,
      phone: lead.phone ?? null,
      retainers: allowedRetainers ?? [],
      can_send_retainer: !!(campaign && hasPacket && campaign.allow_live_sign),
      retainer_blocker: !campaign ? "No campaign on this file, so there is no retainer to send."
        : !hasPacket ? `The ${campaign.name} campaign has no retainer packet configured.`
        : !campaign.allow_live_sign ? `The ${campaign.name} campaign is not enabled for signing live on a call.`
        : null,
    });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

// GET /api/console?lead_id=...  -> signature status while the client signs.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  // Self permission check for the intake surface's "All sections" toggle.
  if (url.searchParams.get("me")) {
    return NextResponse.json({ can_full_intake: g.can("intake.full") });
  }
  const leadId = url.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: docs } = await admin.from("signable_documents")
    .select("id, title, status, sent_at, signed_at").eq("lead_id", leadId).order("packet_seq");
  const list = docs ?? [];
  return NextResponse.json({
    docs: list,
    total: list.length,
    signed_count: list.filter((d) => d.status === "signed").length,
    all_signed: list.length > 0 && list.every((d) => d.status === "signed"),
  });
}
