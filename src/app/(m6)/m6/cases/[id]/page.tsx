export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import CaseFile from "@/components/m6/CaseFile";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: lead } = await sb.from("leads")
    .select("id, lead_no, claimant_name, full_name, first_name, last_name, phone, phone_alt, email, dob, case_description, comms_monitored, lawruler_url, retention_owner, retention_cadence_days, retention_paused_until, retention_pause_reason, mail_addr1, mail_city, mail_state, mail_zip, ec_name, ec_relationship, ec_phone, ec_message_script")
    .eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [{ data: status }, { data: points }, { data: notes }, { data: comms }, { data: sched }, { data: users }, { data: docs }] =
    await Promise.all([
      sb.from("lead_contact_status").select("*").eq("lead_id", id).maybeSingle(),
      sb.from("contact_points").select("*").eq("lead_id", id).is("retired_at", null).order("kind"),
      sb.from("lead_notes").select("id, body, created_at, author, pinned").eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
      sb.from("communications").select("id, channel, direction, outcome, purpose, body, duration_sec, agent_name, occurred_at, ladder_step").eq("lead_id", id).order("occurred_at", { ascending: false }).limit(50),
      sb.from("call_schedule").select("id, due_at, kind, note, status, assigned_to, ladder_step").eq("lead_id", id).eq("status", "open").order("due_at"),
      sb.from("app_users").select("id, full_name"),
      sb.from("case_documents").select("id, file_name, doc_type, created_at").eq("lead_id", id).order("created_at", { ascending: false }),
    ]);

  const nameOf = new Map((users ?? []).map((u: any) => [u.id, u.full_name]));

  return (
    <CaseFile
      lead={lead as any}
      status={status as any}
      points={(points ?? []) as any}
      notes={(notes ?? []).map((n: any) => ({ ...n, author_name: nameOf.get(n.author) ?? null }))}
      comms={(comms ?? []) as any}
      schedule={(sched ?? []).map((s: any) => ({ ...s, assigned_name: nameOf.get(s.assigned_to) ?? null }))}
      docs={(docs ?? []) as any}
      users={(users ?? []) as any}
    />
  );
}
