export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import CaseFile from "@/components/m6/CaseFile";
import { m6CaseAccess } from "@/lib/m6";
import { isInternalRole } from "@/lib/permissions";
import { applyM6LeadFilters, loadM6Actor, loadM6Lead, getTmpFirmId } from "@/lib/m6-scope";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const tmpFirmId = await getTmpFirmId(sb);
  const actor = await loadM6Actor(sb);
  if (!tmpFirmId || !actor) notFound();

  const lead = await loadM6Lead(
    sb, id, tmpFirmId,
    "id, firm_id, campaign, case_type, archived_at, lead_no, claimant_name, full_name, first_name, last_name, phone, phone_alt, email, dob, case_description, comms_monitored, lawruler_url, retention_owner, retention_cadence_days, retention_paused_until, retention_pause_reason, mail_addr1, mail_city, mail_state, mail_zip, ec_name, ec_relationship, ec_phone, ec_message_script",
  );
  if (m6CaseAccess(actor, lead, tmpFirmId) !== "ok") notFound();

  const [{ data: status }, { data: points }, { data: notes }, { data: comms }, { data: sched }, { data: docs }] =
    await Promise.all([
      applyM6LeadFilters(sb.from("lead_contact_status").select("*").eq("lead_id", id), tmpFirmId).maybeSingle(),
      sb.from("contact_points").select("*").eq("lead_id", id).eq("firm_id", tmpFirmId).is("retired_at", null).order("kind"),
      sb.from("lead_notes").select("id, body, created_at, author, pinned, source").eq("lead_id", id).eq("firm_id", tmpFirmId).eq("source", "m6").order("created_at", { ascending: false }).limit(50),
      sb.from("communications").select("id, channel, direction, outcome, purpose, body, duration_sec, agent_name, occurred_at, ladder_step").eq("lead_id", id).eq("firm_id", tmpFirmId).order("occurred_at", { ascending: false }).limit(50),
      sb.from("call_schedule").select("id, due_at, kind, note, status, assigned_to, ladder_step").eq("lead_id", id).eq("firm_id", tmpFirmId).eq("status", "open").order("due_at"),
      sb.from("case_documents").select("id, file_name, doc_type, created_at").eq("lead_id", id).eq("firm_id", tmpFirmId).order("created_at", { ascending: false }),
    ]);

  // Firm JWTs can only read their own app_users row. Resolve names server-side
  // from the ids already on rows this user is allowed to see. Not an RLS change.
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
    />
  );
}
