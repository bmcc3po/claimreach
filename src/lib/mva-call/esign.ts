// ============================================================================
// E-sign state for the call console. One function moves an agreement forward
// (syncSubmission) and both the agent's screen poll and the DocuSeal webhook
// call it, so the two can never disagree about what happened.
// ============================================================================
import { getSubmission, statusFrom, STATUS_RANK, createTemplate, plainDocuSeal } from "@/lib/docuseal";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";
import { uploadSignedDoc } from "@/lib/signed-docs";
import { TMP_MVA_PACKETS, type Packet } from "@/lib/esign-packets/tmp-mva";
import { notifySigned } from "@/lib/notify-signed";

// The office's calendar date (America/Chicago), never the UTC date: a signature
// at 6 PM in Vegas belongs to "today", not tomorrow (Astra audit, Sep 27).
export function officeDateISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

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
  /** Make it new even when the stored one has the current name (it was gone or empty in DocuSeal). */
  force?: boolean;
}): Promise<{ ok: true; templateId: string; made: boolean } | { ok: false; error: string; missing?: boolean }> {
  const { data: row } = await admin.from("esign_templates").select("template_id, name")
    .eq("campaign_id", opts.campaignId).eq("provider", "docuseal").eq("key", opts.key).maybeSingle();
  if (row && row.name === opts.packet.name && !opts.force) return { ok: true, templateId: String(row.template_id), made: false };
  if (!row && !opts.create) return { ok: false, missing: true, error: "E-sign is not set up for this campaign yet. An admin sets it up once from Calls." };
  const res = await createTemplate(opts.packet, opts.origin + opts.packet.path);
  if (!res.ok) return { ok: false, error: plainDocuSeal(res.error, res.status, "template") };
  // Never store a template DocuSeal made without the signing boxes.
  const got = (res.data.fields || []).length;
  if (got < opts.packet.fields.length) {
    return { ok: false, error: `DocuSeal made the ${opts.key} agreement without all its signing boxes (${got} of ${opts.packet.fields.length}). Nothing was sent. Tell your admin: the agreement setup needs a fix.` };
  }
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
  if (row.status === "completed") {
    // A completed row missing ANY artifact (signed PDF or certificate) keeps
    // retrying until both land; it used to be stuck forever behind this early
    // return (Astra audit + review, Sep 27).
    if (!row.completed_pdf_path || !row.cert_pdf_path) await retryCompletedFiles(admin, row);
    return "completed";
  }
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
    const docs = sub.documents || [];
    const firm = row.firm_id || "master";
    // Store every document in the packet. The first is the primary the app
    // links; extras keep a -2, -3 suffix in the same private bucket.
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (!doc?.url) continue;
      const bytes = await fetchBytes(doc.url);
      const path = `${firm}/signed-ds-${row.submission_id}${i ? `-${i + 1}` : ""}.pdf`;
      if (bytes) {
        try {
          const stored = await uploadSignedDoc(admin, path, bytes);
          if (i === 0) patch.completed_pdf_path = stored;
        } catch (e: any) { patch.error = `Signed PDF did not store: ${e?.message || e}`; }
      } else if (i === 0) patch.error = "Could not download the signed PDF from DocuSeal.";
    }
    if (!docs.length) patch.error = "DocuSeal returned no documents for the completed agreement.";
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
    await admin.from("leads").update({ esign_date: officeDateISO() }).eq("id", row.lead_id);
    await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor_name: row.signer_name || "Client", category: "retainer",
      description: `${row.signer_name || "The client"} signed the agreement (DocuSeal).`, meta: { submission_id: row.submission_id } });
    // Tell the team. Once per agreement, never blocks the signing.
    await notifySigned(admin, { ...row, ...patch }, opts.origin);
  }
  if (next === "completed") {
    await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor_name: opts.actorName || "DocuSeal", category: "retainer",
      description: patch.completed_pdf_path ? "Agreement complete. Signed copy stored." : `Agreement complete, but the signed copy has NOT stored yet${patch.error ? ` (${patch.error})` : ""}. Retrying until it lands.`,
      meta: { submission_id: row.submission_id, path: patch.completed_pdf_path || null } });
  }
  if (next === "declined") {
    await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor_name: row.signer_name || "Client", category: "retainer",
      description: "The client declined to sign.", meta: { submission_id: row.submission_id } });
  }
  return next;
}

// A completed submission whose files never stored: ask DocuSeal again and
// store whatever is still missing. Guarded so racing pollers write once.
async function retryCompletedFiles(admin: any, row: any): Promise<void> {
  try {
    const got = await getSubmission(row.submission_id);
    if (!got.ok) return;
    const sub = got.data;
    const firm = row.firm_id || "master";
    const recovered: string[] = [];
    // Only fetch what is actually missing, and land each pointer with its own
    // guarded write, so a present primary never blocks a missing certificate
    // (Astra round 3: the old single update matched zero rows in that case
    // and still logged a recovery).
    if (!row.completed_pdf_path) {
      const docs = sub.documents || [];
      let primary: string | null = null;
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        if (!doc?.url) continue;
        const bytes = await fetchBytes(doc.url);
        if (!bytes) continue;
        const path = `${firm}/signed-ds-${row.submission_id}${i ? `-${i + 1}` : ""}.pdf`;
        const stored = await uploadSignedDoc(admin, path, bytes);
        if (i === 0) primary = stored;
      }
      if (primary) {
        const { data: hit } = await admin.from("esign_submissions")
          .update({ completed_pdf_path: primary, error: null })
          .eq("id", row.id).is("completed_pdf_path", null).select("id");
        if (hit?.length) recovered.push("the signed PDF");
      }
    }
    if (!row.cert_pdf_path && sub.audit_log_url) {
      const bytes = await fetchBytes(sub.audit_log_url);
      if (bytes) {
        const cert = await uploadSignedDoc(admin, `${firm}/cert-ds-${row.submission_id}.pdf`, bytes);
        const { data: hit } = await admin.from("esign_submissions")
          .update({ cert_pdf_path: cert })
          .eq("id", row.id).is("cert_pdf_path", null).select("id");
        if (hit?.length) recovered.push("the signing certificate");
      }
    }
    if (recovered.length) {
      await recordAudit({ firm_id: row.firm_id, lead_id: row.lead_id, actor_name: "System", category: "retainer",
        description: `Recovered ${recovered.join(" and ")} from DocuSeal on retry.`, meta: { submission_id: row.submission_id } });
    }
  } catch (e: any) {
    console.error("signed-file retry failed", e?.message || e);
  }
}
