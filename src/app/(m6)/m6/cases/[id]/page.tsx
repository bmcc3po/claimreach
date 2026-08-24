export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import CaseFile from "@/components/m6/CaseFile";
import M6FirmFile from "@/components/m6/M6FirmFile";
import { m6CaseAccess } from "@/lib/m6";
import { isInternalRole } from "@/lib/permissions";
import { applyM6LeadFilters, loadM6Actor, loadM6Lead, getTmpFirmId } from "@/lib/m6-scope";
import { loadM6Rail, loadM6WorkspaceFile } from "@/lib/m6-file";
import { loadIdentifiedForLead } from "@/lib/property-ops";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const tmpFirmId = await getTmpFirmId(sb);
  const actor = await loadM6Actor(sb);
  if (!tmpFirmId || !actor) notFound();

  // Staff keep the existing retention CaseFile. Firm gets the internal file,
  // fenced. Same m6 access check either way.
  if (isInternalRole(actor.role)) {
    return <StaffCasePage sb={sb} id={id} tmpFirmId={tmpFirmId} actor={actor} />;
  }

  const file = await loadM6WorkspaceFile(sb, id, tmpFirmId, actor.role);
  if (!file || m6CaseAccess(actor, file.lead, tmpFirmId) !== "ok") notFound();
  const rail = await loadM6Rail(sb, id, tmpFirmId, file.lead);

  return (
    <M6FirmFile
      lead={file.lead}
      claims={file.claims}
      claimProperties={file.claimProperties}
      audit={file.audit}
      notes={file.notes}
      callLogs={file.callLogs}
      staff={file.staff}
      formsByType={file.formsByType}
      retainers={file.retainers}
      signables={file.signables}
      fence={file.fence}
      lor={rail.lor}
      identified={rail.identified}
      points={rail.points}
      status={rail.status}
      comms={rail.comms}
      docs={rail.docs}
    />
  );
}

async function StaffCasePage({
  sb, id, tmpFirmId, actor,
}: {
  sb: any; id: string; tmpFirmId: string; actor: { role: string; firmSlug: string | null };
}) {
  const lead = await loadM6Lead(
    sb, id, tmpFirmId,
    "id, firm_id, campaign, case_type, archived_at, created_at, lead_no, claimant_name, full_name, first_name, last_name, phone, phone_alt, email, dob, gender, incident_start, incident_end, property_name, property_street, property_city, property_state, property_zip, case_description, comms_monitored, lawruler_url, retention_owner, retention_cadence_days, retention_started_at, retention_stage, retention_paused_until, retention_pause_reason, mail_addr1, mail_city, mail_state, mail_zip, ec_name, ec_relationship, ec_phone, ec_message_script, external_id, lawruler_ref_no",
  );
  if (m6CaseAccess(actor, lead, tmpFirmId) !== "ok") notFound();

  const [{ data: status }, { data: points }, { data: notes }, { data: comms }, { data: sched }, { data: docs }, { data: lor }, identified] =
    await Promise.all([
      applyM6LeadFilters(sb.from("lead_contact_status").select("*").eq("lead_id", id), tmpFirmId).maybeSingle(),
      sb.from("contact_points").select("*").eq("lead_id", id).eq("firm_id", tmpFirmId).is("retired_at", null).order("kind"),
      sb.from("lead_notes").select("id, body, created_at, author, pinned, source").eq("lead_id", id).eq("firm_id", tmpFirmId).eq("source", "m6").order("created_at", { ascending: false }).limit(50),
      sb.from("communications").select("id, channel, direction, outcome, purpose, body, duration_sec, agent_name, occurred_at, ladder_step").eq("lead_id", id).eq("firm_id", tmpFirmId).order("occurred_at", { ascending: false }).limit(50),
      sb.from("call_schedule").select("id, due_at, kind, note, status, assigned_to, ladder_step").eq("lead_id", id).eq("firm_id", tmpFirmId).eq("status", "open").order("due_at"),
      sb.from("case_documents").select("id, file_name, doc_type, created_at").eq("lead_id", id).eq("firm_id", tmpFirmId).order("created_at", { ascending: false }),
      sb.from("lead_lor").select("lead_id, status, flagged_today, sent_on, sent_to").eq("lead_id", id).eq("firm_id", tmpFirmId).maybeSingle(),
      loadIdentifiedForLead(sb, tmpFirmId, { ...(lead as any), id }),
    ]);

  const nameIds = [...new Set([
    ...(notes ?? []).map((n: any) => n.author),
    ...(sched ?? []).map((s: any) => s.assigned_to),
  ].filter(Boolean))];
  const nameOf = new Map<string, string | null>();
  const roleOf = new Map<string, string | null>();
  if (nameIds.length) {
    const { data } = await supabaseAdmin()
      .from("app_users")
      .select("id, full_name, role")
      .in("id", nameIds);
    for (const u of data ?? []) {
      nameOf.set(u.id, u.full_name);
      roleOf.set(u.id, u.role);
    }
  }

  return (
    <CaseFile
      key={id}
      lead={lead as any}
      status={status as any}
      points={(points ?? []) as any}
      notes={(notes ?? []).map((n: any) => ({
        ...n,
        author_name: nameOf.get(n.author) ?? null,
        author_side: n.author && isInternalRole(roleOf.get(n.author) ?? null) ? "staff" : "firm",
      }))}
      comms={(comms ?? []) as any}
      schedule={(sched ?? []).map((s: any) => ({ ...s, assigned_name: nameOf.get(s.assigned_to) ?? null }))}
      docs={(docs ?? []) as any}
      lor={lor ?? null}
      identified={identified}
    />
  );
}
