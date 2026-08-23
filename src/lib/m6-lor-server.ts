// Server-only LOR preview + PostGrid send. Status writes stay on lead_lor.
// LawRuler is never in this path. No lor_sends table.

import {
  M6_LOR_RECIPIENT, M6_LOR_TEMPLATE_KEY, composeLorLetter, defaultLorFrom,
  letterIsMoneyBlind, lorAlreadySent, postgridMode,
} from "@/lib/m6-lor";

export const LOR_LEAD_COLS = "id, firm_id, campaign, case_type, archived_at, first_name, last_name, full_name, claimant_name, lead_no, gender, incident_start, incident_end, property_name, property_street, property_city, property_state, property_zip";

const POSTGRID_URL = "https://api.postgrid.com/print-mail/v1/letters";

export function factsFromLead(lead: any) {
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

export function previewPayload(lead: any, lor: any) {
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

export async function sendLorViaPostgrid(sb: any, leadId: string, user: { id: string; name: string | null; role: string }, lead: any) {
  const { data: lor } = await sb.from("lead_lor")
    .select("lead_id, status, flagged_today, sent_on, sent_to")
    .eq("lead_id", leadId).eq("firm_id", lead.firm_id).maybeSingle();
  if (lorAlreadySent(lor?.status)) {
    return { status: 409 as const, body: { error: "This letter was already sent. We will not send it twice." } };
  }

  const letter = composeLorLetter(factsFromLead(lead));
  if (!letter.canSend) {
    return { status: 409 as const, body: { error: `The letter is missing ${letter.missing[0] || "a required fact"}.` } };
  }
  if (!letterIsMoneyBlind(letter.body)) {
    return { status: 409 as const, body: { error: "This letter names money. That is not allowed on the firm desk." } };
  }

  const key = (process.env.POSTGRID_API_KEY || "").trim();
  const mode = postgridMode(key);
  if (mode === "missing") {
    return {
      status: 409 as const,
      body: {
        error: "PostGrid key is not in Pages. Nothing was mailed. Preview is on the screen.",
        rails: { mode, postgrid: false },
      },
    };
  }

  const from = defaultLorFrom();
  if (!from.addressLine1 || !from.city || !from.state || !from.zip) {
    return {
      status: 409 as const,
      body: {
        error: "Firm return address is not set (M6_LOR_FROM_STREET). Nothing was mailed.",
        rails: { mode, postgrid: true },
      },
    };
  }

  const idem = `m6:${leadId}:${M6_LOR_TEMPLATE_KEY}`;
  const { data: existing } = await sb.from("communications")
    .select("id, send_status, body").eq("idempotency_key", idem).maybeSingle();
  if (existing?.id && existing.send_status === "sent") {
    return { status: 409 as const, body: { error: "This letter was already sent. We will not send it twice.", duplicate: true } };
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
      return {
        status: 502 as const,
        body: {
          error: d.error?.message || d.message || `PostGrid ${r.status}. Nothing was marked sent.`,
          rails: { mode, postgrid: true },
        },
      };
    }
    postgridId = d.id || d.letter?.id || null;
    tracking = d.trackingNumber || d.tracking_number || null;
    live = d.live === true;
  } catch (e: any) {
    return {
      status: 502 as const,
      body: {
        error: "PostGrid did not answer. Nothing was marked sent.",
        detail: String(e?.message ?? e),
      },
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error: lorErr } = await sb.from("lead_lor").upsert({
    lead_id: leadId,
    firm_id: lead.firm_id,
    status: "sent",
    flagged_today: false,
    sent_on: today,
    sent_to: "g6",
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }, { onConflict: "lead_id" });
  if (lorErr) return { status: 500 as const, body: { error: lorErr.message } };

  const note = [
    letter.subject,
    `PostGrid ${live ? "live" : "test"} ${postgridId || ""}`.trim(),
    tracking ? `Tracking ${tracking}` : "",
    "",
    letter.body,
  ].filter(Boolean).join("\n");

  const { error: commErr } = await sb.from("communications").insert({
    lead_id: leadId,
    firm_id: lead.firm_id,
    channel: "email",
    direction: "outbound",
    body: note,
    agent_name: user.name ?? "You",
    occurred_at: new Date().toISOString(),
    purpose: "ad_hoc",
    outcome: "delivered",
    logged_manually: true,
    dispositioned_by: user.id,
    dispositioned_at: new Date().toISOString(),
    send_status: "sent",
    template_key: M6_LOR_TEMPLATE_KEY,
    idempotency_key: idem,
    actor_firm: user.role === "firm" ? "tmp" : "innovative",
  });
  if (commErr && !String(commErr.message || "").includes("idempotency")) {
    return {
      status: 200 as const,
      body: {
        ok: true,
        warning: "Letter went out. The timeline note did not save: " + commErr.message,
        postgrid_id: postgridId,
        tracking,
        live,
        mode,
      },
    };
  }

  return {
    status: 200 as const,
    body: {
      ok: true,
      live,
      mode,
      postgrid_id: postgridId,
      tracking,
      sent_on: today,
      sent_to: "g6",
    },
  };
}
