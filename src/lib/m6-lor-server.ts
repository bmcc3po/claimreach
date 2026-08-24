// Server-only LOR preview + PostGrid send. Status writes stay on lead_lor.
// LawRuler is never in this path. No lor_sends table.

import { loadIdentifiedForLead } from "@/lib/property-ops";
import { brandHistoryForYear, type BrandHistoryEntry } from "@/lib/property-tool";
import {
  M6_LOR_RECIPIENT, M6_LOR_TEMPLATE_KEY, composeLorLetter, defaultLorFrom,
  franchiseeRecipientFromHistory, letterIsMoneyBlind, lorAlreadySent,
  pickLorRecipient, postgridMode, recipientCanMail,
  type LorRecipient,
} from "@/lib/m6-lor";

export const LOR_LEAD_COLS = "id, firm_id, campaign, case_type, archived_at, first_name, last_name, full_name, claimant_name, lead_no, gender, incident_start, incident_end, property_name, property_street, property_city, property_state, property_zip, external_id, lawruler_ref_no";

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

export function stayYearFromLead(lead: any): number | null {
  const raw = String(lead?.incident_start || lead?.incident_end || "").slice(0, 4);
  const y = Number(raw);
  return Number.isFinite(y) && y >= 1980 ? y : null;
}

function serializeRecipient(r: LorRecipient) {
  return {
    key: r.key,
    orgName: r.orgName,
    attention: r.attention,
    address: [r.addressLine1, r.city, r.state, r.zip].filter(Boolean).join(", "),
    addressLine1: r.addressLine1,
    city: r.city,
    state: r.state,
    zip: r.zip,
    role: r.role,
    canMail: recipientCanMail(r),
  };
}

export async function loadStayYearOwner(sb: any, lead: any): Promise<BrandHistoryEntry | null> {
  const year = stayYearFromLead(lead);
  if (!year) return null;
  const rows = await loadIdentifiedForLead(sb, lead.firm_id, lead);
  for (const row of rows) {
    const hit = brandHistoryForYear(row.history, year);
    if (hit?.llc) return hit;
  }
  return null;
}

export async function previewPayload(lead: any, lor: any, sb?: any) {
  const recorded = sb ? await loadStayYearOwner(sb, lead) : null;
  const franchisee = franchiseeRecipientFromHistory(recorded);
  const letter = composeLorLetter(factsFromLead(lead), { recipient: M6_LOR_RECIPIENT });
  const key = process.env.POSTGRID_API_KEY || "";
  const mode = postgridMode(key);
  const already = lorAlreadySent(lor?.status);
  const recipients = [
    { ...serializeRecipient(M6_LOR_RECIPIENT), label: "G6 Hospitality — Plano, TX", recommended: true },
    ...(franchisee ? [{
      ...serializeRecipient(franchisee),
      label: franchisee.orgName,
      recommended: false,
    }] : []),
  ];
  return {
    letter: {
      subject: letter.subject,
      body: letter.body,
      html: letter.html,
      date: letter.date,
      clientName: letter.clientName,
      leadNo: letter.leadNo,
      recipient: serializeRecipient(letter.recipient),
      from: {
        companyName: letter.from.companyName,
        attention: letter.from.attention,
        phone: letter.from.phone,
        fax: letter.from.fax,
        email: letter.from.email,
        address: [letter.from.addressLine1, letter.from.city, letter.from.state, letter.from.zip].filter(Boolean).join(", "),
      },
      missing: letter.missing,
      moneyBlind: letterIsMoneyBlind(letter.body),
    },
    recipients,
    defaultRecipient: "g6",
    lor: lor ?? null,
    alreadySent: already,
    rails: {
      postgrid: mode !== "missing",
      mode,
      whatItDoes: mode === "live"
        ? "One click sends certified mail with return receipt to G6 via PostGrid."
        : mode === "test"
          ? "PostGrid test key is on. This creates a test letter. It will not go to a live mailbox."
          : "PostGrid key is not in Pages. You can preview. Send will not mail until a test or live key is set.",
    },
    canSend: letter.canSend && !already && mode !== "missing" && letterIsMoneyBlind(letter.body),
    canPreview: true,
  };
}

export async function sendLorViaPostgrid(
  sb: any,
  leadId: string,
  user: { id: string; name: string | null; role: string },
  lead: any,
  recipientKey?: string | null,
) {
  const { data: lor } = await sb.from("lead_lor")
    .select("lead_id, status, flagged_today, sent_on, sent_to")
    .eq("lead_id", leadId).eq("firm_id", lead.firm_id).maybeSingle();
  if (lorAlreadySent(lor?.status)) {
    return { status: 409 as const, body: { error: "This letter was already sent. We will not send it twice." } };
  }

  const recorded = await loadStayYearOwner(sb, lead);
  const franchisee = franchiseeRecipientFromHistory(recorded);
  const recipient = pickLorRecipient(recipientKey, franchisee);
  if (recipientKey === "franchisee" && recipient.key !== "franchisee") {
    return {
      status: 409 as const,
      body: { error: "That owner of record does not have a full mailing address yet. Send to G6, or add the address on Brand & owner." },
    };
  }

  const letter = composeLorLetter(factsFromLead(lead), { recipient });
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
          companyName: recipient.orgName,
          jobTitle: recipient.attention,
          addressLine1: recipient.addressLine1,
          city: recipient.city,
          provinceOrState: recipient.state,
          postalOrZip: recipient.zip,
          countryCode: recipient.countryCode,
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
        metadata: { lead_id: leadId, source: "claimreach-m6", sent_to: recipient.key },
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
  const sentTo = recipient.key === "franchisee" ? "franchisee" : "g6";
  const { error: lorErr } = await sb.from("lead_lor").upsert({
    lead_id: leadId,
    firm_id: lead.firm_id,
    status: "sent",
    flagged_today: false,
    sent_on: today,
    sent_to: sentTo,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }, { onConflict: "lead_id" });
  if (lorErr) return { status: 500 as const, body: { error: lorErr.message } };

  const note = [
    letter.subject,
    `PostGrid ${live ? "live" : "test"} ${postgridId || ""}`.trim(),
    tracking ? `Tracking ${tracking}` : "",
    `Sent to ${recipient.orgName}`,
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
      sent_to: sentTo,
    },
  };
}
