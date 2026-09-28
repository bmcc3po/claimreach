export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { STAGE_LABELS } from "@/lib/questionnaire";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const mode = view === "dial" ? "dial" : view === "fix" ? "fix" : "mine";
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();

  // "mine" = working stack. "dial" = next to call. "fix" = WIP files QA sent back.
  let leads: any[] = [];
  if (mode === "fix") {
    const { data } = await sb.from("leads")
      .select("id, lead_no, claimant_name, stage, updated_at, wip_pending")
      .eq("wip_pending", true).order("updated_at", { ascending: false }).limit(100);
    leads = data ?? [];
  } else {
    let q = sb.from("leads").select("id, lead_no, claimant_name, stage, updated_at").limit(100);
    // "My Work" is the files assigned to YOU, not the whole floor sorted by
    // recency (Astra round 4).
    if (mode === "mine") q = q.eq("assigned_agent", user!.id).order("updated_at", { ascending: false });
    else q = q.order("updated_at", { ascending: true });
    const { data } = await q;
    leads = data ?? [];
  }

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
              <tr key={l.id}>
                <td><Link className="cl-mono" href={`/leads/${l.id}`}>{l.lead_no}</Link></td>
                <td className="cl-t1">{l.claimant_name ?? "—"}</td>
                <td><span className="cl-status"><span className="cl-dot cl-info" />{STAGE_LABELS[l.stage] ?? l.stage}</span></td>
                <td className="cl-t2">{new Date(l.updated_at).toLocaleString()}</td>
                <td className="cl-c-act"><Link className="cl-link" href={`/leads/${l.id}`}>Open</Link></td>
              </tr>
            ))}
            {(!leads || leads.length === 0) && <tr><td colSpan={5}><div className="cl-empty"><b>Queue is empty</b>Nothing waiting on you right now.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
