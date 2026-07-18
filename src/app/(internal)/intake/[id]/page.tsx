export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import IntakeSurface from "@/components/IntakeSurface";

export default async function IntakeEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  // Resolve (or create) the active claim for this lead. A claim is the client's
  // enrollment under ONE campaign; the campaign drives intake + retainer + track.
  const { data: leadCampaign } = lead.campaign_id
    ? await sb.from("campaigns").select("id, case_type, intake_template, esign_required, retainer_packet, retainer_template_id").eq("id", lead.campaign_id).maybeSingle()
    : { data: null };

  let { data: claims } = await sb.from("claims").select("*").eq("lead_id", id).order("created_at");
  if (!claims || claims.length === 0) {
    // Derive the claim type from the campaign (authoritative), then the lead's
    // case_type, and only then leave it null. Never silently default to motel.
    const derivedType = leadCampaign?.case_type ?? lead.case_type ?? null;
    const { data: created } = await sb.from("claims").insert({
      firm_id: lead.firm_id, lead_id: lead.id, campaign_id: lead.campaign_id ?? null,
      claim_type: derivedType, is_this_file: true,
    }).select("*").single();
    claims = created ? [created] : [];
  }
  const claim = claims![0];

  // If the claim has a campaign, that campaign's intake_template is the source of
  // truth for which form loads. Fall back to claim_type only as a label, and
  // NEVER to motel: an unconfigured campaign shows a clear "needs setup" state.
  const { data: claimCampaign } = claim.campaign_id
    ? await sb.from("campaigns").select("id, case_type, intake_template, esign_required, retainer_packet, retainer_template_id").eq("id", claim.campaign_id).maybeSingle()
    : { data: leadCampaign };
  const formKey = claimCampaign?.intake_template || claimCampaign?.case_type || claim.claim_type || null;

  const { data: props } = await sb.from("claim_properties")
    .select("*").eq("claim_id", claim.id).order("sequence_order");

  // Published builder form for this key if one exists; else the built-in for the
  // key. If there is no key at all, customFields stays undefined and the intake
  // surfaces a "campaign not configured" message instead of a wrong form.
  const { resolveIntakeFields } = await import("@/lib/forms");
  const { intakeForType } = await import("@/lib/questionnaire");
  const resolved = formKey ? await resolveIntakeFields(sb, formKey) : null;
  const builtIn = formKey ? intakeForType(formKey) : null;
  const customFields = resolved && resolved !== builtIn ? resolved : undefined;
  const unconfigured = !formKey;

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Intake · {lead.lead_no}</h2>
        {lead.firm_ref_no && <span className="badge stage">TMP {lead.firm_ref_no}</span>}
        <div className="spacer" />
        <a className="btn ghost" href={`/leads/${lead.id}`}>Open full file →</a>
      </div>
      {unconfigured ? (
        <div className="card" style={{ padding: 20, borderColor: "var(--st-warn-bd)", background: "var(--st-warn-bg)" }}>
          <h3 style={{ marginTop: 0 }}>This campaign isn't configured yet</h3>
          <p className="muted" style={{ marginBottom: 0 }}>No intake questionnaire is set for this file's campaign. Set the campaign's intake template in Settings → Campaigns, then reopen this file. (We never fall back to a generic form, so the agent never reads the wrong questions.)</p>
        </div>
      ) : (
      <IntakeSurface
        claimId={claim.id}
        firmId={lead.firm_id}
        initialAnswers={claim.answers ?? {}}
        initialProperties={props ?? []}
        claimantName={lead.claimant_name ?? undefined}
        claimantEmail={lead.email ?? undefined}
        claimType={formKey ?? claim.claim_type}
        leadId={lead.id}
        customFields={customFields}
      />
      )}
    </div>
  );
}
