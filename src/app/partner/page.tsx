export const runtime = "edge";
export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { isPartnerIdentity, type PartnerSourceRef } from "@/lib/partner-access";
import { buildPartnerRows } from "@/lib/partner-dashboard";
import SignOut from "./SignOut";
import styles from "./partner.module.css";

function formatTime(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return `${date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

export default async function PartnerPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/partner-login");
  if (!isPartnerIdentity(user)) notFound();

  // The self-readable account row must be active. No app_users profile is
  // created for partner identities, so ordinary staff/firm RLS stays closed.
  const accountResult = await sb.from("partner_accounts")
    .select("auth_user_id, email, partner_key, active")
    .eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (accountResult.error || !accountResult.data || accountResult.data.email !== user.email?.toLowerCase()) notFound();
  const partnerKey = accountResult.data.partner_key;
  const admin = supabaseAdmin();
  const refsResult = await admin.from("partner_source_leads")
    .select("partner_key, source_system, source_lead_id, firm_id")
    .eq("partner_key", partnerKey).eq("source_system", "lawruler")
    .order("source_lead_id", { ascending: false }).limit(500);
  if (refsResult.error || (refsResult.data || []).length >= 500) throw new Error("Could not safely load the partner allowlist.");
  const refs = (refsResult.data || []) as PartnerSourceRef[];
  const firmIds = [...new Set(refs.map(r => r.firm_id))];
  const leadBatches = await Promise.all(firmIds.map(async firmId => {
    const ids = refs.filter(r => r.firm_id === firmId).map(r => r.source_lead_id);
    const result = await admin.from("leads")
      .select("id, firm_id, lawruler_ref_no, external_id, source_system, lead_no, claimant_name, first_name, last_name, phone, email, marketing_source, lawruler_created_at, created_at, first_dialed_at, last_called_at, call_outcome, assigned_agent, signed_at, vendor_fields")
      .eq("firm_id", firmId).in("lawruler_ref_no", ids).is("archived_at", null).limit(500);
    if (result.error || (result.data || []).length >= 500) throw new Error("Could not safely match partner leads.");
    return result.data || [];
  }));
  const leads = leadBatches.flat();
  const leadIds = leads.map(l => l.id);
  let claims: any[] = [], calls: any[] = [], agreements: any[] = [], agents: any[] = [];
  if (leadIds.length) {
    const [claimResult, callResult, agreementResult] = await Promise.all([
      admin.from("claims").select("id, lead_id, firm_id, campaign, status, dq_reason, dq_reason_key")
        .in("lead_id", leadIds).eq("campaign", "INNO MVA").limit(500),
      admin.from("call_logs").select("lead_id, firm_id, direction")
        .in("lead_id", leadIds).limit(2000),
      admin.from("esign_submissions").select("claim_id, lead_id, firm_id, provider, pax_index, voided_at, status, completed_pdf_path, cert_pdf_path, completed_at, signed_at")
        .in("lead_id", leadIds).eq("provider", "docuseal").limit(500),
    ]);
    if (claimResult.error || callResult.error || agreementResult.error || (claimResult.data || []).length >= 500 || (callResult.data || []).length >= 2000 || (agreementResult.data || []).length >= 500) {
      throw new Error("Could not safely load partner case activity.");
    }
    claims = claimResult.data || []; calls = callResult.data || []; agreements = agreementResult.data || [];
    const agentIds = [...new Set(leads.map(l => l.assigned_agent).filter(Boolean))];
    if (agentIds.length) {
      const result = await admin.from("app_users").select("id, full_name").in("id", agentIds);
      if (result.error) throw new Error("Could not load assigned-agent names.");
      agents = result.data || [];
    }
  }
  const statusResult = await admin.from("statuses").select("key, label, qualify, phase");
  if (statusResult.error) throw new Error("Could not load case statuses.");
  const rows = buildPartnerRows({ refs, leads, claims, calls, agreements, agents, statuses: statusResult.data || [] });
  const imported = rows.filter(r => r.syncState === "imported").length;
  const signed = rows.filter(r => r.signed).length;
  const dq = rows.filter(r => r.disqualified).length;
  const missing = rows.length - imported;

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div><div className={styles.brand}>Claim<span>Reach</span> <small>Partner</small></div>
        <h1>PR DIGITAL leads</h1><p>Read-only campaign reporting · {rows.length} approved source leads</p></div>
      <SignOut />
    </header>
    <section className={styles.stats} aria-label="Partner lead summary">
      <div><span>Approved leads</span><strong>{rows.length}</strong></div>
      <div><span>In ClaimReach</span><strong>{imported}</strong></div>
      <div><span>DocuSeal packet stored</span><strong>{signed}</strong></div>
      <div><span>Disqualified in ClaimReach</span><strong>{dq}</strong></div>
    </section>
    {missing > 0 && <p className={styles.notice}>{missing} approved source {missing === 1 ? "lead is" : "leads are"} awaiting import or identity review. Source statuses and call activity may be newer than ClaimReach until reconciliation completes.</p>}
    <p className={styles.caption}>Status from LawRuler is shown separately from ClaimReach case status. A signed count requires that matter's completed, non-voided DocuSeal agreement and stored PDF plus certificate. Speed to lead uses the source receipt time and the first dial recorded here; missing call data is shown as missing, never as zero.</p>
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Lead</th><th>Contact</th><th>Case state</th><th>DQ reason</th><th>Speed to lead</th><th>Follow-up</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.sourceLeadId}>
        <td><strong>{row.name || "Awaiting import"}</strong><small>LR #{row.sourceLeadId}{row.leadNo ? ` · ${row.leadNo}` : ""}</small><small>{row.marketingSource || "Source not recorded"}</small></td>
        <td>{row.phone || "Phone not synced"}<small>{row.email || "Email not synced"}</small></td>
        <td><strong>{row.claimStatus || (row.syncState === "import_pending" ? "Import pending" : "Review needed")}</strong><small>LawRuler: {row.sourceStatus || "Not synced"}</small>{row.signedAt && <small>Signed record: {formatTime(row.signedAt)}</small>}</td>
        <td>{row.disqualified ? (row.dqReason || "Reason not synced") : "—"}</td>
        <td>{row.speedMinutes === null ? "Not recorded here" : `${row.speedMinutes} min`}<small>Received: {formatTime(row.receivedAt)}</small><small>First dial: {formatTime(row.firstDialedAt)}</small></td>
        <td>{row.agentName || "Unassigned"}<small>ClaimReach calls: {row.claimReachCalls ?? "—"}</small><small>Last call: {formatTime(row.lastCalledAt)}</small></td>
      </tr>)}</tbody>
    </table></div>
  </main>;
}
