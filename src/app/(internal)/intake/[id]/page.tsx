import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import IntakeForm from "@/components/IntakeForm";

export default async function IntakeEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const { data: properties } = await sb.from("lead_properties")
    .select("*").eq("lead_id", id).order("sequence_order");

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Intake · {lead.lead_no}</h2>
        {lead.firm_ref_no && <span className="badge stage">TMP {lead.firm_ref_no}</span>}
      </div>
      <IntakeForm
        leadId={lead.id}
        firmId={lead.firm_id}
        initialLead={lead}
        initialProperties={properties ?? []}
      />
    </div>
  );
}
