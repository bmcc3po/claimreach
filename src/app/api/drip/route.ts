import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// GET — list due drips (what would fire now).
export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await sb.from("drips_due").select("*").limit(200);
  const { data: rules } = await sb.from("drip_rules").select("id, name, channel, every_days, template, assign_to, active").order("every_days");
  return NextResponse.json({ due: data ?? [], rules: rules ?? [] });
}

// POST { op:'enroll', lead_id } — enroll a lead in active drip rules.
// POST { op:'process' } — fire all due drips (text/email), advance next_due.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = await req.json();

  // ---- Manage drip RULES (owner/admin). create / update / toggle / delete ----
  if (["save_rule", "toggle_rule", "delete_rule"].includes(p.op)) {
    if (!["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const admin = supabaseAdmin();
    if (p.op === "delete_rule") {
      await admin.from("drip_rules").delete().eq("id", p.id);
      return NextResponse.json({ ok: true });
    }
    if (p.op === "toggle_rule") {
      await admin.from("drip_rules").update({ active: !!p.active }).eq("id", p.id);
      return NextResponse.json({ ok: true });
    }
    // save_rule (create or update)
    const name = (p.name || "").trim();
    const every = parseInt(p.every_days, 10);
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 200 });
    if (!every || every < 1) return NextResponse.json({ error: "Cadence (every N days) must be a positive number." }, { status: 200 });
    const channel = ["sms", "email", "call_reminder"].includes(p.channel) ? p.channel : "sms";
    const assign = ["agent", "case_manager", "both"].includes(p.assign_to) ? p.assign_to : "agent";
    const row: any = { name, channel, every_days: every, template: p.template ?? null, assign_to: assign, active: p.active !== false, firm_id: me.firm_id };
    if (p.id) {
      const { error } = await admin.from("drip_rules").update(row).eq("id", p.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: p.id });
    }
    const { data, error } = await admin.from("drip_rules").insert(row).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (p.op === "enroll") {
    await sb.rpc("enroll_drips_for_lead", { p_lead: p.lead_id, p_firm: me.firm_id });
    return NextResponse.json({ ok: true });
  }

  if (p.op === "process") {
    const admin = supabaseAdmin();
    const { data: due } = await sb.from("drips_due").select("*").limit(100);
    let fired = 0;
    for (const d of due ?? []) {
      // Fire the touch. Call reminders just log; text/email attempt JustCall.
      if (d.channel === "sms" && d.phone) {
        await fetch(`${new URL(req.url).origin}/api/justcall`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "text", to: d.phone, body: d.template }),
        }).catch(() => {});
      }
      // Log a note + advance next_due by cadence.
      await admin.from("notes").insert({
        firm_id: d.firm_id, lead_id: d.lead_id, author_name: "Drip",
        scope: "file", body: `Auto ${d.channel} drip "${d.name}" fired.`,
      });
      await admin.from("drip_enrollments").update({
        last_sent: new Date().toISOString(),
        next_due: new Date(Date.now() + d.every_days * 86400000).toISOString().slice(0, 10),
      }).eq("id", d.enrollment_id);
      fired++;
    }
    return NextResponse.json({ ok: true, fired });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
