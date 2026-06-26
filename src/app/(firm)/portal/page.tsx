import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { STAGE_LABELS } from "@/lib/questionnaire";

export default async function FirmDocket() {
  const sb = await supabaseServer();

  // RLS scopes both queries to the firm automatically.
  const { data: leads } = await sb.from("leads")
    .select("id, lead_no, firm_ref_no, stage, updated_at")
    .order("updated_at", { ascending: false }).limit(500);

  const { data: clusters } = await sb.from("properties_canonical")
    .select("id, name, address, current_brand, claimant_count")
    .order("claimant_count", { ascending: false }).limit(50);

  return (
    <div>
      <h2>Docket</h2>

      <div className="section-title">Property clusters (pattern strength)</div>
      <p className="muted" style={{ marginTop: 0 }}>
        Properties ranked by how many claimants independently identified them.
      </p>
      <table className="docket">
        <thead>
          <tr><th>Property</th><th>Brand</th><th>Address</th><th>Claimants</th></tr>
        </thead>
        <tbody>
          {(clusters ?? []).filter((c) => c.claimant_count > 0).map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.current_brand ?? "—"}</td>
              <td className="muted">{c.address}</td>
              <td><span className="badge count">{c.claimant_count}</span></td>
            </tr>
          ))}
          {(!clusters || clusters.every((c) => c.claimant_count === 0)) && (
            <tr><td colSpan={4} className="muted">No clustered properties yet.</td></tr>
          )}
        </tbody>
      </table>

      <div className="section-title">Cases</div>
      <table className="docket">
        <thead>
          <tr><th>Lead #</th><th>Firm ref</th><th>Stage</th><th>Updated</th></tr>
        </thead>
        <tbody>
          {(leads ?? []).map((l) => (
            <tr key={l.id}>
              <td><Link href={`/portal/${l.id}`}>{l.lead_no}</Link></td>
              <td>{l.firm_ref_no ?? <span className="muted">—</span>}</td>
              <td><span className="badge stage">{STAGE_LABELS[l.stage]}</span></td>
              <td className="muted">{new Date(l.updated_at).toLocaleString()}</td>
            </tr>
          ))}
          {(!leads || leads.length === 0) && (
            <tr><td colSpan={4} className="muted">No cases yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
