import { rowBelongsToMatter } from "@/lib/matter";
import { paxParentId } from "@/lib/linked-files";
import { clientSignatureConfirmed } from "@/lib/mva-call/passenger-signing";
import { confirmedFirmDeliveryAt, returnWindow } from "@/lib/firm-delivery-state";
import { pacificDay } from "@/lib/packet-worklist";
import { ownerConfirmedDelivery, ownerSignatureConfirmation } from "@/lib/owner-file-confirmation";
import { resolveFileStatus } from "@/lib/statuses";
import { isTestFile } from "@/lib/file-visibility";

export type SignatureState = "signed" | "unsigned" | "verify";
export type SignatureReportRow = {
  claimId: string; leadNo: string; name: string; href: string;
  state: SignatureState; detail: string; signedAt: string | null;
  deliveredAt: string | null; returnEndsAt: string | null;
  packet: string; status: string; agent: string; archived: boolean; test: boolean; ownerSent: boolean;
};
export type SignatureReportInput = {
  firmId: string; campaignId: string; firmEmail: string | null; ownerEmail: string | null;
  leads: any[]; claims: any[]; submissions: any[]; emergencies: any[];
  originals: any[]; confirmations: any[]; ownerIds: string[]; deliveries: any[]; users: any[]; rehearsalKeys: string[];
};
const validDate = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

/** Evidence report only: never changes a claim, delivery, or invoice status.
 * Use the signing workflow's matter, passenger and provider-status rules. */
export function signatureReport(input: SignatureReportInput): SignatureReportRow[] {
  const leads = new Map(input.leads.filter(l => l.firm_id === input.firmId).map(l => [l.id, l]));
  const users = new Map(input.users.map(u => [u.id, u.full_name]));
  const counts = new Map<string, number>();
  for (const c of input.claims) counts.set(c.lead_id, (counts.get(c.lead_id) || 0) + 1);
  return input.claims.filter(c => c.firm_id === input.firmId && c.campaign_id === input.campaignId && c.claim_type === "mva" && leads.has(c.lead_id)).map(c => {
    const l = leads.get(c.lead_id);
    const matter = { claim: c, sole: counts.get(l.id) === 1 };
    const own = (r: any) => r.firm_id === input.firmId && r.lead_id === l.id && rowBelongsToMatter(r, matter);
    const agreements = input.submissions.filter(r => own(r) && (r.pax_index == null || !!paxParentId(l.external_id)))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || String(b.id).localeCompare(String(a.id)));
    const current = agreements[0];
    const emergency = input.emergencies.filter(r => r.firm_id === input.firmId && r.lead_id === l.id && r.audit?.emergency?.claim_id === c.id)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    const superseded = emergency && !["cancelled", "declined"].includes(emergency.status) &&
      (!current || Date.parse(emergency.created_at) > Date.parse(current.created_at));
    const signed = !!current && !current.voided_at && clientSignatureConfirmed(current.status) && validDate(current.signed_at);
    const imported = input.originals.some(r => r.firm_id === input.firmId && r.lead_id === l.id && r.meta?.claim_id === c.id);
    const held = !!current?.replacement_requested_at || !!superseded;
    const uncertain = held || imported || agreements.some(r => !!r.signed_at) || !!emergency?.signed_at ||
      c.status === "external_signed_review" || (matter.sole && !!l.signed_at);
    const ownerSigned = !current && !superseded && imported && ownerSignatureConfirmation(input.confirmations, input.firmId, l.id, c.id, input.ownerIds);
    const state: SignatureState = signed && !held || ownerSigned ? "signed" : uncertain ? "verify" : "unsigned";
    const signedAt = state === "signed" && validDate(current?.signed_at) ? current.signed_at : null;
    const deliveredAt = confirmedFirmDeliveryAt(input.deliveries.filter(own), input.firmEmail, input.ownerEmail);
    const window = returnWindow(deliveredAt);
    const packet = ownerSigned ? "Imported — owner approved" : state !== "signed" ? "—" : current.status === "completed" && current.agent_reviewed_at && current.completed_pdf_path && current.cert_pdf_path
      ? "Office step complete" : "Office step needs review";
    return {
      claimId: c.id, leadNo: l.lead_no || "File", name: l.claimant_name || "Name missing",
      href: "/leads/" + encodeURIComponent(l.id) + "?claim=" + encodeURIComponent(c.id),
      state, signedAt, deliveredAt, returnEndsAt: window?.endsAt || null, packet,
      detail: ownerSigned ? "Signed — confirmed by owner; original date not supplied" : state === "signed" ? "Client signature confirmed" : held ? "Agreement correction or replacement needs review" :
        imported || c.status === "external_signed_review" ? "Imported agreement — verify the original and signing date" :
        uncertain ? "Signature history needs review" : "No current verified signature",
      status: resolveFileStatus(c, undefined, state === "signed").label,
      agent: users.get(current?.sent_by) || "Not recorded",
      archived: !!l.archived_at,
      ownerSent: ownerConfirmedDelivery(c.firm_send_result),
      test: isTestFile(l) || input.rehearsalKeys.includes("REHEARSAL_" + (paxParentId(l.external_id) || l.id) + "_OTHER") ||
        agreements.some(r => String(r.template_key || "").startsWith("REHEARSAL_")),
    };
  }).sort((a, b) => (b.signedAt || "").localeCompare(a.signedAt || "") || a.name.localeCompare(b.name));
}

export function signatureRowsInRange(rows: SignatureReportRow[], from: string, to: string) {
  return rows.filter(r => !from && !to || !!r.signedAt && (!from || pacificDay(r.signedAt) >= from) && (!to || pacificDay(r.signedAt) <= to));
}
export function signatureCsv(rows: SignatureReportRow[], firm: string, generatedAt: string) {
  const cell = (v: unknown) => {
    const value = String(v ?? "");
    return '"' + (/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replace(/"/g, '""') + '"';
  };
  const date = (v: string | null) => v ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "";
  const header = ["File", "Client", "Firm", "Signature", "Signed (Pacific)", "Office packet", "Firm delivery", "Delivered (Pacific)", "Return window ends (Pacific)", "Sending agent", "Workflow status", "Signature note", "Archived", "Test", "Invoice history", "File link", "Report generated (UTC)"];
  const body = rows.map(r => [r.leadNo, r.name, firm, r.state === "signed" ? "Signed" : r.state === "verify" ? "Needs verification" : "Not signed",
    date(r.signedAt), r.packet, r.deliveredAt ? "Confirmed" : r.ownerSent ? "Sent — owner confirmed; date unknown" : "Not recorded / verified", date(r.deliveredAt), date(r.returnEndsAt),
    r.agent, r.status, r.detail, r.archived ? "Yes" : "No", r.test ? "Yes" : "No", "Not tracked — reconcile prior invoices",
    "https://claimreach.com" + r.href, generatedAt]);
  return "\uFEFF" + [header, ...body].map(row => row.map(cell).join(",")).join("\r\n");
}
