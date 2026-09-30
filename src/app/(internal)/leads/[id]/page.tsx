export const runtime = "edge";
import { notFound, redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import LeadWorkspace from "@/components/LeadWorkspace";
import { loadIdentifiedForLead } from "@/lib/property-ops";
import { loadFileNotes, mergeFileNotes } from "@/lib/file-notes";
import { resolveLeadKey, leadKeyOf } from "@/lib/lead-key";
import CanonicalUrl from "@/components/CanonicalUrl";
import { APP_CASE_TYPES } from "@/lib/mva-call/links";
import { caseSummaryRows } from "@/lib/mva-call/server";
import { caseReport } from "@/lib/mva-call/report";
import { matterRowsFilter } from "@/lib/matter";

export default async function LeadDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ classic?: string; claim?: string }> }) {
  const { id: key } = await params;
  const { claim: selectedClaimId } = await searchParams;
  const sb = await supabaseServer();
  // /leads/TMP-1042 or the long internal ID.
  const id = await resolveLeadKey(sb, key);
  if (!id) notFound();

  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  // INNO MVA files are worked in the App, wide on a computer. The classic page
  // is still one click away (?classic=1) for status, QA, lock and send to firm.
  // Speed to lead, open side: first staff open of the file stamps it (this
  // layout is internal-only, so a firm view can never stamp) — AFTER the
  // redirect decision, so a bounce to the App does not double-count
  // (Astra round 5: the stamp fired during render, before redirects).
  if (!lead.first_opened_at) {
    try {
      const { data: { user: opener } } = await sb.auth.getUser();
      await supabaseAdmin().from("leads").update({ first_opened_at: new Date().toISOString(), first_opened_by: opener?.id ?? null }).eq("id", lead.id).is("first_opened_at", null);
    } catch {}
  }

  let { data: claims, error: claimsError } = await sb.from("claims").select("*")
    .eq("lead_id", id).order("created_at");
  if (claimsError) throw new Error(`Could not read this file's matters: ${claimsError.message}`);
  if (selectedClaimId && !(claims ?? []).some((c: any) => c.id === selectedClaimId)) notFound();

  // Auto-create a default claim if this lead has none yet (legacy leads).
  if (!claims || claims.length === 0) {
    const { data: created } = await sb.from("claims").insert({
      firm_id: lead.firm_id, lead_id: lead.id,
      claim_type: lead.case_type ?? "motel_trafficking",
      campaign_id: lead.campaign_id, campaign: lead.campaign,
      is_this_file: true,
    }).select("*").single();
    claims = created ? [created] : [];
  }

  const { data: activity } = await sb.from("lead_activity")
    .select("kind, body, created_at").eq("lead_id", id)
    .order("created_at", { ascending: false });

  // Properties for each claim, grouped by claim_id.
  const claimIds = (claims ?? []).map((c) => c.id);
  const claimProperties: Record<string, any[]> = {};
  if (claimIds.length) {
    const { data: cp } = await sb.from("claim_properties")
      .select("*").in("claim_id", claimIds).order("sequence_order");
    for (const row of cp ?? []) {
      (claimProperties[row.claim_id] ||= []).push(row);
    }
  }

  // Audit trail for this file (Activity Log).
  const { data: audit } = await sb.from("audit_log")
    .select("id, claim_id, created_at, actor_name, category, description, meta")
    .eq("lead_id", id).order("created_at", { ascending: false }).limit(200);

  // Call logs for this file.
  const { data: callLogs } = await sb.from("call_logs")
    .select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100);

  // Lightweight my-day stats placeholder (wired to real metrics later).

  const { data: staff } = await sb.from("app_users").select("id, full_name").order("full_name");

  const [{ data: lor }, identified, fileNotesRaw, { data: points }, { data: lastComms }] = await Promise.all([
    sb.from("lead_lor").select("lead_id, status, flagged_today, sent_on, sent_to")
      .eq("lead_id", id).eq("firm_id", lead.firm_id).maybeSingle(),
    loadIdentifiedForLead(sb, lead.firm_id, lead),
    loadFileNotes(sb, id, lead.firm_id),
    sb.from("contact_points").select("id, kind, value, label, status")
      .eq("lead_id", id).eq("firm_id", lead.firm_id).is("retired_at", null).order("kind"),
    sb.from("communications").select("channel, direction, occurred_at, outcome, body, agent_name")
      .eq("lead_id", id).order("occurred_at", { ascending: false }).limit(1),
  ]);
  const nameOf = new Map((staff ?? []).map((u: any) => [u.id, u.full_name || ""]));
  const notes = mergeFileNotes(fileNotesRaw.notes, fileNotesRaw.deskNotes, nameOf);

  const { data: { user: cur } } = await authUser();
  const { data: meRow } = await sb.from("app_users").select("role, full_name, active, perm_overrides").eq("id", cur!.id).maybeSingle();
  (lead as any).current_user_role = meRow?.role ?? null;
  (lead as any).current_user_name = meRow?.full_name ?? "Staff";
  (lead as any).current_user_can_archive = meRow?.active !== false && (["owner", "admin"].includes(meRow?.role || "") || (meRow?.perm_overrides as any)?.["leads.delete"] === true);

  // Resolve published builder forms for each claim type present on this file,
  // so the workspace renders the RIGHT questionnaire (not the trafficking default).
  const { resolveIntakeFields } = await import("@/lib/forms");
  const { intakeForType } = await import("@/lib/questionnaire");
  const formsByType: Record<string, any[]> = {};
  const formsByClaim: Record<string, any[]> = {};
  for (const c of claims ?? []) {
    const ct = c.claim_type;
    // The campaign that owns this claim type on this file, so a campaign fork
    // wins over the shared master and the workspace shows what the agent saw.
    const ctCampaign = c.campaign_id ?? (claims?.length === 1 ? lead.campaign_id : null);
    const resolved = await resolveIntakeFields(sb, ct, ctCampaign);
    formsByClaim[c.id] = resolved;
  }

  // Files worked in the App (car accidents today): Case Questions shows the
  // App's answers, the one place those questions are asked. The old form only
  // shows when a file has answers from it.
  const appCalls: Record<string, { rows: { k: string; v: string }[]; answered: number; href: string; hasOld: boolean; when: string | null; agent: string | null; dispo: string | null }> = {};
  for (const claim of (claims ?? []).filter((c: any) => APP_CASE_TYPES.includes(String(c.claim_type || "")))) {
    const { data: firmRow } = await sb.from("firms").select("name").eq("id", lead.firm_id).maybeSingle();
    (lead as any).firm_name = firmRow?.name ?? null;
    const callScope = matterRowsFilter({ claim, sole: claims?.length === 1 });
    const { data: lastCall } = await sb.from("intake_calls").select("answers, agent_name, updated_at, disposition")
      .eq("lead_id", id).or(callScope).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    // A later intake edit can create a new, still-open call row. Keep its
    // answers/agent, but show the latest completed call outcome until the
    // agent actually closes another call. Do not infer one from e-sign status.
    const { data: lastDisposition } = await sb.from("intake_calls").select("disposition")
      .eq("lead_id", id).or(callScope).not("disposition", "is", null)
      .order("ended_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const a = claim?.answers?.mva_call || lastCall?.answers || {};
    const contact = new Set(["Name", "Lead", "Phone", "Email", "Date of birth"]);
    const report = caseReport({ ...lead, campaign: claim.campaign, case_type: claim.claim_type }, a);
    const reportRows = report.sections.flatMap((section) => section.rows);
    const rows = reportRows.map((r) => ({ k: r.q, v: r.a }));
    const oldKeys = Object.keys(claim?.answers || {}).filter((k) => k !== "mva_call" && k !== "__meta");
    appCalls[claim.id] = {
      rows, answered: reportRows.filter((r) => !r.missing && !!r.a && r.a !== "—").length,
      href: `/app/${leadKeyOf(lead)}?claim=${claim.id}`, hasOld: oldKeys.length > 0,
      when: lastCall?.updated_at ?? null, agent: lastCall?.agent_name ?? null, dispo: lastDisposition?.disposition ?? lastCall?.disposition ?? null,
    };
  }

  const { linkedFilesFor } = await import("@/lib/linked-files");
  const linked = await linkedFilesFor(sb, lead as any);

  return (
    <>
      <CanonicalUrl path={`/leads/${leadKeyOf(lead)}`} />
      <LeadWorkspace
        lead={lead}
        appCalls={appCalls}
        initialClaimId={selectedClaimId}
        claims={claims ?? []}
        activity={activity ?? []}
        claimProperties={claimProperties}
        audit={audit ?? []}
        notes={notes ?? []}
        callLogs={callLogs ?? []}
        staff={staff ?? []}
        formsByType={formsByType}
        formsByClaim={formsByClaim}
        identified={identified}
        lor={lor ?? null}
        points={(points ?? []) as any}
        lastComm={lastComms?.[0] ?? null}
        linked={linked}
      />
    </>
  );
}

