export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { STAGE_LABELS } from "@/lib/questionnaire";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const mode = view === "dial" ? "dial" : view === "fix" ? "fix" : "mine";
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  // "mine" = working stack. "dial" = next to call. "fix" = WIP files QA sent back.
  let leads: any[] = [];
  if (mode === "fix") {
    const { data } = await sb.from("leads")
      .select("id, lead_no, claimant_name, stage, updated_at, wip_pending")
      .eq("wip_pending", true).order("updated_at", { ascending: false }).limit(100);
    leads = data ?? [];
  } else {
    let q = sb.from("leads").select("id, lead_no, claimant_name, stage, updated_at").limit(100);
    if (mode === "mine") q = q.order("updated_at", { ascending: false });
    else q = q.order("updated_at", { ascending: true });
    const { data } = await q;
    leads = data ?? [];
  }

  // Count for the fix-inbox tab badge.
  const { count: fixCount } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("wip_pending", true);

  return (
    <div>
      <div className="row" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>My Queue</h2>
        <div className="spacer" />
        <div className="roles" style={{ background: "var(--surface-2)" }}>
          <Link className={`chip ${mode === "mine" ? "active" : ""}`} href="/queue?view=mine">My Work</Link>
          <Link className={`chip ${mode === "dial" ? "active" : ""}`} href="/queue?view=dial">Dial Queue</Link>
          <Link className={`chip ${mode === "fix" ? "active" : ""}`} href="/queue?view=fix">Pending my fix{fixCount ? ` (${fixCount})` : ""}</Link>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {mode === "mine" ? "Your working stack, most recently touched first." : mode === "dial" ? "Next leads to reach, least recently contacted first." : "Files QA sent back for a fix. Correct them, then resubmit so QA can re-review."}
      </p>
      <table className="docket">
        <thead><tr><th>Lead #</th><th>Claimant</th><th>Stage</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          {(leads ?? []).map((l) => (
            <tr key={l.id}>
              <td><Link href={`/leads/${l.id}`}>{l.lead_no}</Link></td>
              <td>{l.claimant_name ?? <span className="muted">—</span>}</td>
              <td><span className="badge stage">{STAGE_LABELS[l.stage] ?? l.stage}</span></td>
              <td className="muted">{new Date(l.updated_at).toLocaleString()}</td>
              <td><Link className="btn ghost" href={`/leads/${l.id}`}>Open →</Link></td>
            </tr>
          ))}
          {(!leads || leads.length === 0) && <tr><td colSpan={5} className="muted">Queue is empty.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
