import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
import { isInternalRole } from "@/lib/permissions";
import {
  M6_SENDING_NUMBER, actorFirmLabel, evaluateOutboundGates, gateMessage,
  idempotencyKey, mergeCadenceText, templateByKey, templatesForAudience,
  timezoneFromPhone, type GateChannel,
} from "@/lib/m6-cadence";
import { sendEmail } from "@/lib/email";
import { resolveM6SmsDestination, sendJustCallSms } from "@/lib/justcall-send";
export const runtime = "edge";

const CHANNELS: GateChannel[] = ["sms", "email", "call", "voicemail", "letter", "social", "trace", "memo"];

function envKeys() {
  return {
    justcall: !!(process.env.JUSTCALL_API_KEY && process.env.JUSTCALL_API_SECRET),
    resend: !!process.env.RESEND_API_KEY,
  };
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const url = new URL(req.url);
  const leadId = url.searchParams.get("lead_id") || "";
  if (!leadId) return NextResponse.json({ error: "Missing the file." }, { status: 400 });
  const gate = await assertM6Write(
    sb, leadId,
    "id, firm_id, campaign, case_type, archived_at, first_name, claimant_name, phone, comms_monitored, comms_safe_channels",
  );
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const isStaff = isInternalRole(gate.user.role);
  const templates = templatesForAudience({ isStaff }).map((t) => ({
    key: t.key, stage: t.stage, name: t.name, kind: t.kind, channel: t.channel,
    subject: mergeCadenceText(t.subject || "", {
      first: gate.lead.first_name || gate.lead.claimant_name, agent: gate.user.name, number: M6_SENDING_NUMBER,
    }) || null,
    body: mergeCadenceText(t.body, {
      first: gate.lead.first_name || gate.lead.claimant_name, agent: gate.user.name, number: M6_SENDING_NUMBER,
    }),
    method: t.method, approvedByFirm: t.approvedByFirm,
  }));

  const { data: settings } = await sb.from("retention_settings")
    .select("sending_number, quiet_start, quiet_end")
    .eq("campaign", "motel6").maybeSingle();

  const keys = envKeys();
  return NextResponse.json({
    templates,
    sendingNumber: settings?.sending_number || M6_SENDING_NUMBER,
    rails: { justcall: keys.justcall, resend: keys.resend, live: keys.justcall || keys.resend },
    isStaff,
  });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const leadId = b.lead_id;
  if (!leadId) return NextResponse.json({ error: "Missing the file." }, { status: 400 });

  const gate = await assertM6Write(
    sb, leadId,
    "id, firm_id, campaign, case_type, archived_at, first_name, claimant_name, phone, email, comms_monitored, comms_safe_channels",
  );
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const isStaff = isInternalRole(gate.user.role);
  const tpl = b.template_key ? templateByKey(String(b.template_key)) : null;
  const channel = (CHANNELS.includes(b.channel) ? b.channel : tpl?.channel || "sms") as GateChannel;
  const liveSend = b.live === true;
  const first = gate.lead.first_name || gate.lead.claimant_name;
  const mergedBody = mergeCadenceText(
    typeof b.body === "string" && b.body.trim() ? b.body : (tpl?.body || ""),
    { first, agent: gate.user.name, number: M6_SENDING_NUMBER },
  );
  const mergedSubject = mergeCadenceText(
    typeof b.subject === "string" ? b.subject : (tpl?.subject || ""),
    { first, agent: gate.user.name, number: M6_SENDING_NUMBER },
  );

  if (!mergedBody.trim()) return NextResponse.json({ error: "Write the message first." }, { status: 400 });

  const { data: settings } = await sb.from("retention_settings")
    .select("sending_number, quiet_start, quiet_end")
    .eq("campaign", "motel6").maybeSingle();
  const sendingNumber = settings?.sending_number || M6_SENDING_NUMBER;

  const { data: points } = await sb.from("contact_points")
    .select("id, kind, value, status")
    .eq("lead_id", leadId)
    .eq("firm_id", gate.lead.firm_id)
    .is("retired_at", null);

  const dest = resolveM6SmsDestination({
    contactPointId: b.contact_point_id || null,
    leadPhone: gate.lead.phone,
    points: (points ?? []) as { id: string; kind: string; value: string; status: string }[],
  });
  let optedOut = dest.optedOut;
  if (b.contact_point_id && !optedOut) {
    const point = (points ?? []).find((p: any) => p.id === b.contact_point_id);
    optedOut = point?.status === "opted_out";
  }
  const { data: lastIn } = await sb.from("communications")
    .select("body").eq("lead_id", leadId).eq("direction", "inbound")
    .order("occurred_at", { ascending: false }).limit(1).maybeSingle();

  const keys = envKeys();
  const verdict = evaluateOutboundGates({
    channel,
    body: mergedBody,
    subject: mergedSubject,
    optedOut,
    lastInboundBody: lastIn?.body ?? null,
    commsMonitored: !!gate.lead.comms_monitored,
    safeChannels: Array.isArray(gate.lead.comms_safe_channels) ? gate.lead.comms_safe_channels : null,
    now: new Date(),
    timezone: timezoneFromPhone(gate.lead.phone),
    quietStart: settings?.quiet_start ? String(settings.quiet_start).slice(0, 5) : "08:00",
    quietEnd: settings?.quiet_end ? String(settings.quiet_end).slice(0, 5) : "20:00",
    approvedByFirm: !!tpl?.approvedByFirm,
    isStaff,
    liveSend,
    agentInitiated: true,
    sendingNumber,
    hasJustCallKeys: keys.justcall,
    hasResendKey: keys.resend,
  });

  if (!verdict.canLog) {
    return NextResponse.json({
      error: verdict.blocked.map(gateMessage).join(" "),
      gates: verdict,
    }, { status: 409 });
  }

  const dueDay = (b.due_at || new Date().toISOString()).slice(0, 10);
  const idem = tpl
    ? idempotencyKey(leadId, tpl.key, dueDay)
    : `m6:${leadId}:free:${channel}:${dueDay}:${mergedBody.slice(0, 24)}`;

  const { data: existing } = await sb.from("communications")
    .select("id, send_status").eq("idempotency_key", idem).maybeSingle();
  if (existing?.id) {
    return NextResponse.json({ ok: true, id: existing.id, send_status: existing.send_status, duplicate: true, gates: verdict });
  }

  let sendStatus = "logged";
  let blockedReason = verdict.blocked[0] ?? null;
  let liveError: string | null = null;

  if (liveSend && verdict.canLiveSend) {
    if (channel === "email") {
      const to = typeof b.to === "string" && b.to.includes("@") ? b.to : gate.lead.email;
      const sent = await sendEmail({
        to: to || "",
        subject: mergedSubject || "A note from your case team",
        html: `<p>${mergedBody.replace(/\n/g, "<br>")}</p>`,
        text: mergedBody,
      });
      if (sent.ok) sendStatus = "sent";
      else { sendStatus = "failed"; liveError = sent.error || "Email did not send."; }
    } else if (channel === "sms") {
      if (!dest.to) {
        sendStatus = "failed";
        liveError = "No number to text.";
      } else {
        const sent = await sendJustCallSms({
          to: dest.to,
          body: mergedBody,
          from: sendingNumber,
        });
        if (sent.ok) {
          sendStatus = "sent";
          blockedReason = null;
        } else {
          sendStatus = "failed";
          liveError = sent.error;
        }
      }
    } else {
      sendStatus = "logged";
    }
  } else if (liveSend && !verdict.canLiveSend) {
    sendStatus = "blocked";
    liveError = verdict.blocked.map(gateMessage).join(" ") || "The text did not send.";
  }

  const commChannel = channel === "email" ? "email" : channel === "sms" ? "sms" : "call";
  const { data: row, error } = await sb.from("communications").insert({
    lead_id: leadId,
    firm_id: gate.lead.firm_id,
    channel: commChannel,
    direction: "outbound",
    phone_raw: dest.to || gate.lead.phone,
    body: mergedSubject ? `${mergedSubject}\n\n${mergedBody}` : mergedBody,
    agent_name: gate.user.name ?? "You",
    agent_email: null,
    occurred_at: new Date().toISOString(),
    purpose: tpl?.stage === "06" ? "escalation" : tpl?.stage === "05" ? "heartbeat" : tpl?.stage === "04" || tpl?.stage === "03" || tpl?.stage === "01" ? "onboarding" : "ad_hoc",
    outcome: sendStatus === "sent" ? "delivered" : null,
    contact_point_id: b.contact_point_id || dest.contactPointId || null,
    logged_manually: true,
    dispositioned_by: gate.user.id,
    dispositioned_at: new Date().toISOString(),
    send_status: sendStatus,
    blocked_reason: blockedReason,
    template_key: tpl?.key ?? null,
    idempotency_key: idem,
    actor_firm: isStaff ? "innovative" : "tmp",
  }).select("id").single();

  if (error) {
    if (String(error.message || "").includes("idempotency")) {
      return NextResponse.json({ ok: true, duplicate: true, gates: verdict });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const didSend = sendStatus === "sent";
  return NextResponse.json({
    ok: true,
    id: row?.id,
    send_status: sendStatus,
    live: didSend,
    error: liveSend && !didSend ? liveError : null,
    sendingNumber,
    gates: {
      ...verdict,
      messages: verdict.blocked.map(gateMessage),
    },
    actor: actorFirmLabel(gate.user.role),
  });
}
