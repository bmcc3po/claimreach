// ============================================================================
// E-sign state for the call console. One function moves an agreement forward
// (syncSubmission) and both the agent's screen poll and the DocuSeal webhook
// call it, so the two can never disagree about what happened.
// ============================================================================
import { getSubmission, statusFrom, STATUS_RANK, createTemplate } from "@/lib/docuseal";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";
import { uploadSignedDoc } from "@/lib/signed-docs";
import { TMP_MVA_PACKETS, type Packet } from "@/lib/esign-packets/tmp-mva";
import { notifySigned } from "@/lib/notify-signed";

/** Which packet set a campaign signs with. Only TMP MVA has one today. */
export function packetsFor(firmSlug: string | null | undefined, caseType: string | null | undefined): Record<string, Packet> | null {
  if (firmSlug === "tmp" && caseType === "mva") return TMP_MVA_PACKETS;
  return null;
}

/**
 * The DocuSeal template for one agreement on one campaign, current with the
 * packet. A packet change bumps its name (v2, v3), so a stored template with an
 * older name is replaced: DocuSeal makes the new one from the PDF and the row
 * points at it. Nothing is deleted. Setup and Send both come through here.
 */
export async function templateFor(admin: any, opts: {
  firmId: string; campaignId: string; key: string; packet: Packet; origin: string; actorId?: string | null; create?: boolean;
}): Promise<{ ok: true; templateId: string; made: boolean } | { ok: false; error: string; missing?: boolean }> {
  const { data: row } = await admin.from("esign_templates").select("template_id, name")
    .eq("campaign_id", opts.campaignId).eq("provider", "docuseal").eq("key", opts.key).maybeSingle();
  if (row && row.name === opts.packet.name) return { ok: true, templateId: String(row.template_id), made: false };
  if (!row && !opts.create) return { ok: false, missing: true, error: "E-sign is not set up for this campaign yet. An admin sets it up once from Calls." };
  const res = await createTemplate(opts.packet, opts.origin + opts.packet.path);
  if (!res.ok) return { ok: false, error: `DocuSeal would not make the ${opts.key} agreement: ${res.error}` };
  const templateId = String(res.data.id);
  const q = row
    ? admin.from("esign_templates").update({ template_id: templateId, name: opts.packet.name })
        .eq("campaign_id", opts.campaignId).eq("provider", "docuseal").eq("key", opts.key)
    : admin.from("esign_templates").insert({ firm_id: opts.firmId, campaign_id: opts.campaignId, provider: "docuseal", key: opts.key, template_id: templateId, name: opts.packet.name, created_by: opts.actorId ?? null });
  const { error } = await q;
  if (error) return { ok: false, error: `Made the ${opts.key} agreement in DocuSeal (id ${templateId}) but could not save it here: ${error.message}` };
  await recordAudit({ firm_id: opts.firmId, actor: opts.actorId ?? undefined, category: "system",
    description: `${row ? "Updated" : "Set up"} the ${opts.key} agreement in DocuSeal (${opts.packet.name}).`, meta: { template_id: templateId, replaced: row?.template_id ?? null } });
  return { ok: true, templateId, made: true };
}

/** "123456789" -> "123-45-6789"; "1234" -> "XXX-XX-1234". Anything else -> null. */
export function ssnForForm(raw: string | null | undefined): { printed: string; last4: string } | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 9) return { printed: `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`, last4: d.slice(5) };
  if (d.length === 4) return { printed: `XXX-XX-${d}`, last4: d };
  return null;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

/**
 * Pull DocuSeal's view of one agreement and move our row forward. Never moves
 * backwards (a stale poll after a webhook is a no-op). Returns the status.
 */
export async function syncSubmission(admin: any, row: any, opts: { actorName?: string; origin?: string } = {}): Promise<string> {
  if (!row?.submission_id) return row?.status || "sent";
  if (row.status === "completed") return "completed";
  const got = await getSubmission(row.submission_id);
  if (!got.ok) return row.status;
  const sub = got.data;
  const next = statusFrom(sub);
  if ((STATUS_RANK[next] ?? 0) <= (STATUS_RANK[row.status] ?? 0)) return row.status;

  const client = (sub.submitters || []).find((s) => s.role === "Client");
  const now = new Date().toISOString();
  const patch: Record<string, any> = { status: next, updated_at: now };
  if (!row.opened_at && (STATUS_RANK[next] >= STATUS_RANK.opened)) patch.opened_at = client?.opened_at || now;
  if (!row.signed_at && (STATUS_RANK[next] >= STATUS_RANK.signed)) patch.signed_at = client?.completed_at || now;

  if (next === "completed") {
    patch.completed_at = sub.completed_at || now;
    const doc = (sub.documents || [])[0];
    const firm = row.firm_id || "master";
    if (doc?.url) {
      const bytes = await fetchBytes(doc.url);
      if (bytes) {
        try { patch.completed_pdf_path = await uploadSignedDoc(admin, `${firm}/signed-ds-${row.submission_id}.pdf`, bytes); }
        catch (e: any) { patch.error = `Signed PDF did not store: ${e?.message || e}`; }
      } else patch.error = "Could not download the signed PDF from DocuSeal.";
    }
    if (sub.audit_log_url) {
      const bytes = await fetchBytes(sub.audit_log_url);
      if (bytes) {
        try { patch.cert_pdf_path = await uploadSignedDoc(admin, `${firm}/cert-ds-${row.submission_id}.pdf`, bytes); }
        catch (e: any) { patch.error = [patch.error, `Audit trail did not store: ${e?.message || e}`].filter(Boolean).join(" "); }
      }
    }
  }

  // Only the request that actually moves the row does the side effects.
  const { data: moved, error } = await admin.from("esign_submissions").update(patch)
    .eq("id", row.id).eq("status", row.status).select("id").maybeSingle();
  if (error) { console.error("esign sync update failed", error.message); return row.status; }
  if (!moved) return next;

  const wasSigned = (STATUS_RANK[row.status] ?? 0) >= STATUS_RANK.signed;
  if (!wasSigned && STATUS_RANK[next] >= STATUS_RANK.signed) {
    const res = await setClaimStatusForLeads({ leadIds: [row.lead_id], status: "signed_grievous", actorName: row.signer_name || "Client" });
    if (!res.ok) console.error("signed status failed", res.error);
    await admin.from("leads").update({ esign_date: new Date().toISOString().slice(0, 10) }).eq("id", row.lead_id);
    await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor_name: row.signer_name || "Client", category: "retainer",
      description: `${row.signer_name || "The client"} signed the agreement (DocuSeal).`, meta: { submission_id: row.submission_id } });
    // Tell the team. Once per agreement, never blocks the signing.
    await notifySigned(admin, { ...row, ...patch }, opts.origin);
  }
  if (next === "completed") {
    await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor_name: opts.actorName || "DocuSeal", category: "retainer",
      description: "Agreement complete. Signed copy stored.", meta: { submission_id: row.submission_id, path: patch.completed_pdf_path || null } });
  }
  if (next === "declined") {
    await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor_name: row.signer_name || "Client", category: "retainer",
      description: "The client declined to sign.", meta: { submission_id: row.submission_id } });
  }
  return next;
}
