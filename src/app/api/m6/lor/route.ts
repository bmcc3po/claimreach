import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
import { isLorStatus, type LorStatus } from "@/lib/m6";
import {
  M6_LOR_RECIPIENT, M6_LOR_TEMPLATE_KEY, composeLorLetter, defaultLorFrom,
  letterIsMoneyBlind, lorAlreadySent, postgridMode,
} from "@/lib/m6-lor";
export const runtime = "edge";

const SENT_TO = ["g6", "motel6", "sedgwick", "other"] as const;
const LEAD_COLS = "id, firm_id, campaign, case_type, archived_at, first_name, last_name, full_name, claimant_name, lead_no, gender, incident_start, incident_end, property_name, property_street, property_city, property_state, property_zip";

const POSTGRID_URL = "https://api.postgrid.com/print-mail/v1/letters";

function factsFromLead(lead: any) {
  return {
    firstName: lead.first_name, lastName: lead.last_name,
    fullName: lead.full_name, claimantName: lead.claimant_name,
    leadNo: lead.lead_no, gender: lead.gender,
    incidentStart: lead.incident_start, incidentEnd: lead.incident_end,
    propertyName: lead.property_name, propertyStreet: lead.property_street,
    propertyCity: lead.property_city, propertyState: lead.property_state,
    propertyZip: lead.property_zip,
  };
}

function previewPayload(lead: any, lor: any) {
  const letter = composeLorLetter(factsFromLead(lead));
  const key = process.env.POSTGRID_API_KEY || "";
  const mode = postgridMode(key);
  const already = lorAlreadySent(lor?.status);
  return {
    letter: {
      subject: letter.subject,
      body: letter.body,
      html: letter.html,
      date: letter.date,
      clientName: letter.clientName,
      leadNo: letter.leadNo,
      recipient: {
        orgName: letter.recipient.orgName,
        attention: letter.recipient.attention,
        address: `${letter.recipient.addressLine1}, ${letter.recipient.city}, ${letter.recipient.state} ${letter.recipient.zip}`,
      },
      from: {
        companyName: letter.from.companyName,
        attention: letter.from.attention,
        phone: letter.from.phone,
        address: [letter.from.addressLine1, letter.from.city, letter.from.state, letter.from.zip].filter(Boolean).join(", "),
      },
      missing: letter.missing,
      moneyBlind: letterIsMoneyBlind(letter.body),
    },
    lor: lor ?? null,
    alreadySent: already,
    rails: {
      postgrid: mode !== "missing",
      mode,
      whatItDoes: mode === "live"
        ? "One click sends certified mail with return receipt to G6 via PostGrid. LawRuler is not in this path."
        : mode === "test"
          ? "PostGrid test key is on. This creates a test letter. It will not go to a live mailbox."
          : "PostGrid key is not in Pages. You can preview. Send will not mail until a test or live key is set.",
    },
    canSend: letter.canSend && !already && mode !== "missing" && letterIsMoneyBlind(letter.body),
    canPreview: true,
  };
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const leadId = new URL(req.url).searchParams.get("lead_id") || "";
  if (!leadId) return NextResponse.json({ error: "Missing the file." }, { status: 400 });
  const gate = await assertM6Write(sb, leadId, LEAD_COLS);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data: lor } = await sb.from("lead_lor")
    .select("lead_id, status, flagged_today, sent_on, sent_to")
    .eq("lead_id", leadId).eq("firm_id", gate.lead.firm_id).maybeSingle();
  return NextResponse.json(previewPayload(gate.lead, lor));
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const { lead_id, status, flagged_today, sent_on, sent_to, action } = b ?? {};
  if (!lead_id) return NextResponse.json({ error: "Missing the file." }, { status: 400 });

  if (action === "send") {
    return sendLor(sb, lead_id);
  }

  if (!isLorStatus(status)) {
    return NextResponse.json({ error: "Pick an LOR status." }, { status: 400 });
  }
  if (sent_to != null && sent_to !== "" && !SENT_TO.includes(sent_to)) {
    return NextResponse.json({ error: "Pick who it went to." }, { status: 400 });
  }

  let sentOn: string | null = null;
  if (sent_on) {
    const d = new Date(sent_on);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "That date did not make sense. Use YYYY-MM-DD." }, { status: 400 });
    }
    sentOn = String(sent_on).slice(0, 10);
  }

  const gate = await assertM6Write(sb, lead_id, "id, firm_id, campaign, case_type, archived_at");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const st: LorStatus = status;
  const flagged = st === "sent" || st === "received"
    ? false
    : (flagged_today === true || st === "ready");

  const { error } = await sb.from("lead_lor").upsert({
    lead_id,
    firm_id: gate.lead.firm_id,
    status: st,
    flagged_today: flagged,
    sent_on: sentOn,
    sent_to: sent_to || null,
    updated_at: new Date().toISOString(),
    updated_by: gate.user.id,
  }, { onConflict: "lead_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function sendLor(sb: any, leadId: string) {
  const gate = await assertM6Write(sb, leadId, LEAD_COLS);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data: lor } = await sb.from("lead_lor")
    .select("lead_id, status, flagged_today, sent_on, sent_to")
    .eq("lead_id", leadId).eq("firm_id", gate.lead.firm_id).maybeSingle();
  if (lorAlreadySent(lor?.status)) {
    return NextResponse.json({ error: "This letter was already sent. We will not send it twice." }, { status: 409 });
  }

  const letter = composeLorLetter(factsFromLead(gate.lead));
  if (!letter.canSend) {
    return NextResponse.json({ error: `The letter is missing ${letter.missing[0] || "a required fact"}.` }, { status: 409 });
  }
  if (!letterIsMoneyBlind(letter.body)) {
    return NextResponse.json({ error: "This letter names money. That is not allowed on the firm desk." }, { status: 409 });
  }

  const key = (process.env.POSTGRID_API_KEY || "").trim();
  const mode = postgridMode(key);
  if (mode === "missing") {
    return NextResponse.json({
      error: "PostGrid key is not in Pages. Nothing was mailed. Preview is on the screen.",
      rails: { mode, postgrid: false },
    }, { status: 409 });
  }

  const from = defaultLorFrom();
  if (!from.addressLine1 || !from.city || !from.state || !from.zip) {
    return NextResponse.json({
      error: "Firm return address is not set (M6_LOR_FROM_STREET). Nothing was mailed.",
      rails: { mode, postgrid: true },
    }, { status: 409 });
  }

  const idem = `m6:${leadId}:${M6_LOR_TEMPLATE_KEY}`;
  const { data: existing } = await sb.from("communications")
    .select("id, send_status, body").eq("idempotency_key", idem).maybeSingle();
  if (existing?.id && existing.send_status === "sent") {
    return NextResponse.json({ error: "This letter was already sent. We will not send it twice.", duplicate: true }, { status: 409 });
  }

  let postgridId: string | null = null;
  let tracking: string | null = null;
  let live = false;
  try {
    const r = await fetch(POSTGRID_URL, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        to: {
          companyName: M6_LOR_RECIPIENT.orgName,
          jobTitle: M6_LOR_RECIPIENT.attention,
          addressLine1: M6_LOR_RECIPIENT.addressLine1,
          city: M6_LOR_RECIPIENT.city,
          provinceOrState: M6_LOR_RECIPIENT.state,
          postalOrZip: M6_LOR_RECIPIENT.zip,
          countryCode: M6_LOR_RECIPIENT.countryCode,
        },
        from: {
          companyName: from.companyName,
          jobTitle: from.attention,
          addressLine1: from.addressLine1,
          city: from.city,
          provinceOrState: from.state,
          postalOrZip: from.zip,
          countryCode: from.countryCode,
        },
        html: letter.html,
        extraService: "certified_return_receipt",
        description: `M6 LOR ${letter.leadNo || leadId}`.slice(0, 80),
        metadata: { lead_id: leadId, source: "claimreach-m6" },
      }),
    });
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json({
        error: d.error?.message || d.message || `PostGrid ${r.status}. Nothing was marked sent.`,
        rails: { mode, postgrid: true },
      }, { status: 502 });
    }
    postgridId = d.id || d.letter?.id || null;
    tracking = d.trackingNumber || d.tracking_number || null;
    live = d.live === true;
  } catch (e: any) {
    return NextResponse.json({
      error: "PostGrid did not answer. Nothing was marked sent.",
      detail: String(e?.message ?? e),
    }, { status: 502 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error: lorErr } = await sb.from("lead_lor").upsert({
    lead_id: leadId,
    firm_id: gate.lead.firm_id,
    status: "sent",
    flagged_today: false,
    sent_on: today,
    sent_to: "g6",
    updated_at: new Date().toISOString(),
    updated_by: gate.user.id,
  }, { onConflict: "lead_id" });
  if (lorErr) return NextResponse.json({ error: lorErr.message }, { status: 500 });

  const note = [
    letter.subject,
    `PostGrid ${live ? "live" : "test"} ${postgridId || ""}`.trim(),
    tracking ? `Tracking ${tracking}` : "",
    "",
    letter.body,
  ].filter(Boolean).join("\n");

  const { error: commErr } = await sb.from("communications").insert({
    lead_id: leadId,
    firm_id: gate.lead.firm_id,
    channel: "email",
    direction: "outbound",
    body: note,
    agent_name: gate.user.name ?? "You",
    occurred_at: new Date().toISOString(),
    purpose: "ad_hoc",
    outcome: "delivered",
    logged_manually: true,
    dispositioned_by: gate.user.id,
    dispositioned_at: new Date().toISOString(),
    send_status: "sent",
    template_key: M6_LOR_TEMPLATE_KEY,
    idempotency_key: idem,
    actor_firm: gate.user.role === "firm" ? "tmp" : "innovative",
  });
  if (commErr && !String(commErr.message || "").includes("idempotency")) {
    return NextResponse.json({
      ok: true,
      warning: "Letter went out. The timeline note did not save: " + commErr.message,
      postgrid_id: postgridId,
      tracking,
      live,
      mode,
    });
  }

  return NextResponse.json({
    ok: true,
    live,
    mode,
    postgrid_id: postgridId,
    tracking,
    sent_on: today,
    sent_to: "g6",
  });
}
