export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { STAGE_LABELS } from "@/lib/questionnaire";

export default async function LeadsPage() {
  const sb = await supabaseServer();
  const { data: leads } = await sb
    .from("leads")
    .select("id, lead_no, firm_ref_no, claimant_name, stage, supervisor_flag, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <div className="row" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Leads</h2>
        <div className="spacer" />
        <Link className="btn" href="/intake">+ New intake</Link>
      </div>

      <table className="docket">
        <thead>
          <tr>
            <th>Lead #</th><th>Claimant</th><th>Firm ref</th><th>Stage</th><th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {(leads ?? []).map((l) => (
            <tr key={l.id}>
              <td><Link href={`/leads/${l.id}`}>{l.lead_no}</Link></td>
              <td>{l.claimant_name ?? <span className="muted">—</span>}</td>
              <td>{l.firm_ref_no ?? <span className="muted">—</span>}</td>
              <td>
                <span className="badge stage">{STAGE_LABELS[l.stage] ?? l.stage}</span>
                {l.supervisor_flag && <span className="badge flag" style={{ marginLeft: 6 }}>flag</span>}
              </td>
              <td className="muted">{new Date(l.updated_at).toLocaleString()}</td>
            </tr>
          ))}
          {(!leads || leads.length === 0) && (
            <tr><td colSpan={5} className="muted">No leads yet. Start a new intake.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
