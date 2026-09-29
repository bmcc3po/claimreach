import { PDFDocument, StandardFonts } from "pdf-lib";
import { SIGNED_BUCKET, signedDocPath, signedDocLink } from "./signed-docs";
import { stampPdf } from "./pdf-stamp";
import { buildCertificatePdf } from "./certificate";
import { retainerTokens, fillTemplate } from "./retainer-tokens";
import { resolveSigningMatter, type SigningContext } from "./mva-call/signing-matter";

export const EMERGENCY_CONSENT_VERSION = "emergency-v1";
export const EMERGENCY_CONSENT_TEXT = "I have reviewed these documents, consent to electronic records and signatures, and adopt this signature as my electronic signature. This is an emergency in-house agreement; I may be asked to sign again through DocuSeal.";

export async function evidenceHash(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** A private, immutable source object. A conflicting upload never replaces it. */
async function storeOnce(db: any, path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await db.storage.from(SIGNED_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) {
    const stored = await db.storage.from(SIGNED_BUCKET).download(path);
    if (stored.error || !stored.data || await evidenceHash(new Uint8Array(await stored.data.arrayBuffer())) !== await evidenceHash(bytes)) throw new Error(`Could not store immutable document: ${error.message}`);
  }
}

// Text templates become a frozen review PDF, with an explicit signing area.
// The signer sees this exact PDF; no later live-template rendering is used.
async function textSource(title: string, body: string): Promise<{ bytes: Uint8Array; fields: any[] }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([612, 792]), y = 744;
  const clean = (s: string) => s.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  const print = (line: string) => { if (y < 64) { page = pdf.addPage([612, 792]); y = 744; } page.drawText(line, { x: 48, y, size: 11, font }); y -= 16; };
  for (const paragraph of clean(`${title}\n\n${body}`).split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (font.widthOfTextAtSize(`${line} ${word}`, 11) > 510 && line) { print(line); line = word; }
      else line = `${line} ${word}`.trim();
    }
    print(line || " ");
  }
  if (y < 140) { page = pdf.addPage([612, 792]); y = 744; }
  print("Client signature:");
  const p = pdf.getPageCount();
  const fields = [{ id: "emergency-signature", page: p, kind: "signature", role: "client", xPct: 8, yPct: (792 - y) / 792 * 100, wPct: 60, hPct: 7 }];
  return { bytes: await pdf.save(), fields };
}

/** Called only after caller-visible lead/claim/campaign validation. Snapshots
 * all packet documents first; one INSERT publishes the complete membership. */
export async function createEmergencyPacket(db: any, context: SigningContext, opts: {
  documents: { kind: string; id?: string; label?: string; body?: string }[];
  signerName: string; email?: string | null; phone?: string | null; actorId: string; senderIp: string;
  reason: string; replacesAgreementId?: string | null;
}): Promise<{ group: string; docs: any[] }> {
  if (!opts.reason.trim()) throw new Error("Record why emergency signing is needed.");
  if (!opts.documents.length || opts.documents.length > 30) throw new Error("Choose a complete emergency packet.");
  const group = `PKT-${crypto.randomUUID()}`;
  const ids = opts.documents.map(() => crypto.randomUUID());
  const lead = { ...context.lead, campaign_id: context.campaignId, campaign: context.matter.claim.campaign, case_type: context.matter.claim.claim_type };
  const tokens = retainerTokens(lead, context.matter.claim.answers ?? {});
  const rows: any[] = [];
  for (let i = 0; i < opts.documents.length; i++) {
    const item = opts.documents[i]; const envelope = `CR-${ids[i]}`;
    let title = item.label || "Agreement", fields: any[] = [], bytes: Uint8Array;
    let version: string | null = null;
    if (item.kind === "pdf") {
      const tpl = await db.from("pdf_templates").select("*").eq("id", item.id).maybeSingle();
      if (tpl.error || !tpl.data?.file_path || (tpl.data.firm_id && tpl.data.firm_id !== lead.firm_id)) throw new Error("This campaign's PDF template could not be loaded.");
      const source = await db.storage.from("retainer-pdfs").download(tpl.data.file_path);
      if (source.error || !source.data) throw new Error("The emergency PDF source is unavailable.");
      fields = tpl.data.fields || [];
      if (!fields.some((f: any) => ["signature", "initials"].includes(f.kind || f.type) && (!f.role || f.role === "client"))) throw new Error("This emergency PDF needs a client signature field in campaign setup.");
      title = item.label || tpl.data.name || title; version = tpl.data.updated_at || tpl.data.created_at || null;
      bytes = await stampPdf({ sourceBytes: new Uint8Array(await source.data.arrayBuffer()), fields: fields.filter((f: any) => !["signature", "initials", "date"].includes(f.kind || f.type)), signerName: opts.signerName, tokens });
    } else {
      let body = item.body;
      if (body == null) {
        const tpl = await db.from("retainer_templates").select("*").eq("id", item.id).maybeSingle();
        if (tpl.error || !tpl.data || (tpl.data.firm_id && tpl.data.firm_id !== lead.firm_id)) throw new Error("This campaign's text template could not be loaded.");
        body = fillTemplate(tpl.data.body || "", tokens); title = item.label || tpl.data.name || title; version = tpl.data.updated_at || tpl.data.created_at || null;
      }
      if (!String(body).trim()) throw new Error("The emergency agreement template is empty.");
      const rendered = await textSource(title, String(body)); bytes = rendered.bytes; fields = rendered.fields;
    }
    const sourcePath = `${lead.firm_id || "master"}/source-${envelope}.pdf`;
    await storeOnce(db, sourcePath, bytes);
    const snapshot = { source_path: sourcePath, source_sha256: await evidenceHash(bytes), fields, tokens,
      title, template_id: item.id ?? null, template_version: version, consent_version: EMERGENCY_CONSENT_VERSION, consent_text: EMERGENCY_CONSENT_TEXT };
    rows.push({ id: ids[i], firm_id: lead.firm_id, lead_id: lead.id, title, doc_type: "retainer", provider: "builtin", certified: false,
      status: "sent", signer_name: opts.signerName, signer_email: opts.email || null, signer_phone: opts.phone || null,
      sent_at: new Date().toISOString(), sender_ip: opts.senderIp, envelope_id: envelope, packet_group: group, packet_seq: i + 1,
      created_by: opts.actorId, audit: { emergency: { version: 1, claim_id: context.matter.claim.id, campaign_id: context.campaignId,
        reason: opts.reason.trim(), resign_required: true, replaces_agreement_id: opts.replacesAgreementId || null, packet_manifest: ids, snapshot } } });
  }
  const inserted = await db.from("signable_documents").insert(rows).select("id");
  if (inserted.error || inserted.data?.length !== rows.length) throw new Error(`The emergency packet did not save: ${inserted.error?.message || "incomplete result"}`);
  return { group, docs: rows };
}

export function emergencySnapshot(doc: any): any {
  const emergency = doc?.audit?.emergency;
  if (emergency?.version !== 1 || !emergency.snapshot?.source_sha256 || !emergency.snapshot?.source_path) throw new Error("This older emergency link has no frozen document. Ask the agent to issue a new emergency agreement.");
  return emergency.snapshot;
}

export async function emergencyView(db: any, doc: any): Promise<any> {
  const snap = emergencySnapshot(doc);
  const signed = await db.storage.from(SIGNED_BUCKET).createSignedUrl(snap.source_path, 300);
  if (signed.error || !signed.data?.signedUrl) throw new Error("The frozen agreement could not be opened. Please try again.");
  return { id: doc.id, title: doc.title, status: doc.status, signer_name: doc.signer_name, certified: false, envelope_id: doc.envelope_id,
    body_html: "", packet_seq: doc.packet_seq, consent_text: snap.consent_text, consent_version: snap.consent_version,
    pdf: { url: signed.data.signedUrl, fields: snap.fields, values: {}, file_name: `${doc.title}.pdf` } };
}

export async function finishEmergencyPacket(db: any, docs: any[], input: any, meta: { ip: string; ua: string }): Promise<any> {
  if (input.op === "resume") {
    if (!docs.length || docs.some((d) => !["signing", "signed"].includes(d.status) || !d.audit?.emergency?.evidence)) throw new Error("There is no recorded signature to resume.");
    // The capability holder may finish storing already-recorded evidence,
    // never replace it with a freshly drawn signature after a reload.
    input = { ...docs[0].audit.emergency.evidence, op: "sign" };
  }
  if (input.op !== "sign" || input.consent_accepted !== true || input.consent_version !== EMERGENCY_CONSENT_VERSION) throw new Error("Please review the documents and accept electronic signing before submitting.");
  const name = String(input.signed_name || "").trim();
  const signature = String(input.signature_data || "");
  if (name.length < 2 || name.length > 160 || signature.length > 2_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)) throw new Error("Add your name and a valid signature before submitting.");
  const probe = await PDFDocument.create();
  try { const image = await probe.embedPng(signature); if (image.width < 2 || image.height < 2) throw new Error("small"); } catch { throw new Error("The signature image is invalid. Please draw or type it again."); }
  const ids = docs.map((d) => d.id).sort();
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error("The packet could not be verified.");
  for (const doc of docs) {
    emergencySnapshot(doc);
    if (doc.certified || doc.provider !== "builtin" || !["sent", "viewed", "signing", "signed"].includes(doc.status)) throw new Error("This signing link is no longer open.");
    if (JSON.stringify([...doc.audit.emergency.packet_manifest].sort()) !== JSON.stringify(ids)) throw new Error("The packet membership changed. Ask the agent for a new link.");
  }
  const identity = docs[0].audit.emergency;
  const context = await resolveSigningMatter(db, docs[0].lead_id, { claimId: identity.claim_id });
  if (!context.ok) throw new Error(context.error);
  if (context.campaignId !== identity.campaign_id || docs.some((d) => d.lead_id !== context.lead.id || d.firm_id !== context.lead.firm_id || d.audit.emergency.claim_id !== identity.claim_id || d.audit.emergency.campaign_id !== identity.campaign_id)) throw new Error("This agreement's matter association changed. Ask the agent for a new link.");
  const type = ["type", "typed"].includes(input.signature_type) ? "typed" : "drawn";
  const hash = await evidenceHash(JSON.stringify({ ids, snapshots: docs.map((d) => [d.id, emergencySnapshot(d).source_sha256]).sort(), name, signature, type, consent_version: EMERGENCY_CONSENT_VERSION }));
  const claim = await db.rpc("begin_emergency_signing", { p_ids: ids, p_hash: hash, p_evidence: { signed_name: name, signature_data: signature, signature_type: type,
    consent_accepted: true, consent_version: EMERGENCY_CONSENT_VERSION, consent_text: EMERGENCY_CONSENT_TEXT, ip: meta.ip, ua: meta.ua } });
  if (claim.error || claim.data?.ok !== true) throw new Error(claim.error?.message || "The signature could not be recorded. Please retry.");
  const fresh = await db.from("signable_documents").select("*").in("id", ids).order("packet_seq");
  if (fresh.error || fresh.data?.length !== docs.length) throw new Error("Your signature was recorded, but its saved evidence could not be read. Retry the same signature.");
  const artifacts = [];
  for (const doc of fresh.data) {
    const snap = emergencySnapshot(doc);
    const stored = await db.storage.from(SIGNED_BUCKET).download(snap.source_path);
    if (stored.error || !stored.data) throw new Error("The frozen document is temporarily unavailable. Your signature is saved; retry to finish.");
    const sourceBytes = new Uint8Array(await stored.data.arrayBuffer());
    if (await evidenceHash(sourceBytes) !== snap.source_sha256) throw new Error("The frozen document no longer matches its recorded hash. Contact the agent.");
    const signedPath = signedDocPath(doc.firm_id, doc.envelope_id, "signed"), certPath = signedDocPath(doc.firm_id, doc.envelope_id, "cert");
    // All bytes are derived from the FIRST saved evidence, including its time.
    const stamped = await stampPdf({ sourceBytes, fields: snap.fields.filter((f: any) => ["signature", "initials", "date"].includes(f.kind || f.type)),
      signaturePng: doc.signature_data, signerName: doc.signed_name, signedDate: new Date(doc.signed_at) });
    const certificate = await buildCertificatePdf({ envelopeId: doc.envelope_id, title: doc.title, signerName: doc.signed_name, signerEmail: doc.signer_email,
      signerIp: doc.signed_ip, senderIp: doc.sender_ip, sentAt: doc.sent_at, viewedAt: doc.viewed_at, consentAt: doc.consent_at, signedAt: doc.signed_at,
      docHash: doc.doc_hash, signatureType: doc.signature_type });
    // PDF metadata timestamps may differ between renders; once stored, verify
    // presence and preserve the first artifact rather than overwriting it.
    for (const [path, bytes] of [[signedPath, stamped], [certPath, certificate]] as const) {
      const existing = await db.storage.from(SIGNED_BUCKET).download(path);
      if (!existing.data) await storeOnce(db, path, bytes);
    }
    artifacts.push({ id: doc.id, completed_pdf_path: signedPath, cert_pdf_path: certPath });
  }
  const result = await db.rpc("finish_emergency_signing", { p_ids: ids, p_hash: hash, p_artifacts: artifacts });
  if (result.error || result.data?.ok !== true) throw new Error(result.error?.message || "Your signature is saved but the packet is not complete yet. Retry to finish.");
  return { ok: true, signed: docs.length, needs_resign: true, already: !!result.data.already,
    document_url: signedDocLink(docs[0].id, "signed"), completed_pdf_url: signedDocLink(docs[0].id, "signed"), cert_pdf_url: signedDocLink(docs[0].id, "cert") };
}
