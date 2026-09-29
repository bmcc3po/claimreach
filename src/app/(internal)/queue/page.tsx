export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { STAGE_LABELS } from "@/lib/questionnaire";
import { isAcquisitionEligible, loadMvaAcquisitionHolds, type MvaAcquisitionSignal } from "@/lib/lawruler-mva-status";
import type { StatusDef } from "@/lib/statuses";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const mode = view === "dial" ? "dial" : view === "fix" ? "fix" : "mine";
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();

  // "mine" = working stack. "dial" = next to call. "fix" = WIP files QA sent back.
  let leads: any[] = [];
  let loadError = "";
  if (mode === "fix") {
    const { data, error } = await sb.from("leads")
      .select("id, firm_id, case_type, archived_at, lead_no, claimant_name, stage, updated_at, wip_pending, claims(id, lead_id, firm_id, claim_type, campaign_id, status)")
      .is("archived_at", null)
      .eq("wip_pending", true).order("updated_at", { ascending: false }).limit(100);
    leads = data ?? [];
    if (error) loadError = "The working queue did not load. Refresh before calling anyone from this list.";
  } else {
    let q = sb.from("leads").select("id, firm_id, case_type, archived_at, lead_no, claimant_name, stage, updated_at, claims(id, lead_id, firm_id, claim_type, campaign_id, status)").is("archived_at", null).limit(100);
    // "My Work" is the files assigned to YOU, not the whole floor sorted by
    // recency (Astra round 4).
    if (mode === "mine") q = q.eq("assigned_agent", user!.id).order("updated_at", { ascending: false });
    else q = q.order("updated_at", { ascending: true });
    const { data, error } = await q;
    leads = data ?? [];
    if (error) loadError = "The working queue did not load. Refresh before calling anyone from this list.";
  }

  const sourceLeads = new Map<string, any>(leads.map(l => [l.id, l]));
  let holds = new Map<string, MvaAcquisitionSignal>();
  const statusRes = await sb.from("statuses").select("*");
  let ready = !statusRes.error;
  try { holds = await loadMvaAcquisitionHolds(sb, leads.map(l => l.id)); }
  catch (error) { ready = false; loadError = error instanceof Error ? error.message : "Could not check external contact holds."; }
  if (statusRes.error) loadError = "Case statuses did not load. MVA acquisition calls are paused until they can be checked.";
  const statuses = (statusRes.data || []) as StatusDef[];
  const reviews = [...holds.values()].filter(r => r.outcome === 'review_required' && sourceLeads.get(r.lead_id)?.claims?.some((c: any) => c.id === r.claim_id && c.firm_id === r.firm_id));
  if (mode === 'dial') leads = leads.flatMap(l => {
    const claims = (l.claims || []).filter((c: any) => c.lead_id === l.id && c.firm_id === l.firm_id);
    const mva = claims.filter((c: any) => c.claim_type === 'mva');
    // Other campaigns retain their existing service/retention queue semantics.
    if (!mva.length) return l.case_type === 'mva' ? [] : [l];
    const rows = mva.filter((c: any) => ready && isAcquisitionEligible(l, c, { statuses, holds })).map((c: any) => ({ ...l, queueClaimId: c.id }));
    if (claims.some((c: any) => c.claim_type !== 'mva')) rows.push({ ...l, queueClaimId: claims.find((c: any) => c.claim_type !== 'mva').id });
    return rows;
  });

  // Count for the fix-inbox tab badge.
  const { count: fixCount } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("wip_pending", true);

  return (
    <div>
      <div className="cl-head">
        <div>
          <h1 className="cl-h1">My Queue</h1>
          <p className="cl-lede">
            {mode === "mine" ? "Your working stack, most recently touched first." : mode === "dial" ? "Next leads to reach, least recently contacted first." : "Files QA sent back for a fix. Correct them, then resubmit so QA can re-review."}
          </p>
        </div>
      </div>
      {loadError && <p role="alert">{loadError}</p>}
      {reviews.length > 0 && <details className="side-card"><summary>LawRuler status needs review ({reviews.length})</summary><p>Held matters are excluded from acquisition calls. An owner/admin must review the source status.</p><ul>{reviews.map(r => <li key={r.claim_id}><Link href={`/leads/${r.lead_id}?claim=${r.claim_id}`}>{sourceLeads.get(r.lead_id)?.claimant_name || 'Open matter'}</Link>: {r.source_status || 'Status missing'} — {r.reason}</li>)}</ul></details>}
      <div className="cl-tabs">
        <Link className={`cl-tab ${mode === "mine" ? "cl-on" : ""}`} href="/queue?view=mine">My Work</Link>
        <Link className={`cl-tab ${mode === "dial" ? "cl-on" : ""}`} href="/queue?view=dial">Dial Queue</Link>
        <Link className={`cl-tab ${mode === "fix" ? "cl-on" : ""}`} href="/queue?view=fix">Pending my fix{fixCount ? <span>{fixCount}</span> : null}</Link>
      </div>
      <div className="cl-tablewrap">
        <table className="cl-table">
          <thead><tr><th>Lead</th><th>Claimant</th><th>Stage</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {(leads ?? []).map((l) => (
              <tr key={l.queueClaimId || l.id}>
                <td><Link className="cl-mono" href={`/leads/${l.id}${l.queueClaimId ? `?claim=${l.queueClaimId}` : ''}`}>{l.lead_no}</Link></td>
                <td className="cl-t1">{l.claimant_name ?? "—"}</td>
                <td><span className="cl-status"><span className="cl-dot cl-info" />{STAGE_LABELS[l.stage] ?? l.stage}</span></td>
                <td className="cl-t2">{new Date(l.updated_at).toLocaleString()}</td>
                <td className="cl-c-act"><Link className="cl-link" href={`/leads/${l.id}${l.queueClaimId ? `?claim=${l.queueClaimId}` : ''}`}>Open</Link></td>
              </tr>
            ))}
            {(!leads || leads.length === 0) && <tr><td colSpan={5}><div className="cl-empty"><b>Queue is empty</b>Nothing waiting on you right now.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
