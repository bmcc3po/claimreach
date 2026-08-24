// Server-only. Loads the SAME rows the internal /leads/[id] page loads, then
// the file fence strips staff/money. Do not invent a second file query.

import { supabaseAdmin } from "@/lib/supabase-server";
import { resolveIntakeFields } from "@/lib/forms";
import type { Field } from "@/lib/questionnaire";
import { isInternalRole } from "@/lib/permissions";
import {
  M6_FIRM_FENCE, fileSafeAudit, stripStaffFormFields, type FileFence,
} from "@/lib/file-fence";
import { applyM6LeadFilters, loadM6Lead } from "@/lib/m6-scope";
import { loadIdentifiedForLead } from "@/lib/property-ops";
import { loadFileNotes, mergeFileNotes } from "@/lib/file-notes";
import type { M6FeedItem } from "@/lib/m6";
export type { M6FeedItem };

export async function loadM6WorkspaceFile(
  sb: any,
  leadId: string,
  tmpFirmId: string,
  actorRole: string,
): Promise<{
  lead: any;
  claims: any[];
  claimProperties: Record<string, any[]>;
  audit: any[];
  notes: any[];
  callLogs: any[];
  staff: { id: string; full_name: string }[];
  formsByType: Record<string, Field[]>;
  retainers: any[];
  signables: any[];
  fence: FileFence;
} | null> {
  const lead = await loadM6Lead(sb, leadId, tmpFirmId, "*");
  if (!lead) return null;

  const [{ data: claims }, fileNotesRaw, { data: audit }, { data: callLogs }] =
    await Promise.all([
      sb.from("claims").select("*").eq("lead_id", leadId).order("created_at"),
      loadFileNotes(sb, leadId, tmpFirmId),
      sb.from("audit_log").select("id, created_at, actor_name, category, description").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200),
      sb.from("call_logs").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100),
    ]);
  const { notes, deskNotes: m6Notes } = fileNotesRaw;

  const claimRows = claims ?? [];
  const claimIds = claimRows.map((c: any) => c.id);
  const claimProperties: Record<string, any[]> = {};
  if (claimIds.length) {
    const { data: cp } = await sb.from("claim_properties")
      .select("*").in("claim_id", claimIds).order("sequence_order");
    for (const row of cp ?? []) (claimProperties[row.claim_id] ||= []).push(row);
  }

  // Firm JWT can only read its own app_users row. Resolve names for rows
  // already in scope. Same pattern as the existing m6 case page.
  const admin = supabaseAdmin();
  const authorIds = [...new Set((m6Notes ?? []).map((n: any) => n.author).filter(Boolean))];
  const staffIds = [...new Set([
    lead.intake_agent_id, lead.qa_agent_id, lead.case_manager_id, ...authorIds,
  ].filter(Boolean))];
  const staff: { id: string; full_name: string }[] = [];
  const nameOf = new Map<string, string>();
  if (staffIds.length) {
    const { data } = await admin.from("app_users").select("id, full_name").in("id", staffIds);
    for (const u of data ?? []) {
      staff.push({ id: u.id, full_name: u.full_name });
      if (u.full_name) nameOf.set(u.id, u.full_name);
    }
  }

  const fileNotes = mergeFileNotes(notes, m6Notes, nameOf);

  // intake_forms is internal-only RLS. Form *definitions* (not answers) are
  // loaded with admin so the firm sees the questions that were asked, then
  // staff scripting is stripped. Answers come from claims (firm-readable).
  const formsByType: Record<string, Field[]> = {};
  const claimTypes: string[] = Array.from(new Set<string>(
    claimRows.map((c: any) => String(c.claim_type || "")).filter((t: string) => t.length > 0),
  ));
  for (const ct of claimTypes) {
    const ctCampaign = claimRows.find((c: any) => c.claim_type === ct)?.campaign_id
      ?? lead.campaign_id ?? null;
    const resolved = await resolveIntakeFields(admin, ct, ctCampaign);
    formsByType[ct] = stripStaffFormFields(resolved);
  }

  const [{ data: retainers }, { data: signables }] = await Promise.all([
    admin.from("retainers")
      .select("id, status, created_at, rendered_body, signed_at, sent_at")
      .eq("lead_id", leadId).order("created_at", { ascending: false }),
    admin.from("signable_documents")
      .select("id, title, status, signed_at, completed_pdf_url, provider")
      .eq("lead_id", leadId).order("created_at", { ascending: false }),
  ]);

  lead.current_user_role = actorRole;
  lead.current_user_name = isInternalRole(actorRole) ? "Staff" : "Firm";
  delete lead.case_rating;
  delete lead.bill_rate;
  delete lead.week_pay;

  return {
    lead,
    claims: claimRows.map((c: any) => {
      const { tier_letter, tier_number, ...rest } = c;
      return rest;
    }),
    claimProperties,
    audit: fileSafeAudit(audit ?? [], M6_FIRM_FENCE),
    notes: fileNotes,
    callLogs: callLogs ?? [],
    staff,
    formsByType,
    retainers: retainers ?? [],
    signables: signables ?? [],
    fence: M6_FIRM_FENCE,
  };
}

export async function loadM6Rail(
  sb: any,
  leadId: string,
  tmpFirmId: string,
  lead: { id?: string | null; external_id?: string | null; lawruler_ref_no?: string | null },
) {
  const [{ data: status }, { data: points }, { data: lor }, identified, { data: comms }, { data: docs }] = await Promise.all([
    applyM6LeadFilters(sb.from("lead_contact_status").select("*").eq("lead_id", leadId), tmpFirmId).maybeSingle(),
    sb.from("contact_points").select("*").eq("lead_id", leadId).eq("firm_id", tmpFirmId).is("retired_at", null).order("kind"),
    sb.from("lead_lor").select("lead_id, status, flagged_today, sent_on, sent_to").eq("lead_id", leadId).eq("firm_id", tmpFirmId).maybeSingle(),
    loadIdentifiedForLead(sb, tmpFirmId, { ...lead, id: lead.id || leadId }),
    sb.from("communications").select("id, channel, direction, outcome, purpose, body, agent_name, occurred_at, ladder_step").eq("lead_id", leadId).eq("firm_id", tmpFirmId).order("occurred_at", { ascending: false }).limit(50),
    sb.from("case_documents").select("id, file_name, doc_type, created_at").eq("lead_id", leadId).eq("firm_id", tmpFirmId).order("created_at", { ascending: false }),
  ]);
  return {
    status,
    points: points ?? [],
    lor: lor ?? null,
    identified,
    comms: comms ?? [],
    docs: docs ?? [],
  };
}

export async function loadM6ConversationFeed(
  sb: any,
  tmpFirmId: string,
  leadIds: string[],
  nameOf: Map<string, string | null>,
  limit = 20,
): Promise<M6FeedItem[]> {
  if (!tmpFirmId || leadIds.length === 0) return [];
  const allowed = new Set(leadIds);
  const { data } = await sb.from("communications")
    .select("id, lead_id, channel, direction, body, occurred_at")
    .eq("firm_id", tmpFirmId)
    .not("lead_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(Math.max(limit * 4, 80));
  return (data ?? []).filter((c: any) => allowed.has(c.lead_id)).slice(0, limit).map((c: any) => ({
    id: c.id,
    lead_id: c.lead_id,
    name: nameOf.get(c.lead_id) || "Unnamed file",
    direction: c.direction === "inbound" ? "inbound" : "outbound",
    channel: c.channel || "call",
    snippet: String(c.body || "").replace(/\s+/g, " ").trim().slice(0, 140),
    occurred_at: c.occurred_at ?? null,
  }));
}
