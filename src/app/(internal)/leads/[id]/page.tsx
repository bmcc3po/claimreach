export const runtime = "edge";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import LeadWorkspace from "@/components/LeadWorkspace";
import { loadIdentifiedForLead } from "@/lib/property-ops";
import { loadFileNotes, mergeFileNotes } from "@/lib/file-notes";
import { resolveLeadKey, leadKeyOf } from "@/lib/lead-key";
import CanonicalUrl from "@/components/CanonicalUrl";
import { APP_CASE_TYPES } from "@/lib/mva-call/links";
import { caseSummaryRows } from "@/lib/mva-call/server";

export default async function LeadDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ classic?: string }> }) {
  const { id: key } = await params;
  const { classic } = await searchParams;
  const sb = await supabaseServer();
  // /leads/TMP-1042 or the long internal ID.
  const id = await resolveLeadKey(sb, key);
  if (!id) notFound();

  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  // INNO MVA files are worked in the App, wide on a computer. The classic page
  // is still one click away (?classic=1) for status, QA, lock and send to firm.
  if (APP_CASE_TYPES.includes(String(lead.case_type || "")) && classic !== "1") redirect(`/app/${leadKeyOf(lead)}`);

  let { data: claims } = await sb.from("claims").select("*")
    .eq("lead_id", id).order("created_at");

  // Auto-create a default claim if this lead has none yet (legacy leads).
  if (!claims || claims.length === 0) {
    const { data: created } = await sb.from("claims").insert({
      firm_id: lead.firm_id, lead_id: lead.id,
      claim_type: lead.case_type ?? "motel_trafficking",
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
    .select("id, created_at, actor_name, category, description")
    .eq("lead_id", id).order("created_at", { ascending: false }).limit(200);

  // Call logs for this file.
  const { data: callLogs } = await sb.from("call_logs")
    .select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100);

  // Lightweight my-day stats placeholder (wired to real metrics later).
  const stats = { signed: 0, tierA: 0, weekPay: 0, wip: claims?.length ?? 0 };

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
  const { data: meRow } = await sb.from("app_users").select("role, full_name").eq("id", cur!.id).maybeSingle();
  (lead as any).current_user_role = meRow?.role ?? null;
  (lead as any).current_user_name = meRow?.full_name ?? "Staff";

  // Resolve published builder forms for each claim type present on this file,
  // so the workspace renders the RIGHT questionnaire (not the trafficking default).
  const { resolveIntakeFields } = await import("@/lib/forms");
  const { intakeForType } = await import("@/lib/questionnaire");
  const formsByType: Record<string, any[]> = {};
  for (const ct of Array.from(new Set((claims ?? []).map((c: any) => c.claim_type)))) {
    // The campaign that owns this claim type on this file, so a campaign fork
    // wins over the shared master and the workspace shows what the agent saw.
    const ctCampaign = (claims ?? []).find((c: any) => c.claim_type === ct)?.campaign_id
      ?? (lead as any)?.campaign_id ?? null;
    const resolved = await resolveIntakeFields(sb, ct, ctCampaign);
    if (resolved !== intakeForType(ct)) formsByType[ct] = resolved;
  }

  // Files worked in the App (car accidents today): Case Questions shows the
  // App's answers, the one place those questions are asked. The old form only
  // shows when a file has answers from it.
  let appCall: { rows: { k: string; v: string }[]; answered: number; href: string; hasOld: boolean; when: string | null; agent: string | null; dispo: string | null } | null = null;
  if (APP_CASE_TYPES.includes(String(lead.case_type || ""))) {
    const { data: firmRow } = await sb.from("firms").select("name").eq("id", lead.firm_id).maybeSingle();
    (lead as any).firm_name = firmRow?.name ?? null;
    const { data: lastCall } = await sb.from("intake_calls").select("answers, agent_name, updated_at, disposition")
      .eq("lead_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const firstClaim: any = (claims ?? [])[0];
    const a = lastCall?.answers || firstClaim?.answers?.mva_call || {};
    const contact = new Set(["Name", "Lead", "Phone", "Email", "Date of birth"]);
    const rows = caseSummaryRows(lead, a);
    const oldKeys = Object.keys(firstClaim?.answers || {}).filter((k) => k !== "mva_call" && k !== "__meta");
    appCall = {
      rows, answered: rows.filter((r) => !contact.has(r.k)).length,
      href: `/app/${leadKeyOf(lead)}`, hasOld: oldKeys.length > 0,
      when: lastCall?.updated_at ?? null, agent: lastCall?.agent_name ?? null, dispo: lastCall?.disposition ?? null,
    };
  }

  return (
    <>
      <CanonicalUrl path={`/leads/${leadKeyOf(lead)}`} />
      <LeadWorkspace
        lead={lead}
        appCall={appCall}
        claims={claims ?? []}
        activity={activity ?? []}
        stats={stats}
        claimProperties={claimProperties}
        audit={audit ?? []}
        notes={notes ?? []}
        callLogs={callLogs ?? []}
        staff={staff ?? []}
        formsByType={formsByType}
        identified={identified}
        lor={lor ?? null}
        points={(points ?? []) as any}
        lastComm={lastComms?.[0] ?? null}
      />
    </>
  );
}
