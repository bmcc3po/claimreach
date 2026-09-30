import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, leadPatchSince, LEAD_CALL_COLS } from "@/lib/mva-call/server";
import { resolveMatter } from "@/lib/matter";
import { isAnswerObject, mergeAnswerDelta } from "@/lib/mva-call/answer-merge";

export const runtime = "edge";

// POST /api/calls/save  { lead_id, claim_id, call_id?, base_answers, answers, mode }
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
  const incoming = isAnswerObject(b?.answers) ? b.answers : {};
  const hasBase = Object.prototype.hasOwnProperty.call(b || {}, "base_answers");
  if (hasBase && !isAnswerObject(b.base_answers)) return NextResponse.json({ error: "base_answers must be an answer document." }, { status: 400 });
  const base = hasBase ? b.base_answers : null;
  if (isAnswerObject(incoming.file)) delete incoming.file.ssn;
  if (isAnswerObject(base?.file)) delete base.file.ssn;
  if (JSON.stringify(incoming).length > 200_000 || JSON.stringify(base).length > 200_000) return NextResponse.json({ error: "That call is too large to save." }, { status: 413 });
  const mode = ["guided", "free", "bare"].includes(b?.mode) ? b.mode : null;

  const { data: lead, error: leadErr } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  // The call's ONE matter: the claim the console pinned when the call opened
  // (round 7). Answers are filed on it and nowhere else — never the oldest
  // sibling (Astra round 6: an MVA call landed in the older Motel matter).
  const matter = await resolveMatter(sb, lead.id, { claimId: b?.claim_id ? String(b.claim_id) : null, campaignId: lead.campaign_id ?? null, authoritativeDb: supabaseAdmin() });
  if (!matter.ok) return NextResponse.json({ error: matter.error, ambiguous: !!matter.ambiguous }, { status: matter.status });
  const claim = matter.claim;

  const now = new Date().toISOString();
  let callId: string | null = b?.call_id ? String(b.call_id) : null;

  // Refuse an ended or mismatched session BEFORE touching canonical answers.
  if (callId) {
    const { data: was, error } = await sb.from("intake_calls").select("id, lead_id, status, claim_id").eq("id", callId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (was && (was.lead_id !== leadId || (was.claim_id && was.claim_id !== claim.id))) {
      return NextResponse.json({ error: "This call belongs to a different matter on this file. Refresh the page.", ended: true }, { status: 409 });
    }
    if (was && !was.claim_id && !matter.sole) {
      return NextResponse.json({ error: "This older call is not tied to a matter on a multi-matter file. Start a new call on the selected matter before saving.", ended: true }, { status: 409 });
    }
    if (was && was.status !== "live") return NextResponse.json({ error: "This call was already closed (maybe on another screen). Open the file again to start a new call.", ended: true }, { status: 409 });
    if (!was) callId = null;
  }

  // Claim answers are canonical. CAS the whole bag so a concurrent import or
  // classic-form save cannot be erased; reapply only this client's changed leaves.
  let answers: Record<string, any> = {}, previous: Record<string, any> = {}, wrote = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: fresh, error } = await sb.from("claims").select("answers, updated_at").eq("id", claim.id).eq("lead_id", leadId).maybeSingle();
    if (error || !fresh) return NextResponse.json({ error: error?.message || "The claim is no longer available." }, { status: 500 });
    const bag = isAnswerObject(fresh.answers) ? fresh.answers : {};
    if (!hasBase && bag.lawruler_presign) return NextResponse.json({ error: "Imported answers arrived after this screen opened. Reopen the file before saving.", conflict: true, refresh_required: true }, { status: 409 });
    // A legacy claim without mva_call can adopt the scoped call restored by the
    // page. Once mva_call exists (even {}), it always wins over session copies.
    previous = isAnswerObject(bag.mva_call) ? bag.mva_call : (base || {});
    const merged = hasBase ? mergeAnswerDelta(base, previous, incoming) : { value: incoming, conflicts: [] };
    if (merged.conflicts.length) return NextResponse.json({ error: `These answers changed on another screen: ${merged.conflicts.join(", ")}. Your edits remain on this screen; review the file before saving again.`, conflict: true, conflicts: merged.conflicts }, { status: 409 });
    answers = merged.value;
    if (isAnswerObject(answers.file)) delete answers.file.ssn;
    let q = sb.from("claims").update({ answers: { ...bag, mva_call: answers } }).eq("id", claim.id).eq("lead_id", leadId);
    q = fresh.updated_at == null ? q.is("updated_at", null) : q.eq("updated_at", fresh.updated_at);
    const { data: hit, error: writeError } = await q.select("id").maybeSingle();
    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });
    if (hit) { wrote = true; break; }
  }
  if (!wrote) return NextResponse.json({ error: "The file is changing on another screen. Your answers have not saved; try again.", retryable: true }, { status: 409 });

  // Session rows are mirrors, never the authority used to reopen the call.
  // A failed mirror is reported and can be retried against the same base.
  if (callId) {
    const { data: upd, error } = await sb.from("intake_calls")
      .update({ answers, mode, updated_at: now, claim_id: claim.id })
      .eq("id", callId).eq("lead_id", leadId).eq("status", "live")
      .or(`claim_id.eq.${claim.id},claim_id.is.null`).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: `The claim saved, but the call copy did not: ${error.message}`, call_id: callId, retryable: true }, { status: 500 });
    if (!upd) return NextResponse.json({ error: "The claim saved, but this call closed before its copy could update. Open the file again.", call_id: callId, ended: true }, { status: 409 });
  }
  if (!callId) {
    const { data: ins, error } = await sb.from("intake_calls").insert({
      firm_id: lead.firm_id,
      campaign_id: claim.campaign_id ?? lead.campaign_id,
      lead_id: lead.id,
      claim_id: claim.id,
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
      const hint = /column .* does not exist/i.test(error.message) ? " Run migration 0108, then try again." : "";
      return NextResponse.json({ error: error.message + hint }, { status: 500 });
    }
    callId = ins.id;
  }

  // Only what changed since this matter's last save goes onto the lead, so a
  // correction made on the File tab's contact card is not undone by the next
  // autosave carrying the call's older copy.
  const since = leadPatchSince(hasBase ? incoming : answers, hasBase ? base : previous);
  // Nothing the record already says is rewritten (a phone stored as
  // "(708) 916-1007" is the same cell as 7089161007).
  const same = (k: string, v: any) => {
    const cur = (lead as any)[k];
    if (k === "phone") return String(cur || "").replace(/\D/g, "").slice(-10) === String(v || "").replace(/\D/g, "").slice(-10);
    if (k === "email") return String(cur || "").trim().toLowerCase() === String(v || "").trim().toLowerCase();
    return String(cur ?? "").trim() === String(v ?? "").trim();
  };
  for (const k of Object.keys(since)) if (same(k, since[k])) delete since[k];
  const patch = { ...since, last_called_at: now };
  const { error: lpErr } = await sb.from("leads").update(patch).eq("id", lead.id);
  if (lpErr) return NextResponse.json({ error: `Answers saved, the lead record did not: ${lpErr.message}`, call_id: callId }, { status: 500 });

  // The contact fields this save put on the record, so every open screen
  // (the File tab's contact card) shows them at once.
  const contact: Record<string, string> = {};
  for (const k of ["phone", "email", "mail_addr1", "mail_city", "mail_state", "mail_zip"]) if (k in since) contact[k] = String((since as any)[k] ?? "");
  return NextResponse.json({ ok: true, call_id: callId, claim_id: claim.id, answers, contact });
}
