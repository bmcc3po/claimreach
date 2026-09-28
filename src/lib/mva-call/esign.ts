// ============================================================================
// E-sign state for the call console. One function moves an agreement forward
// (syncSubmission) and both the agent's screen poll and the DocuSeal webhook
// call it, so the two can never disagree about what happened.
// ============================================================================
import { getSubmission, statusFrom, STATUS_RANK, createTemplate, plainDocuSeal } from "@/lib/docuseal";
import { setClaimStatusForLeads, claimScopeFor } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";
import { listSubmissionDocs, uploadSignedDoc, SIGNED_BUCKET } from "@/lib/signed-docs";
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
  // Durable notify retry: a signed agreement whose team email never went out
  // (failed send, crash after claiming) retries on ANY later sync, not only
  // the first signed transition (Astra round 5). notifySigned claims the
  // marker atomically, so racing pollers still send exactly once.
  if ((STATUS_RANK[row.status] ?? 0) >= STATUS_RANK.signed && !row.signed_notified_at) {
    await notifySigned(admin, row, opts.origin);
  }
  if (row.status === "completed") {
    // A completed row missing ANY expected artifact (primary PDF, any
    // secondary in the packet per doc_count, or the certificate) keeps
    // retrying until the full manifest is stored (Astra rounds 2-5).
    if (await packetShort(admin, row)) await retryCompletedFiles(admin, row);
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
    // The packet's manifest size, checked at delivery. An empty provider
    // answer stays UNKNOWN (null), never a zero manifest (Astra round 5).
    patch.doc_count = docs.length || null;
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
    // The signature belongs to THIS submission's matter: the lead's claim on
    // the submission's campaign, never a sibling claim (Astra round 5).
    const claimIds = await claimScopeFor(row.lead_id, row.campaign_id ?? undefined);
    const res = await setClaimStatusForLeads({ leadIds: [row.lead_id], claimIds, status: "signed_grievous", actorName: row.signer_name || "Client" });
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

/** The storage folder one submission's files live in. */
function packetFolder(row: any): string {
  return row?.completed_pdf_path ? String(row.completed_pdf_path).split("/")[0] : (row?.firm_id || "master");
}

/** The exact storage paths a packet of `count` PDFs must have, in order. */
export function expectedPacketPaths(folder: string, submissionId: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) out.push(`${folder}/signed-ds-${submissionId}${i > 1 ? `-${i}` : ""}.pdf`);
  return out;
}

/**
 * Establish the packet's true size for a row whose stored count is missing or
 * zero, from DocuSeal itself. Null = could not be established (an unknown
 * packet is never treated as complete). Zero counts as unknown: a provider
 * that answered "no documents yet" during completion must not freeze the
 * manifest at zero forever (Astra round 5).
 */
export async function establishDocCount(admin: any, row: any): Promise<number | null> {
  if (row.doc_count != null && row.doc_count > 0) return row.doc_count;
  const got = await getSubmission(row.submission_id);
  if (!got.ok) return null;
  const n = (got.data.documents || []).length;
  if (n < 1) return null;
  await admin.from("esign_submissions").update({ doc_count: n })
    .eq("id", row.id).or("doc_count.is.null,doc_count.eq.0");
  return n;
}

/**
 * Is this completed row's stored packet anything less than whole? Whole means:
 * a known positive doc_count, every expected ordinal present in storage BY
 * EXACT NAME (a stray -99 never stands in for a missing -2), pointers for the
 * primary and certificate, and the certificate's OBJECT actually in storage —
 * a pointer is not a file (Astra round 5). Any listing error reads as short:
 * unknown is never complete.
 */
export async function packetShort(admin: any, row: any): Promise<boolean> {
  if (!row.completed_pdf_path || !row.cert_pdf_path) return true;
  if (row.doc_count == null || row.doc_count < 1) return true;
  const folder = packetFolder(row);
  try {
    const stored = await listSubmissionDocs(admin, folder, String(row.submission_id));
    for (const p of expectedPacketPaths(folder, String(row.submission_id), row.doc_count)) {
      if (!stored.includes(p)) return true;
    }
    const { data: certList, error: certErr } = await admin.storage.from(SIGNED_BUCKET)
      .list(folder, { limit: 100, search: `cert-ds-${row.submission_id}` });
    if (certErr) return true;
    const certNames = (certList ?? []).map((f: any) => `${folder}/${f.name}`);
    if (!certNames.includes(String(row.cert_pdf_path)) && !certNames.includes(`${folder}/cert-ds-${row.submission_id}.pdf`)) return true;
    return false;
  } catch { return true; }
}

// A completed submission whose files never stored: ask DocuSeal again and
// store whatever is still missing — including bytes missing BEHIND a live
// pointer, and a manifest still unknown or stuck at zero. Guarded so racing
// pollers write once.
async function retryCompletedFiles(admin: any, row: any): Promise<void> {
  try {
    const got = await getSubmission(row.submission_id);
    if (!got.ok) return;
    const sub = got.data;
    const folder = packetFolder(row);
    const recovered: string[] = [];
    // Recover EVERY missing document in the packet against the manifest, each
    // pointer with its own guarded write (Astra rounds 3 and 5: a present
    // primary must not stop a missing secondary or certificate, and a present
    // POINTER must not stop re-storing bytes that are gone from the bucket).
    const docs = sub.documents || [];
    let have: string[] = [];
    try { have = await listSubmissionDocs(admin, folder, String(row.submission_id)); } catch { have = []; }
    let primary: string | null = null; let extras = 0;
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (!doc?.url) continue;
      const path = `${folder}/signed-ds-${row.submission_id}${i ? `-${i + 1}` : ""}.pdf`;
      // Missing = no stored object at the exact expected name, or (for the
      // primary) no pointer either. A pointer with no object re-uploads the
      // bytes to the same deterministic path the pointer already names.
      const missing = !have.includes(path) || (i === 0 && !row.completed_pdf_path);
      if (!missing) continue;
      const bytes = await fetchBytes(doc.url);
      if (!bytes) continue;
      const stored = await uploadSignedDoc(admin, path, bytes);
      if (i === 0) primary = stored; else extras++;
    }
    if (primary) {
      const { data: hit } = await admin.from("esign_submissions")
        .update({ completed_pdf_path: primary, error: null })
        .eq("id", row.id).is("completed_pdf_path", null).select("id");
      if (hit?.length) recovered.push("the signed PDF");
      else if (!have.includes(primary)) recovered.push("the signed PDF's stored bytes");
    }
    if (extras) recovered.push(`${extras} more packet PDF${extras === 1 ? "" : "s"}`);
    if ((row.doc_count == null || row.doc_count < 1) && docs.length) {
      // Zero is unknown, not a manifest: replace it with the provider's real
      // count (Astra round 5: zero could never be corrected, so a two-PDF
      // packet passed a zero-count delivery check).
      await admin.from("esign_submissions").update({ doc_count: docs.length })
        .eq("id", row.id).or("doc_count.is.null,doc_count.eq.0");
    }
    // The certificate: recover when the pointer is missing OR the object
    // behind an existing pointer is gone.
    let certObjectMissing = !row.cert_pdf_path;
    if (!certObjectMissing) {
      try {
        const { data: certList, error: certErr } = await admin.storage.from(SIGNED_BUCKET)
          .list(folder, { limit: 100, search: `cert-ds-${row.submission_id}` });
        if (!certErr) {
          const names = (certList ?? []).map((f: any) => `${folder}/${f.name}`);
          certObjectMissing = !names.includes(String(row.cert_pdf_path)) && !names.includes(`${folder}/cert-ds-${row.submission_id}.pdf`);
        }
      } catch {}
    }
    if (certObjectMissing && sub.audit_log_url) {
      const bytes = await fetchBytes(sub.audit_log_url);
      if (bytes) {
        const cert = await uploadSignedDoc(admin, `${folder}/cert-ds-${row.submission_id}.pdf`, bytes);
        const { data: hit } = await admin.from("esign_submissions")
          .update({ cert_pdf_path: cert })
          .eq("id", row.id).is("cert_pdf_path", null).select("id");
        if (hit?.length) recovered.push("the signing certificate");
        else if (row.cert_pdf_path) recovered.push("the signing certificate's stored bytes");
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
