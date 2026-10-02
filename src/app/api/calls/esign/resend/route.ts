import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, firmSpoken } from "@/lib/mva-call/server";
import { sendJustCallSms, toE164 } from "@/lib/justcall-send";
import { normPhone } from "@/lib/comms";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided } from "@/lib/mva-call/signing-matter";
import { recordAudit } from "@/lib/audit";
import { readPendingSendAttempt, SEND_HELD_MESSAGE } from "@/lib/mva-call/send-attempt";

export const runtime = "edge";

// Text the existing unsigned link. A confirmed alternate destination changes
// only this delivery, never the client's contact record or signing envelope.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const context = await resolveSigningMatter(sb, leadId, { claimId: b?.claim_id });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const pending = await readPendingSendAttempt(supabaseAdmin(), context.matter.claim.id);
  if (!pending.ok) return NextResponse.json({ error: pending.error }, { status: pending.status });
  if (pending.attempt) return NextResponse.json({ error: SEND_HELD_MESSAGE, send_attempt: pending.attempt }, { status: 409 });
  const selected = await getMatterAgreement(sb, context.lead, context.matter, b?.agreement_id);
  if (!selected.ok) return NextResponse.json({ error: selected.error }, { status: selected.status });
  const row = selected.row;
  if (!row || agreementIsVoided(row) || !["sent", "opened"].includes(row.status)) return NextResponse.json({ error: "There's no open agreement to resend." }, { status: 409 });
  if (!row.sign_url) return NextResponse.json({ error: "The existing signing link is unavailable. Check the agreement status before resending." }, { status: 409 });
  const original = row.via === "Email" ? null : toE164(row.phone);
  const explicitPhone = Object.prototype.hasOwnProperty.call(b || {}, "phone");
  const phone = explicitPhone ? toE164(String(b.phone || "")) : original;
  if (!phone || !/^\+[1-9]\d{9,14}$/.test(phone)) return NextResponse.json({ error: "Enter a valid number for the signing link." }, { status: 400 });
  const alternate = phone !== original;
  if (alternate && b?.recipient_confirmed !== true) return NextResponse.json({ error: "Confirm the client wants their agreement sent to this number.", needs_recipient_confirm: true }, { status: 400 });

  if (context.lead.perm_text === false) return NextResponse.json({ error: "The PNC asked not to be texted." }, { status: 409 });
  const admin = supabaseAdmin();
  const { data: firm } = await admin.from("firms").select("name").eq("id", row.firm_id).maybeSingle();
  const from = process.env.JUSTCALL_DEFAULT_FROM || "";
  if (!from) return NextResponse.json({ error: "No JustCall number is set (JUSTCALL_DEFAULT_FROM)." }, { status: 500 });
  const body = `${firmSpoken(firm?.name)}: here is your agreement link again. ${row.sign_url}`;
  const sent = await sendJustCallSms({ to: phone, from, body });
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
  const logged = await admin.from("communications").insert({
    lead_id: leadId, firm_id: row.firm_id, channel: "sms", direction: "outbound", phone_raw: phone, phone_norm: normPhone(phone),
    agent_name: me.name, body, provider: "justcall", send_status: "sent", occurred_at: new Date().toISOString(), purpose: "esign",
  });
  await recordAudit({
    firm_id: row.firm_id, lead_id: leadId, claim_id: context.matter.claim.id,
    actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
    description: `Resent the ${row.template_key || "current"} agreement link by text to the signer.`,
    meta: { agreement_id: row.id, provider: "justcall", event: "agreement_link_resent", delivery_phone: phone, alternate_recipient: alternate },
  });
  return NextResponse.json({ ok: true, claim_id: context.matter.claim.id, agreement_id: row.id, phone,
    ...(logged.error ? { warning: "The text was sent, but its conversation entry did not save. Do not send again; ask the owner to check the activity history." } : {}) });
}
