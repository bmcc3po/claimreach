export const runtime = "edge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { STAGE_LABELS } from "@/lib/questionnaire";
import CommsPanel from "@/components/CommsPanel";
import StageControl from "@/components/StageControl";

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const { data: properties } = await sb.from("lead_properties")
    .select("*").eq("lead_id", id).order("sequence_order");
  const { data: notes } = await sb.from("lead_notes")
    .select("body, created_at").eq("lead_id", id).order("created_at", { ascending: false });

  const safe: string[] = Array.isArray(lead.comms_safe_channels) ? lead.comms_safe_channels : [];

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{lead.lead_no}</h2>
        <span className="badge stage">{STAGE_LABELS[lead.stage]}</span>
        <div className="spacer" />
        <Link className="btn secondary" href={`/intake/${lead.id}`}>Edit intake</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div>
          <div className="card">
            <strong>Claimant</strong>
            <div>{lead.claimant_name ?? <span className="muted">Not captured</span>}</div>
            <div className="muted">{lead.phone}</div>
            {lead.comms_monitored && <span className="badge flag" style={{ marginTop: 6 }}>monitored contact</span>}
          </div>

          <div className="section-title">Properties ({properties?.length ?? 0})</div>
          {(properties ?? []).map((p) => (
            <div className="card" key={p.id}>
              <div className="row">
                <strong>{p.name_as_recalled ?? "Unnamed property"}</strong>
                {p.brand_mismatch && <span className="badge flag">brand mismatch</span>}
              </div>
              <div className="muted">{p.address}</div>
              <div className="muted">
                Remembered: {p.remembered_brand ?? "—"} · Current: {p.current_brand ?? "—"} ·
                {" "}{p.stay_month ? `${p.stay_month}/${p.stay_year}` : "date n/a"}
              </div>
            </div>
          ))}
          {(!properties || properties.length === 0) &&
            <p className="muted">No properties identified yet.</p>}

          <div className="section-title">Notes</div>
          {(notes ?? []).map((n, i) => (
            <div className="card" key={i}>
              <div className="muted" style={{ fontSize: 12 }}>{new Date(n.created_at).toLocaleString()}</div>
              <div>{n.body}</div>
            </div>
          ))}
          {(!notes || notes.length === 0) && <p className="muted">No notes.</p>}
        </div>

        <div>
          <div className="card">
            <strong>Stage</strong>
            <div style={{ marginTop: 8 }}>
              <StageControl leadId={lead.id} current={lead.stage} />
            </div>
          </div>
          <CommsPanel
            leadId={lead.id}
            phone={lead.phone}
            monitored={!!lead.comms_monitored}
            safeChannels={safe}
          />
          <div className="card">
            <strong>References</strong>
            <div className="muted">TMP: {lead.firm_ref_no ?? "—"}</div>
            <div className="muted">LawRuler: {lead.lawruler_ref_no ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
