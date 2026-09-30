import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, firmSpoken } from "@/lib/mva-call/server";
import { sendJustCallSms } from "@/lib/justcall-send";
import { normPhone } from "@/lib/comms";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided } from "@/lib/mva-call/signing-matter";
import { recordAudit } from "@/lib/audit";
import { readPendingSendAttempt, SEND_HELD_MESSAGE } from "@/lib/mva-call/send-attempt";

export const runtime = "edge";

// POST /api/calls/esign/resend  { lead_id }
// Texts the same signing link again from the JustCall line.
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
  if (row.via === "Email") return NextResponse.json({ error: "This agreement was emailed. Ask the signer to check their inbox and spam." }, { status: 409 });
  if (!row.sign_url || !row.phone) return NextResponse.json({ error: "This one went by email. Ask the PNC to check their inbox and spam." }, { status: 409 });

  if (context.lead.perm_text === false) return NextResponse.json({ error: "The PNC asked not to be texted." }, { status: 409 });
  const admin = supabaseAdmin();
  const { data: firm } = await admin.from("firms").select("name").eq("id", row.firm_id).maybeSingle();
  const from = process.env.JUSTCALL_DEFAULT_FROM || "";
  if (!from) return NextResponse.json({ error: "No JustCall number is set (JUSTCALL_DEFAULT_FROM)." }, { status: 500 });
  const body = `${firmSpoken(firm?.name)}: here is your agreement link again. ${row.sign_url}`;
  const sent = await sendJustCallSms({ to: row.phone, from, body });
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
  await admin.from("communications").insert({
    lead_id: leadId, firm_id: row.firm_id, channel: "sms", direction: "outbound", phone_raw: row.phone, phone_norm: normPhone(row.phone),
    agent_name: me.name, body, provider: "justcall", send_status: "sent", occurred_at: new Date().toISOString(), purpose: "esign",
  });
  await recordAudit({
    firm_id: row.firm_id, lead_id: leadId, claim_id: context.matter.claim.id,
    actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
    description: `Resent the ${row.template_key || "current"} agreement link by text to the signer.`,
    meta: { agreement_id: row.id, provider: "justcall", event: "agreement_link_resent" },
  });
  return NextResponse.json({ ok: true, claim_id: context.matter.claim.id, agreement_id: row.id });
}
