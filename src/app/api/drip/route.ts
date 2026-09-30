import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import {
  M6_DRIP_CAMPAIGN, collectDripCampaignKeys, dripCampaignClause, dripStepKey, sortDripRules,
} from "@/lib/drip-rules";
import { gateUser } from "@/lib/gate";
import { dripDispatchEnabled, dripOffResult, enrollLeadInDrips, mayManageDrips } from "@/lib/drip-dispatch";
import { loadDueDripPage, inspectDueDrip, processDueDrips } from "@/lib/drip-scheduler";
export const runtime = "edge";

const RULE_COLS = "id, name, channel, every_days, template, assign_to, active, campaign, stage, step_key, delay_days, subject, kind, method_note, fire_once";

// GET — list due drips (what would fire now) plus rules. ?campaign=motel6
// filters the rule table so Motel 6 is not mixed with unscoped TMT/prison rows.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await gateUser(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!mayManageDrips(me)) return NextResponse.json({ error: "You do not have permission to manage drips." }, { status: 403 });
  const due: any[] = [];
  const held: { lead_id: string; reason: string }[] = [];
  let preview = { limit: 200, truncated: false };
  try {
    const page = await loadDueDripPage(sb);
    preview = { limit: page.limit, truncated: page.truncated };
    for (const row of page.rows) {
      const eligible = await inspectDueDrip(supabaseAdmin(), row);
      if (eligible.allowed) due.push(row);
      else held.push({ lead_id: row.lead_id, reason: eligible.reason });
    }
  } catch {
    return NextResponse.json({ error: "Could not load or verify due drips. Retry before processing." }, { status: 503 });
  }

  const allQ = await sb.from("drip_rules").select("campaign");
  if (allQ.error) return NextResponse.json({ error: "Could not load drip campaigns." }, { status: 503 });
  const campaignKeys = collectDripCampaignKeys(allQ.data ?? []);

  const clause = dripCampaignClause(new URL(req.url).searchParams.get("campaign"));
  let q = sb.from("drip_rules").select(RULE_COLS);
  if (clause.kind === "none") q = q.is("campaign", null);
  if (clause.kind === "eq") q = q.eq("campaign", clause.value);
  const { data: rules, error } = await q.order("every_days");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ due, held, preview, rules: sortDripRules(rules ?? []), campaign_keys: campaignKeys,
    sending: dripDispatchEnabled() ? "reminders_only" : "off", sms_ready: false, email_ready: false }, { headers: { "Cache-Control": "private, no-store" } });
}

// POST { op:'enroll', lead_id } — enroll a lead in active drip rules.
// POST { op:'process' } — atomically record eligible note-only reminders.
// Every op needs an ACTIVE account (gateUser treats a deactivated login as
// signed out). enroll and process also need drips.manage; process also needs
// the kill switch on (src/lib/drip-dispatch.ts).
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await gateUser(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = await req.json();

  // ---- Manage drip RULES (owner/admin). create / update / toggle / delete ----
  if (["save_rule", "toggle_rule", "delete_rule"].includes(p.op)) {
    if (!["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const admin = supabaseAdmin();
    if (p.op === "delete_rule") {
      const { error } = await admin.from("drip_rules").delete().eq("id", p.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    if (p.op === "toggle_rule") {
      const { error } = await admin.from("drip_rules").update({ active: !!p.active }).eq("id", p.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    // save_rule (create or update)
    const name = (p.name || "").trim();
    const every = parseInt(p.every_days, 10);
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 200 });
    if (!every || every < 1) return NextResponse.json({ error: "Cadence (every N days) must be a positive number." }, { status: 200 });
    const channel = ["sms", "email", "call_reminder"].includes(p.channel) ? p.channel : "sms";
    const assign = ["agent", "case_manager", "both"].includes(p.assign_to) ? p.assign_to : "agent";
    const row: Record<string, any> = {
      name, channel, every_days: every, template: p.template ?? null,
      assign_to: assign, active: p.active !== false, firm_id: me.firmId,
      subject: (p.subject ?? "").trim() || null,
      delay_days: every,
    };
    if (p.id) {
      // Editing wording must not move a shared or another firm's rule to the
      // operator's profile firm. Campaign, step_key and firm scope stay put.
      delete row.firm_id;
      const { error } = await admin.from("drip_rules").update(row).eq("id", p.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: p.id });
    }
    const campaign = (p.campaign || "").trim() || null;
    if (campaign) {
      row.campaign = campaign;
      row.step_key = dripStepKey(name);
      if (campaign === M6_DRIP_CAMPAIGN) row.assign_to = assign || "both";
    }
    const { data, error } = await admin.from("drip_rules").insert(row).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (p.op === "enroll") {
    // Active account with drips.manage, and the TARGET lead must be visible
    // through the caller's own session before the service client writes.
    // The enrollment uses that lead's stored firm and reports real failures
    // (Astra rounds 4-7b).
    const r = await enrollLeadInDrips(sb, supabaseAdmin(), me, p.lead_id);
    return NextResponse.json(r.body, { status: r.status });
  }

  if (p.op === "process") {
    if (!mayManageDrips(me)) return NextResponse.json({ error: "You do not have permission to run drips." }, { status: 403 });
    // Kill switch: with sending off nothing fires, nothing is noted and no
    // next_due moves. 409 so the button never reads it as a successful run.
    if (!dripDispatchEnabled()) return NextResponse.json(dripOffResult(), { status: 409 });
    const admin = supabaseAdmin();
    try {
      const page = await loadDueDripPage(sb, 100, new Date(), "call_reminder");
      const result = await processDueDrips(admin, page.rows);
      return NextResponse.json({ ...result, batch: { limit: page.limit, truncated: page.truncated } }, { status: result.ok ? 200 : 503 });
    } catch {
      return NextResponse.json({ ok: false, fired: 0, error: "Could not load or verify due drips. No successful run was recorded." }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
