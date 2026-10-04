import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { FIRM_WRITABLE_STAGES, INTAKE, STAGES } from "@/lib/questionnaire";
import { recordAudit } from "@/lib/audit";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { nullifyEmpty } from "@/lib/coerce";
import { coercePropCol } from "@/lib/claim-properties";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { can, isInternalRole } from "@/lib/permissions";
import { manualIntakeStatusAllowed } from "@/lib/statuses";
import { intakeStatusTransitionBlock } from "@/lib/intake-status-guard";
import { inferMailTimeZone } from "@/lib/mail-time-zone";
import { intakeFirmScope } from "@/lib/intake-firm-scope";

export const runtime = "edge";

async function me(sb: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await sb.from("app_users")
    .select("id, role, firm_id, full_name, active, perm_overrides").eq("id", auth.user.id).maybeSingle();
  return data?.active === true ? { ...data, uid: auth.user.id } : null;
}

async function editableLead(sb: Awaited<ReturnType<typeof supabaseServer>>, u: NonNullable<Awaited<ReturnType<typeof me>>>, leadId: string) {
  if (!leadId || typeof leadId !== "string") return { error: "lead_id required", status: 400 } as const;
  const { data: lead, error } = await sb.from("leads")
    .select("id,firm_id,campaign_id,case_type,archived_at").eq("id", leadId).maybeSingle();
  if (error) return { error: "Could not verify this file.", status: 503 } as const;
  if (!lead) return { error: "File not found.", status: 404 } as const;
  if (lead.archived_at) return { error: "Restore this file before editing it.", status: 409 } as const;
  if (u.role !== "owner") {
    const access = await intakeFirmScope(sb, { role: u.role, firmId: u.firm_id }, lead.firm_id);
    if (!access.ok) return access;
    if (!lead.campaign_id || lead.case_type !== "mva")
      return { error: "Only your firm's INNO MVA files are available.", status: 403 } as const;
    const { data: camp, error: campError } = await sb.from("campaigns")
      .select("id,firm_id,name,case_type,active").eq("id", lead.campaign_id).maybeSingle();
    if (campError) return { error: "Could not verify this file's campaign.", status: 503 } as const;
    if (!camp || camp.firm_id !== lead.firm_id || camp.name !== "INNO MVA" || camp.case_type !== "mva" || camp.active !== true)
      return { error: "Only active INNO MVA files are available.", status: 403 } as const;
  }
  return { lead } as const;
}

const EDITABLE_LEAD_FIELDS = new Set([
  ...INTAKE.filter((field) => field.scope === "lead" && !["section", "script", "gate"].includes(field.kind)).map((field) => field.id),
  "first_name", "last_name", "claimant_name", "phone", "email", "address", "dob",
  "mail_addr1", "mail_addr2", "mail_city", "mail_state", "mail_zip", "client_time_zone",
  "preferred_language", "preferred_time", "preferred_contact_method", "language", "best_time",
  "home_phone", "work_phone", "ec_name", "ec_relationship", "ec_phone", "ec_email", "ec_mail", "ec_permission_to_discuss",
  "pnc_status", "est_value", "is_locked",
]);

// POST { op: 'create', firm_id, firm_ref_no?, lawruler_ref_no? }
// POST { op: 'save', lead_id, lead: {...fields}, properties: [{...}] }
// POST { op: 'stage', lead_id, stage }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = await req.json();
  const op = payload.op;

  if (op === "create") {
    if (!isInternalRole(u.role) || !can(u.role, u.perm_overrides, "leads.edit")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const firm_id = payload.firm_id;
    if (!firm_id || (u.role !== "owner" && firm_id !== u.firm_id)) return NextResponse.json({ error: "This firm is not available to your account." }, { status: 403 });
    // A file must know what it is. case_type no longer carries a database
    // default, so an unstated one used to become a Motel 6 trafficking case by
    // accident. Both of these are required at every creation path now.
    if (!payload.case_type) return NextResponse.json({ error: "A case type is required. Pick what this file is before saving it." }, { status: 400 });
    if (!payload.campaign_id) return NextResponse.json({ error: "A campaign is required. Every file has to belong to one." }, { status: 400 });
    // Resolve the campaign ourselves: the list and the detail header both read
    // the campaign NAME (on the lead and on the claim), so a create that only
    // carried the id showed "No campaign" on a file that had one (Astra audit).
    const { data: camp } = await sb.from("campaigns").select("id, name, firm_id, case_type").eq("id", payload.campaign_id).maybeSingle();
    if (!camp) return NextResponse.json({ error: "That campaign does not exist." }, { status: 400 });
    if (camp.firm_id !== firm_id) return NextResponse.json({ error: "That campaign belongs to a different firm." }, { status: 400 });
    if (u.role !== "owner" && (camp.name !== "INNO MVA" || camp.case_type !== "mva" || payload.case_type !== "mva"))
      return NextResponse.json({ error: "Only INNO MVA files are available during this pilot." }, { status: 403 });
    if (camp.case_type && payload.case_type && camp.case_type !== payload.case_type) {
      return NextResponse.json({ error: `That campaign is for ${camp.case_type}, not ${payload.case_type}. Pick a matching campaign.` }, { status: 400 });
    }
    const { data: leadNo, error: mintErr } = await sb.rpc("mint_lead_no", { p_firm: firm_id });
    if (mintErr) return NextResponse.json({ error: mintErr.message }, { status: 500 });

    const { data, error } = await sb.from("leads").insert({
      firm_id,
      lead_no: leadNo,
      firm_ref_no: payload.firm_ref_no ?? null,
      lawruler_ref_no: payload.lawruler_ref_no ?? null,
      case_type: payload.case_type,
      campaign_id: camp.id,
      campaign: camp.name,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
      claimant_name: payload.claimant_name ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      stage: payload.stage ?? "referral_received",
      created_by: u.uid,
      assigned_agent: u.uid,
    }).select("id, lead_no").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Every file gets its claim row at birth: status, campaign and answers all
    // live there, and the list warns on any lead without one.
    {
      let cErr = (await sb.from("claims").insert({
        firm_id, lead_id: data.id, claim_type: payload.case_type,
        campaign: camp.name, campaign_id: camp.id, status: "new", answers: {},
      })).error;
      if (cErr) cErr = (await sb.from("claims").insert({
        firm_id, lead_id: data.id, claim_type: payload.case_type,
        campaign: camp.name, campaign_id: camp.id, status: "new", answers: {},
      })).error;
      if (cErr) {
        // Never hand back a healthy-looking lead with no claim: archive the
        // half-made record (delete means archive, migration 0066) and say so.
        const { error: archErr } = await sb.from("leads").update({ archived_at: new Date().toISOString(), archived_by: u.uid }).eq("id", data.id);
        if (archErr) {
          console.error("archive of half-created lead failed", archErr.message);
          return NextResponse.json({ error: `The file did not finish creating (${cErr.message}) AND the half-made lead could not be archived (${archErr.message}). Lead ${data.lead_no ?? data.id} is still visible; archive it by hand, then add the lead again.`, archived_lead_id: data.id, archive_failed: true }, { status: 500 });
        }
        try { const { recordAudit } = await import("@/lib/audit"); await recordAudit({ firm_id, lead_id: data.id, category: "system", description: `Lead archived at birth: its claim row failed twice (${cErr.message}).` }); } catch {}
        return NextResponse.json({ error: `The file did not finish creating (${cErr.message}). The half-made lead was archived; add the lead again.`, archived_lead_id: data.id }, { status: 500 });
      }
    }
    // claim any orphaned calls/SMS that arrived before this file existed
    if (payload.phone) { try { const { reconcileUnmatched } = await import("@/lib/comms"); await reconcileUnmatched(data.id, payload.phone, firm_id); } catch {} }
    return NextResponse.json({ lead: data });
  }

  if (op === "set_campaign") {
    if (!["owner", "admin"].includes(u.role)) return NextResponse.json({ error: "Only an owner or admin can change a file's campaign." }, { status: 403 });
    const { lead_id, campaign_id } = payload;
    const scope = await editableLead(sb, u, lead_id);
    if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const { data: camp } = await sb.from("campaigns").select("id, name, firm_id, case_type").eq("id", campaign_id).maybeSingle();
    if (!camp) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    if (camp.firm_id !== scope.lead.firm_id)
      return NextResponse.json({ error: "Move a file to another firm through the dedicated transfer workflow." }, { status: 403 });
    if (u.role !== "owner" && (camp.firm_id !== u.firm_id || camp.name !== "INNO MVA" || camp.case_type !== "mva"))
      return NextResponse.json({ error: "Only INNO MVA files are available during this pilot." }, { status: 403 });
    // Campaign is the spine: update the lead and its claim so intake/retainer/e-sign
    // all follow the new campaign.
    const leadUpdate = await sb.from("leads").update({ campaign_id: camp.id, campaign: camp.name }).eq("id", lead_id).eq("firm_id", scope.lead.firm_id);
    if (leadUpdate.error) return NextResponse.json({ error: leadUpdate.error.message }, { status: 500 });
    const claimUpdate = await sb.from("claims").update({ campaign: camp.name, campaign_id: camp.id, claim_type: camp.case_type }).eq("lead_id", lead_id).eq("firm_id", scope.lead.firm_id);
    if (claimUpdate.error) return NextResponse.json({ error: claimUpdate.error.message }, { status: 500 });
    try {
      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({ firm_id: camp.firm_id, lead_id, actor: u.id, actor_name: u.full_name, category: "lead", description: `Changed campaign to "${camp.name}".` });
    } catch {}
    return NextResponse.json({ ok: true, campaign: camp.name });
  }

  if (op === "save") {
    if (!isInternalRole(u.role) || !can(u.role, u.perm_overrides, "leads.edit")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { lead_id, lead, properties } = payload;
    const scope = await editableLead(sb, u, lead_id);
    if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status });
    if (lead && "full_name" in lead) delete lead.full_name;
    // Blank fields arrive as "" — turn them into NULL so a date/number/uuid
    // column can't reject the entire update and silently drop every change.
    const leadPatch = nullifyEmpty(lead ?? {});
    // Authorization, verification and WORKFLOW facts never ride in on a
    // generic form save; they have their own commands (Astra rounds 4-5:
    // status/stage/QA flags were an alternate write path around the status
    // setter's gates and audit).
    for (const k of ["grievous_approved", "grievous_approved_at", "firm_sent_at", "firm_send_result",
      "archived_at", "archived_by", "firm_id", "campaign_id", "campaign", "lead_no", "created_by", "signed_at",
      "status", "stage", "qa_pending", "wip_pending", "qa_entered_at", "qa_draft",
      "dq_reason_key", "dq_reason", "qualification", "esign_sent_at", "esign_date",
      "first_dialed_at", "first_opened_at", "first_opened_by", "signed_notified_at"]) delete leadPatch[k];
    const unknown = Object.keys(leadPatch).filter((key) => !EDITABLE_LEAD_FIELDS.has(key));
    if (unknown.length) return NextResponse.json({ error: "This form cannot edit those file fields." }, { status: 400 });
    if (u.role !== "owner" && ("is_locked" in leadPatch || "est_value" in leadPatch && !can(u.role, u.perm_overrides, "money.view")))
      return NextResponse.json({ error: "Only the owner can change file locks or restricted values." }, { status: 403 });

    // The contact's mailing address is the scheduling clock, not the wreck
    // state or the agent's phone area code. Preserve a manually verified time
    // zone; infer only where the state/ZIP identifies one unambiguously.
    if (("mail_state" in leadPatch || "mail_zip" in leadPatch) && !("client_time_zone" in leadPatch)) {
      const prior = await sb.from("leads").select("mail_state,mail_zip,client_time_zone").eq("id", lead_id).maybeSingle();
      if (prior.error) return NextResponse.json({ error: prior.error.message }, { status: 500 });
      if (!prior.data) return NextResponse.json({ error: "File not found." }, { status: 404 });
      if (!prior.data.client_time_zone) {
        const inferred = inferMailTimeZone(leadPatch.mail_state ?? prior.data.mail_state, leadPatch.mail_zip ?? prior.data.mail_zip);
        if (inferred) leadPatch.client_time_zone = inferred;
      }
    }

    // Contact Info owns split names; every header/search/export also reads the
    // legacy display column. Save those identities together, guarded against
    // another editor changing either name between our read and write.
    const renaming = "first_name" in leadPatch || "last_name" in leadPatch;
    let beforeName: { first_name: string | null; last_name: string | null } | null = null;
    if (renaming) {
      const prior = await sb.from("leads").select("first_name,last_name").eq("id", lead_id).maybeSingle();
      if (prior.error) return NextResponse.json({ error: prior.error.message }, { status: 500 });
      if (!prior.data) return NextResponse.json({ error: "File not found." }, { status: 404 });
      beforeName = prior.data;
      for (const key of ["first_name", "last_name"] as const) {
        if (key in leadPatch) {
          if (leadPatch[key] != null && typeof leadPatch[key] !== "string") return NextResponse.json({ error: "Names must be text." }, { status: 400 });
          leadPatch[key] = String(leadPatch[key] ?? "").trim() || null;
        }
      }
      leadPatch.claimant_name = ["first_name", "last_name"].map((key) => key in leadPatch ? leadPatch[key] : (prior.data as any)[key]).filter(Boolean).join(" ").trim();
      if (!leadPatch.claimant_name) return NextResponse.json({ error: "Enter the client's name before saving." }, { status: 400 });
    }
    let update = sb.from("leads").update(leadPatch).eq("id", lead_id).eq("firm_id", scope.lead.firm_id).is("archived_at", null);
    if (scope.lead.campaign_id) update = update.eq("campaign_id", scope.lead.campaign_id);
    if (beforeName) for (const key of ["first_name", "last_name"] as const) {
      update = beforeName[key] == null ? update.is(key, null) : update.eq(key, beforeName[key]);
    }
    const { data: savedContact, error: leadErr } = await update.select("id,first_name,last_name,claimant_name,client_time_zone").maybeSingle();
    if (leadErr) {
      // Postgres rejects the ENTIRE update when one field names a column that
      // does not exist, so a single typo silently threw away every other change
      // on the form. Name the offending field instead of failing quietly.
      const m = /column "?([a-z_0-9.]+)"? of relation|column ([a-z_0-9.]+) does not exist/i.exec(leadErr.message);
      const bad = m?.[1] || m?.[2];
      return NextResponse.json({
        error: bad
          ? `Could not save: "${bad}" is not a field on this record, so nothing was saved. Run the latest migrations, then try again.`
          : leadErr.message,
        detail: leadErr.message,
      }, { status: 400 });
    }
    if (!savedContact) return NextResponse.json({ error: renaming ? "The name changed on another screen. Refresh and review it before saving again." : "The file could not be updated." }, { status: 409 });

    // Activity Log: summarize what changed in plain words.
    if (lead && typeof lead === "object") {
      const labels: Record<string, string> = {
        phone: "phone", email: "email", first_name: "first name", last_name: "last name",
        dob: "date of birth", mail_addr1: "mailing address", mail_city: "city", mail_state: "state",
        mail_zip: "ZIP", ec_name: "emergency contact", ec_phone: "emergency contact phone",
        home_phone: "home phone", work_phone: "work phone", dl_number: "license number",
        pnc_status: "injured-party status", status: "status",
      };
      const changed = Object.keys(lead).filter((k) => k in labels).map((k) => labels[k]);
      const unique = Array.from(new Set(changed));
      if (unique.length) {
        const desc = unique.length <= 3 ? `Updated ${unique.join(", ")}.` : `Updated ${unique.length} contact fields.`;
        await recordAudit({ firm_id: scope.lead.firm_id, lead_id, actor: u.uid, actor_name: (u as any).full_name, category: "contact", description: desc, meta: { fields: unique } });
      }
    }

    // Status no longer rides on a generic save (stripped above), so the
    // status webhook fires from the central status setter, where every
    // status change actually happens.

    if (Array.isArray(properties)) {
      // Properties live in ONE place: claim_properties on the lead's claim,
      // replaced atomically by the same RPC the intake uses. The old code
      // here wrote to a lead_properties table that does not exist, so this
      // path had been failing with a 500 since it was written (Astra round 4,
      // live-confirmed: no such table).
      // The TARGET claim is explicit: a named claim must belong to this lead,
      // and a lead with several claims must name one — "the newest" was
      // sending an older matter's properties onto a different claim
      // (Astra round 5).
      const { data: claimRows } = await sb.from("claims").select("id, firm_id, created_at").eq("lead_id", lead_id).order("created_at", { ascending: false });
      const claims = claimRows ?? [];
      if (!claims.length) return NextResponse.json({ error: "This file has no claim to hold the properties. Open the file and add its claim first." }, { status: 400 });
      let claimRow = payload.claim_id ? claims.find((c: any) => c.id === payload.claim_id) : (claims.length === 1 ? claims[0] : null);
      if (payload.claim_id && !claimRow) return NextResponse.json({ error: "That claim is not on this file. Refresh and try again." }, { status: 400 });
      if (!claimRow) return NextResponse.json({ error: "This file has more than one claim. Say which claim these properties belong to (claim_id)." }, { status: 400 });
      const rows = properties.map((p: any, i: number) => {
        const clean: Record<string, any> = {};
        for (const k of Object.keys(p)) { const c = coercePropCol(k, p[k]); if (c !== undefined) clean[k] = c; }
        return { ...clean, claim_id: claimRow.id, firm_id: claimRow.firm_id, sequence_order: i + 1 };
      });
      const { error: pErr } = await sb.rpc("replace_claim_properties", { p_claim_id: claimRow.id, p_rows: rows });
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, contact: savedContact });
  }

  if (op === "stage") {
    const { lead_id, stage } = payload;
    if (!isInternalRole(u.role) || !can(u.role, u.perm_overrides, "claims.status")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!STAGES.includes(stage)) return NextResponse.json({ error: "Pick a valid stage." }, { status: 400 });
    const scope = await editableLead(sb, u, lead_id);
    if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status });
    if (u.role === "firm" && !FIRM_WRITABLE_STAGES.includes(stage)) {
      return NextResponse.json({ error: "firm may not set that stage" }, { status: 403 });
    }
    const { error } = await sb.from("leads").update({ stage }).eq("id", lead_id).eq("firm_id", scope.lead.firm_id).eq("campaign_id", scope.lead.campaign_id).is("archived_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from("lead_activity").insert({
      firm_id: scope.lead.firm_id, lead_id, kind: "stage_change",
      actor: u.uid, body: stage, meta: { stage },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "status") {
    if (!isInternalRole(u.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { lead_id, claim_id, status, dq_reason_key, dq_note } = payload;
    if (!lead_id || !status) return NextResponse.json({ error: "lead_id and status required" }, { status: 400 });
    // Resolve both identities under the caller's RLS before invoking workflow
    // side effects. A guessed hidden lead/claim must never reach an admin query.
    const context = await resolveSigningMatter(sb, String(lead_id), { claimId: claim_id ? String(claim_id) : null });
    if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
    const access = await intakeFirmScope(sb, { role: u.role, firmId: u.firm_id }, context.lead.firm_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (u.role !== "owner") {
      const { lead, matter } = context;
      const [campaigns, firm] = await Promise.all([
        sb.from("campaigns").select("id").eq("firm_id", lead.firm_id).eq("name", "INNO MVA").eq("case_type", "mva").eq("active", true),
        sb.from("firms").select("id, slug").eq("id", lead.firm_id).maybeSingle(),
      ]);
      if (campaigns.error || firm.error) return NextResponse.json({ error: "Could not verify this file's pilot access. Refresh and try again." }, { status: 503 });
      const pilot = campaigns.data?.length === 1 ? campaigns.data[0] : null;
      if (!pilot || firm.data?.slug !== "tmp" || lead.case_type !== "mva" || matter.claim.claim_type !== "mva"
        || lead.campaign_id !== pilot.id || matter.claim.campaign_id !== pilot.id || matter.claim.firm_id !== lead.firm_id) {
        return NextResponse.json({ error: "Only active INNO MVA files are available during this pilot." }, { status: 403 });
      }
    }
    const catalog = await sb.from("statuses").select("*");
    if (catalog.error || !Array.isArray(catalog.data)) return NextResponse.json({ error: "Could not verify the available statuses. Refresh and try again." }, { status: 503 });
    const nextStatus = (catalog.data ?? []).find((item: any) => item.key === status);
    if (!nextStatus || nextStatus.active === false) return NextResponse.json({ error: "Pick an active status from the list." }, { status: 400 });
    if (!manualIntakeStatusAllowed(nextStatus)) return NextResponse.json({ error: "This status is set by agreement review, QA, or firm delivery. Use that workflow so its evidence stays accurate." }, { status: 409 });
    // Refresh the exact authorized claim under RLS and bind the write to this
    // snapshot. Privileged signature reads happen only after all access gates.
    const snapshot = await sb.from("claims").select("id,lead_id,firm_id,campaign_id,status,updated_at")
      .eq("id", context.matter.claim.id).eq("lead_id", context.lead.id).maybeSingle();
    if (snapshot.error || !snapshot.data || typeof snapshot.data.updated_at !== "string" || !Number.isFinite(Date.parse(snapshot.data.updated_at)))
      return NextResponse.json({ error: "Could not verify this matter's current version. Refresh before changing its status." }, { status: 503 });
    if (snapshot.data.firm_id !== context.lead.firm_id || snapshot.data.campaign_id !== context.matter.claim.campaign_id)
      return NextResponse.json({ error: "This matter's assignment changed. Refresh before changing its status." }, { status: 409 });
    const trustedDb = supabaseAdmin();
    try {
      const blocked = await intakeStatusTransitionBlock(trustedDb, {
        lead: context.lead, claim: snapshot.data, soleClaim: context.matter.sole,
      }, catalog.data);
      if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
    } catch {
      return NextResponse.json({ error: "Could not verify this matter's signed agreement evidence. Nothing was changed; refresh and try again." }, { status: 503 });
    }
    const res = await setClaimStatusForLeads({
      leadIds: [context.lead.id], claimIds: [context.matter.claim.id],
      expectedStatus: snapshot.data.status, expectedUpdatedAt: snapshot.data.updated_at,
      status, dqReasonKey: dq_reason_key ?? null, dqNote: dq_note ?? null,
      actorId: u.uid, actorName: u.full_name ?? "User", statuses: catalog.data,
    }, { db: sb, queueReadDb: trustedDb });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: /changed after|No claim was updated/.test(res.error || "") ? 409 : 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

