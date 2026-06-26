import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { STAGE_LABELS } from "@/lib/questionnaire";
import StageControl from "@/components/StageControl";

export default async function FirmLeadView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: lead } = await sb.from("leads")
    .select("id, lead_no, firm_ref_no, stage, claimant_name")
    .eq("id", id).maybeSingle();
  if (!lead) notFound();

  const { data: properties } = await sb.from("lead_properties")
    .select("name_as_recalled, address, remembered_brand, current_brand, brand_mismatch, stay_month, stay_year")
    .eq("lead_id", id).order("sequence_order");

  // Firm sees stage-change + doc activity only (RLS-enforced).
  const { data: activity } = await sb.from("lead_activity")
    .select("kind, body, created_at").eq("lead_id", id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{lead.lead_no}</h2>
        <span className="badge stage">{STAGE_LABELS[lead.stage]}</span>
      </div>

      <div className="card">
        <strong>Update stage</strong>
        <p className="muted" style={{ marginTop: 4 }}>
          You can advance this case as your firm completes each step.
        </p>
        <StageControl leadId={lead.id} current={lead.stage} firmMode />
      </div>

      <div className="section-title">Properties</div>
      {(properties ?? []).map((p, i) => (
        <div className="card" key={i}>
          <div className="row">
            <strong>{p.name_as_recalled ?? "Unnamed"}</strong>
            {p.brand_mismatch && <span className="badge flag">brand-on-date</span>}
          </div>
          <div className="muted">{p.address}</div>
          <div className="muted">
            Remembered {p.remembered_brand ?? "—"} · current {p.current_brand ?? "—"} ·
            {" "}{p.stay_month ? `${p.stay_month}/${p.stay_year}` : "date n/a"}
          </div>
        </div>
      ))}

      <div className="section-title">Activity</div>
      {(activity ?? []).map((a, i) => (
        <div className="card" key={i}>
          <div className="muted" style={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleString()}</div>
          <div>{a.kind === "stage_change" ? `Stage → ${STAGE_LABELS[a.body ?? ""] ?? a.body}` : a.body}</div>
        </div>
      ))}
      {(!activity || activity.length === 0) && <p className="muted">No activity yet.</p>}
    </div>
  );
}
