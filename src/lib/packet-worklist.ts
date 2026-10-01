export type PacketRow = {
  leadId: string;
  claimId: string | null;
  leadNo: string;
  name: string;
  campaign: string;
  firm: string;
  signedAt: string;
  deliveredAt: string | null;
  agent: string;
  archived: boolean;
  stage: "ready" | "finish" | "held" | "delivered";
  stageLabel: string;
};

type Input = {
  submissions: any[];
  leads: any[];
  claims: any[];
  calls: any[];
  users: any[];
  firms: any[];
  deliveries: any[];
};

export function packetWorklist(input: Input): PacketRow[] {
  const byLead = new Map(input.leads.map((r) => [r.id, r]));
  const byClaim = new Map(input.claims.map((r) => [r.id, r]));
  const byCall = new Map(input.calls.map((r) => [r.id, r]));
  const byUser = new Map(input.users.map((r) => [r.id, r]));
  const byFirm = new Map(input.firms.map((r) => [r.id, r]));
  const claimCount = new Map<string, number>();
  for (const claim of input.claims) claimCount.set(claim.lead_id, (claimCount.get(claim.lead_id) || 0) + 1);
  const sentByMatter = new Map<string, any>();
  for (const delivery of input.deliveries.filter((d) => d.ok === true)) {
    const key = delivery.claim_id || delivery.lead_id;
    const prior = sentByMatter.get(key);
    if (!prior || delivery.created_at < prior.created_at) sentByMatter.set(key, delivery);
  }
  const byMatter = new Map<string, any[]>();
  for (const row of input.submissions) {
    if (row.pax_index != null) continue;
    const key = row.claim_id || row.lead_id;
    const group = byMatter.get(key) || [];
    group.push(row);
    byMatter.set(key, group);
  }
  const rows: PacketRow[] = [];
  for (const group of byMatter.values()) {
    group.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const row = group.find((item) => item.signed_at && !item.voided_at && !["voided", "cancelled"].includes(item.status));
    if (!row) continue;
    const lead = byLead.get(row.lead_id);
    if (!lead) continue;
    const claim = byClaim.get(row.claim_id);
    // The NETFLY original is an uploaded signed document, not a DocuSeal
    // acquisition packet. Do not silently count it as a delivered INNO deal.
    if ((claim?.claim_type || lead.case_type) !== "mva") continue;
    const call = byCall.get(row.call_id);
    const sender = byUser.get(row.sent_by);
    const firm = byFirm.get(claim?.firm_id || lead.firm_id);
    const delivery = sentByMatter.get(row.claim_id || row.lead_id);
    const legacySent = claim?.firm_sent_at || (claimCount.get(row.lead_id) === 1 && lead.firm_sent_at);
    const deliveredAt = delivery?.created_at || legacySent || null;
    const held = !!row.replacement_requested_at || group[0].id !== row.id;
    const ready = row.status === "completed" && !!row.agent_reviewed_at && !!row.completed_pdf_path && !!row.cert_pdf_path;
    const stage = deliveredAt ? "delivered" : held ? "held" : ready ? "ready" : "finish";
    rows.push({
      leadId: row.lead_id,
      claimId: row.claim_id || null,
      leadNo: lead.lead_no || "File",
      name: lead.claimant_name || row.signer_name || "Name missing",
      campaign: claim?.campaign || lead.campaign || "INNO MVA",
      firm: firm?.name || "Firm not mapped",
      signedAt: row.signed_at,
      deliveredAt,
      agent: call?.agent_name || sender?.full_name || "Unassigned",
      archived: !!lead.archived_at,
      stage,
      stageLabel: stage === "delivered" ? "Sent to firm" : stage === "held" ? "Correction held" : stage === "ready" ? "Ready to send" : "Finish signed packet",
    });
  }
  return rows.sort((a, b) => b.signedAt.localeCompare(a.signedAt));
}

export function pacificDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function mondayOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function shiftWeek(monday: string, weeks: number): string {
  const date = new Date(`${monday}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}
