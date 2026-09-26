import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff, leadPatchFromAnswers, LEAD_CALL_COLS } from "@/lib/mva-call/server";

export const runtime = "edge";

// POST /api/calls/save  { lead_id, call_id?, answers, mode }
// Autosave for the call console. One intake_calls row per call (the session),
// created on the first save. Contact details the agent filled are mirrored
// onto the lead, and the answers onto the file's claim, so the file, exports
// and firm delivery see them without waiting for the dispo.
// The SSN is never accepted here. Errors come back as errors, never "saved".
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // sendBeacon posts text/plain, so read the raw body.
  let b: any;
  try { b = JSON.parse(await req.text()); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const leadId = String(b?.lead_id || "");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const answers = b?.answers && typeof b.answers === "object" ? b.answers : {};
  if (answers.file) delete answers.file.ssn;
  const size = JSON.stringify(answers).length;
  if (size > 200_000) return NextResponse.json({ error: "That call is too large to save." }, { status: 413 });
  const mode = ["guided", "free", "bare"].includes(b?.mode) ? b.mode : null;

  const { data: lead, error: leadErr } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const now = new Date().toISOString();
  let callId: string | null = b?.call_id ? String(b.call_id) : null;

  if (callId) {
    const { data: upd, error } = await sb.from("intake_calls")
      .update({ answers, mode, updated_at: now })
      .eq("id", callId).eq("lead_id", leadId).eq("status", "live")
      .select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!upd) callId = null; // the call was closed by a dispo; start a fresh session
  }
  if (!callId) {
    const { data: ins, error } = await sb.from("intake_calls").insert({
      firm_id: lead.firm_id,
      campaign_id: lead.campaign_id,
      lead_id: lead.id,
      agent_id: me.id,
      agent_name: me.name,
      caller_id: lead.phone || lead.lead_no || "unknown",
      first_name: lead.first_name,
      call_type: "mva_console",
      answers,
      mode,
      status: "live",
      updated_at: now,
    }).select("id").single();
    if (error) {
      const hint = /column .* does not exist/i.test(error.message) ? " Run migration 0097, then try again." : "";
      return NextResponse.json({ error: error.message + hint }, { status: 500 });
    }
    callId = ins.id;
  }

  const patch = { ...leadPatchFromAnswers(answers), last_called_at: now };
  const { error: lpErr } = await sb.from("leads").update(patch).eq("id", lead.id);
  if (lpErr) return NextResponse.json({ error: `Answers saved, the lead record did not: ${lpErr.message}`, call_id: callId }, { status: 500 });

  // The file's claim carries the answers under one key so exports and webhooks see them.
  const { data: claim } = await sb.from("claims").select("id, answers")
    .eq("lead_id", lead.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (claim) {
    const merged = { ...(claim.answers || {}), mva_call: answers };
    const { error: cErr } = await sb.from("claims").update({ answers: merged }).eq("id", claim.id);
    if (cErr) return NextResponse.json({ error: `Answers saved, the claim did not: ${cErr.message}`, call_id: callId }, { status: 500 });
  }

  return NextResponse.json({ ok: true, call_id: callId });
}
