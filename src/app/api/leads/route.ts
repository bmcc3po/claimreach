import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { FIRM_WRITABLE_STAGES } from "@/lib/questionnaire";
import { recordAudit } from "@/lib/audit";
import { setClaimStatusForLeads } from "@/lib/claim-status";

export const runtime = "edge";

async function me(sb: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await sb.from("app_users")
    .select("id, role, firm_id, full_name").eq("id", auth.user.id).maybeSingle();
  return data ? { ...data, uid: auth.user.id } : null;
}

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
    if (u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const firm_id = payload.firm_id;
    // A file must know what it is. case_type no longer carries a database
    // default, so an unstated one used to become a Motel 6 trafficking case by
    // accident. Both of these are required at every creation path now.
    if (!payload.case_type) return NextResponse.json({ error: "A case type is required. Pick what this file is before saving it." }, { status: 400 });
    if (!payload.campaign_id) return NextResponse.json({ error: "A campaign is required. Every file has to belong to one." }, { status: 400 });
    const { data: leadNo, error: mintErr } = await sb.rpc("mint_lead_no", { p_firm: firm_id });
    if (mintErr) return NextResponse.json({ error: mintErr.message }, { status: 500 });

    const { data, error } = await sb.from("leads").insert({
      firm_id,
      lead_no: leadNo,
      firm_ref_no: payload.firm_ref_no ?? null,
      lawruler_ref_no: payload.lawruler_ref_no ?? null,
      case_type: payload.case_type,
      campaign_id: payload.campaign_id,
      campaign: payload.campaign ?? null,
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
    // claim any orphaned calls/SMS that arrived before this file existed
    if (payload.phone) { try { const { reconcileUnmatched } = await import("@/lib/comms"); await reconcileUnmatched(data.id, payload.phone, firm_id); } catch {} }
    return NextResponse.json({ lead: data });
  }

  if (op === "set_campaign") {
    if (!["owner", "admin"].includes(u.role)) return NextResponse.json({ error: "Only an owner or admin can change a file's campaign." }, { status: 403 });
    const { lead_id, campaign_id } = payload;
    const { data: camp } = await sb.from("campaigns").select("id, name, firm_id, case_type").eq("id", campaign_id).maybeSingle();
    if (!camp) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    // Campaign is the spine: update the lead and its claim so intake/retainer/e-sign
    // all follow the new campaign.
    await sb.from("leads").update({ campaign_id: camp.id, campaign: camp.name, firm_id: camp.firm_id }).eq("id", lead_id);
    await sb.from("claims").update({ campaign: camp.name, claim_type: camp.case_type }).eq("lead_id", lead_id);
    try {
      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({ firm_id: camp.firm_id, lead_id, actor: u.id, actor_name: u.full_name, category: "lead", description: `Changed campaign to "${camp.name}".` });
    } catch {}
    return NextResponse.json({ ok: true, campaign: camp.name });
  }

  if (op === "save") {
    if (u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { lead_id, lead, properties } = payload;
    if (lead && "full_name" in lead) delete lead.full_name;

    const { error: leadErr } = await sb.from("leads").update(lead).eq("id", lead_id);
    if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });

    // Activity Log: summarize what changed in plain words.
    if (lead && typeof lead === "object") {
      const labels: Record<string, string> = {
        phone: "phone", email: "email", first_name: "first name", last_name: "last name",
        dob: "date of birth", mail_addr1: "mailing address", mail_city: "city", mail_state: "state",
        mail_zip: "ZIP", ec_name: "emergency contact", ec_phone: "emergency contact phone",
        pnc_status: "injured-party status", status: "status",
      };
      const changed = Object.keys(lead).filter((k) => k in labels).map((k) => labels[k]);
      const unique = Array.from(new Set(changed));
      if (unique.length) {
        const desc = unique.length <= 3 ? `Updated ${unique.join(", ")}.` : `Updated ${unique.length} contact fields.`;
        await recordAudit({ firm_id: u.firm_id, lead_id, actor: u.uid, actor_name: (u as any).full_name, category: "contact", description: desc, meta: { fields: unique } });
      }
    }

    // Fire outbound webhook on a status change so firms stay in sync.
    if (lead && lead.status) {
      try {
        const { fireEvent } = await import("@/lib/webhook-deliver");
        const { data: row } = await sb.from("leads").select("firm_id, lead_no, external_id, status, first_name, last_name, phone, email, case_type").eq("id", lead_id).maybeSingle();
        if (row?.firm_id) {
          const evt = lead.status === "signed" ? "lead.signed" : lead.status === "dq" ? "lead.dq" : lead.status === "qualified" ? "lead.qualified" : "lead.updated";
          await fireEvent(row.firm_id, evt, { lead_id, ...row });
        }
      } catch {}
    }

    if (Array.isArray(properties)) {
      // Replace property rows for this lead (simple, idempotent save).
      await sb.from("lead_properties").delete().eq("lead_id", lead_id);
      if (properties.length) {
        const rows = properties.map((p: any, i: number) => ({
          ...p, lead_id, firm_id: lead.firm_id, sequence_order: i + 1,
        }));
        const { error: pErr } = await sb.from("lead_properties").insert(rows);
        if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (op === "stage") {
    const { lead_id, stage } = payload;
    if (u.role === "firm" && !FIRM_WRITABLE_STAGES.includes(stage)) {
      return NextResponse.json({ error: "firm may not set that stage" }, { status: 403 });
    }
    const { error } = await sb.from("leads").update({ stage }).eq("id", lead_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from("lead_activity").insert({
      firm_id: u.firm_id, lead_id, kind: "stage_change",
      actor: u.uid, body: stage, meta: { stage },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "status") {
    if (u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { lead_id, status, dq_reason_key, dq_note } = payload;
    if (!lead_id || !status) return NextResponse.json({ error: "lead_id and status required" }, { status: 400 });
    const res = await setClaimStatusForLeads({
      leadIds: [lead_id], status, dqReasonKey: dq_reason_key ?? null, dqNote: dq_note ?? null,
      actorId: u.uid, actorName: u.full_name ?? "User",
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
