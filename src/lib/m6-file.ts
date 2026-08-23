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
import { flattenIdentification, propertyLookupKeys } from "@/lib/property-tool";

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

  const [{ data: claims }, { data: notes }, { data: m6Notes }, { data: audit }, { data: callLogs }] =
    await Promise.all([
      sb.from("claims").select("*").eq("lead_id", leadId).order("created_at"),
      sb.from("notes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100),
      sb.from("lead_notes").select("id, body, created_at, author, pinned, source").eq("lead_id", leadId).eq("firm_id", tmpFirmId).order("created_at", { ascending: false }).limit(50),
      sb.from("audit_log").select("id, created_at, actor_name, category, description").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200),
      sb.from("call_logs").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100),
    ]);

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

  const fileNotes = [
    ...(notes ?? []).map((n: any) => ({
      ...n,
      author_name: n.author_name || nameOf.get(n.author) || n.author || "Staff",
    })),
    ...(m6Notes ?? []).map((n: any) => ({
      id: n.id,
      body: n.body,
      created_at: n.created_at,
      author: n.author,
      author_name: nameOf.get(n.author) || "File",
      scope: "file",
      source: n.source || "m6",
      pinned: n.pinned,
    })),
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

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
  const keys = propertyLookupKeys({ ...lead, id: lead.id || leadId });
  const [{ data: status }, { data: points }, { data: lor }, idRes] = await Promise.all([
    applyM6LeadFilters(sb.from("lead_contact_status").select("*").eq("lead_id", leadId), tmpFirmId).maybeSingle(),
    sb.from("contact_points").select("*").eq("lead_id", leadId).eq("firm_id", tmpFirmId).is("retired_at", null).order("kind"),
    sb.from("lead_lor").select("lead_id, status, flagged_today, sent_on, sent_to").eq("lead_id", leadId).eq("firm_id", tmpFirmId).maybeSingle(),
    keys.length
      ? sb.from("property_identifications")
          .select("id, remembered_brand, current_brand, brand_mismatch, stay_from, stay_to, properties_canonical (name, street, city, state, zip, address, lat, lng, current_brand)")
          .eq("firm_id", tmpFirmId)
          .in("lawruler_leadid", keys)
          .order("created_at")
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const identified = !idRes.error && idRes.data
    ? idRes.data.map((r: any) => flattenIdentification(r))
    : [];
  return { status, points: points ?? [], lor: lor ?? null, identified };
}
