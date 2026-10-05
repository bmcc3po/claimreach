import { scopeWorkArea, workArea, inWorkArea, areaHref } from '@/lib/work-area';
export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { STAGE_LABELS } from "@/lib/questionnaire";
import { isAcquisitionEligible, loadMvaAcquisitionHolds, type MvaAcquisitionSignal } from "@/lib/lawruler-mva-status";
import type { StatusDef } from "@/lib/statuses";
import { resolveFileStatus, SIGNED_QA_RETURN_STATUS } from "@/lib/statuses";
import { caseFileHref } from "@/lib/mva-call/links";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ view?: string; area?: string }> }) {
  const { view, area: requestedArea } = await searchParams;
  const area = workArea(requestedArea);
  const mode = view === "dial" ? "dial" : view === "fix" ? "fix" : "mine";
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  const { data: me } = await sb.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  const pilot = me?.role !== "owner";
  const { data: pilotCampaigns } = pilot
    ? await sb.from("campaigns").select("id, firms(slug)").eq("name", "INNO MVA").eq("case_type", "mva").eq("active", true).limit(2)
    : { data: null };
  const matches = (pilotCampaigns ?? []).filter((c: any) => c.firms?.slug === "tmp");
  const pilotCampaignId = matches.length === 1 ? matches[0].id : "00000000-0000-0000-0000-000000000000";
  const fileHref = (l: any) => areaHref(caseFileHref(me?.role || "agent", l.id, l.queueClaimId), area);

  // "mine" = working stack. "dial" = next to call. "fix" = WIP files QA sent back.
  let leads: any[] = [];
  let loadError = "";
  if (mode === "fix") {
    let q = sb.from("claims")
      .select("id, lead_id, firm_id, claim_type, campaign_id, status, updated_at, leads!inner(id, firm_id, campaign_id, case_type, archived_at, lead_no, claimant_name, stage, updated_at)")
      .is("leads.archived_at", null)
      .eq("status", SIGNED_QA_RETURN_STATUS).order("updated_at", { ascending: false }).limit(100);
    if (pilot) q = q.eq("campaign_id", pilotCampaignId).eq("claim_type", "mva").eq("leads.campaign_id", pilotCampaignId);
    const { data, error } = await scopeWorkArea(q, area, "claim_type");
    leads = (data ?? []).flatMap((c: any) => {
      const l = c.leads;
      if (!l || l.archived_at || c.lead_id !== l.id || c.firm_id !== l.firm_id || (pilot && l.campaign_id !== pilotCampaignId)) return [];
      return [{ ...l, updated_at: c.updated_at || l.updated_at, claims: [c], queueClaimId: c.id }];
    });
    if (error) loadError = "The working queue did not load. Refresh before calling anyone from this list.";
  } else {
    let q = sb.from("leads").select("id, firm_id, case_type, archived_at, lead_no, claimant_name, stage, updated_at, signed_at, claims(id, lead_id, firm_id, claim_type, campaign_id, status, firm_send_result)").is("archived_at", null).limit(100);
    if (pilot) q = q.eq("campaign_id", pilotCampaignId);
    // "My Work" is the files assigned to YOU, not the whole floor sorted by
    // recency (Astra round 4).
    if (mode === "mine") q = q.eq("assigned_agent", user!.id).order("updated_at", { ascending: false });
    else q = q.order("updated_at", { ascending: true });
    const { data, error } = await scopeWorkArea(q, area);
    leads = data ?? [];
    if (error) loadError = "The working queue did not load. Refresh before calling anyone from this list.";
  }

  // The agent pilot is INNO MVA only. A lead can have sibling matters, so the
  // campaign filter on the lead alone must not expose a non-MVA claim.
  if (pilot) leads = leads.flatMap(l => {
    const pilotClaims = (l.claims || []).filter((c: any) =>
      c.lead_id === l.id && c.firm_id === l.firm_id && c.campaign_id === pilotCampaignId && c.claim_type === "mva");
    return pilotClaims.length ? [{ ...l, claims: pilotClaims, queueClaimId: pilotClaims[0].id }] : [];
  });

  leads = leads.map(l => ({ ...l, claims: (l.claims || []).filter((c: any) => inWorkArea(c.claim_type, area)) }));
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
  let fixQuery = sb.from("claims").select("id, leads!inner(archived_at, campaign_id)", { count: "exact", head: true }).eq("status", SIGNED_QA_RETURN_STATUS).is("leads.archived_at", null);
  if (pilot) fixQuery = fixQuery.eq("campaign_id", pilotCampaignId).eq("claim_type", "mva").eq("leads.campaign_id", pilotCampaignId);
  const { count: fixCount } = await scopeWorkArea(fixQuery, area, "claim_type");

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
      {reviews.length > 0 && <details className="side-card"><summary>LawRuler status needs review ({reviews.length})</summary><p>Held matters are excluded from acquisition calls. An owner must review the source status.</p><ul>{reviews.map(r => <li key={r.claim_id}><Link href={`${pilot ? "/app" : "/leads"}/${r.lead_id}?claim=${r.claim_id}`}>{sourceLeads.get(r.lead_id)?.claimant_name || 'Open matter'}</Link>: {r.source_status || 'Status missing'} — {r.reason}</li>)}</ul></details>}
      <div className="cl-tabs">
        <Link className={`cl-tab ${mode === "mine" ? "cl-on" : ""}`} href={areaHref("/queue?view=mine", area)}>My Work</Link>
        <Link className={`cl-tab ${mode === "dial" ? "cl-on" : ""}`} href={areaHref("/queue?view=dial", area)}>Dial Queue</Link>
        <Link className={`cl-tab ${mode === "fix" ? "cl-on" : ""}`} href={areaHref("/queue?view=fix", area)}>Pending my fix{fixCount ? <span>{fixCount}</span> : null}</Link>
      </div>
      <div className="cl-tablewrap">
        <table className="cl-table">
          <thead><tr><th>Lead</th><th>Claimant</th><th>Status</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {(leads ?? []).map((l) => (
              <tr key={l.queueClaimId || l.id}>
                <td><Link className="cl-mono" href={fileHref(l)}>{l.lead_no}</Link></td>
                <td className="cl-t1">{l.claimant_name ?? "—"}</td>
                <td>{l.queueClaimId || l.claims?.length === 1 ? (() => {
                  const claim = (l.claims || []).find((c: any) => c.id === l.queueClaimId) || l.claims[0];
                  const status = resolveFileStatus(claim, statuses, !pilot && l.claims?.length === 1 && !!l.signed_at);
                  return <span className="cl-status"><span className={`cl-dot cl-${status.tone}`} />{status.label}</span>;
                })() : <span className="cl-status"><span className="cl-dot cl-info" />{STAGE_LABELS[l.stage] ?? l.stage}</span>}</td>
                <td className="cl-t2">{new Date(l.updated_at).toLocaleString()}</td>
                <td className="cl-c-act"><Link className="cl-link" href={fileHref(l)}>Open</Link></td>
              </tr>
            ))}
            {(!leads || leads.length === 0) && <tr><td colSpan={5}><div className="cl-empty"><b>Queue is empty</b>Nothing waiting on you right now.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
