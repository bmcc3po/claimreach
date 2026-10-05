import { signatureReport } from "@/lib/signature-report";

/** Paginate instead of silently reporting the first 300/1,000 files. A failed
 * evidence query must fail the report, never turn signed files into unsigned. */
export async function reportPages(query: () => any): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query().order("id", { ascending: true }).range(offset, offset + 499);
    if (result.error) throw new Error("Could not load the complete signature report. Refresh to try again.");
    rows.push(...(result.data || []));
    if ((result.data || []).length < 500) return rows;
  }
}
export async function loadSignatureReport(sb: any, campaign: { id: string; firm_id: string; firm_email: string | null }) {
  const claims = await reportPages(() => sb.from("claims").select("id,lead_id,firm_id,campaign_id,claim_type,status,firm_send_result")
    .eq("firm_id", campaign.firm_id));
  const ids = [...new Set(claims.filter(c => c.campaign_id === campaign.id && c.claim_type === "mva").map(c => c.lead_id))];
  const chunks = async (table: string, columns: string, column = "lead_id", extra?: (q: any) => any) => {
    const rows: any[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      rows.push(...await reportPages(() => {
        const q = sb.from(table).select(columns).eq("firm_id", campaign.firm_id).in(column, ids.slice(i, i + 100));
        return extra ? extra(q) : q;
      }));
    }
    return rows;
  };
  const [leads, submissions, emergencies, originals, confirmations, deliveries, templates, owners] = await Promise.all([
    chunks("leads", "id,lead_no,claimant_name,firm_id,external_id,archived_at,signed_at,vendor_fields", "id"),
    chunks("esign_submissions", "id,lead_id,firm_id,claim_id,campaign_id,pax_index,status,signed_at,created_at,voided_at,replacement_requested_at,agent_reviewed_at,completed_pdf_path,cert_pdf_path,template_key,sent_by"),
    chunks("signable_documents", "id,lead_id,firm_id,status,signed_at,created_at,audit", "lead_id", q => q.not("audit->emergency->>claim_id", "is", null)),
    chunks("lead_activity", "id,lead_id,firm_id,meta", "lead_id", q => q.eq("meta->>source", "lawruler").eq("meta->>event", "original_document")),
    chunks("lead_activity", "id,lead_id,firm_id,meta,actor", "lead_id", q => q.eq("meta->>event", "owner_signed_delivery_confirmation")),
    chunks("firm_deliveries", "id,lead_id,firm_id,claim_id,campaign_id,ok,to_email,cc_email,created_at"),
    reportPages(() => sb.from("esign_templates").select("id,key").eq("firm_id", campaign.firm_id).eq("campaign_id", campaign.id).like("key", "REHEARSAL_%")),
    reportPages(() => sb.from("app_users").select("id,email").eq("role", "owner").eq("active", true)),
  ]);
  // Staff can work across firms without an app_users.firm_id. Resolve only
  // senders referenced by the selected firm's scoped signing records.
  const senderIds = [...new Set(submissions.map(s => s.sent_by).filter(Boolean))];
  const users: any[] = [];
  for (let i = 0; i < senderIds.length; i += 100) users.push(...await reportPages(() => sb.from("app_users")
    .select("id,full_name").in("id", senderIds.slice(i, i + 100))));
  const ownerEmail = owners.find(u => String(u.email || "").toLowerCase() === "bmc@innovativeintake.com")?.email || null;
  return signatureReport({ firmId: campaign.firm_id, campaignId: campaign.id, firmEmail: campaign.firm_email, ownerEmail,
    leads, claims, submissions, emergencies, originals, confirmations, ownerIds: owners.map(u => u.id), deliveries, users, rehearsalKeys: templates.map(t => t.key) });
}
