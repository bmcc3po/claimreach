import { NETFLY_ANSWER_KEY, NETFLY_CAMPAIGN, NETFLY_RETAINER_TYPE } from './netfly-ontake';
import { emailPlainText, extractNetflyEmail } from './netfly-handoff';
import { assertHandoffFirm, saveNetflyHandoff } from './netfly-handoff-save';
import { contentHash, emailObjectId, receivedPdf, type ReceivedEmail } from './resend-inbound';
import { netflyAgreementPdf } from './netfly-agreement-import';
import { netflyEmailSuggestions } from './netfly-email-suggestions';

type Campaign = { id: string; firm_id: string };
type Scope = { firmId: string; campaignId: string; leadId: string; claimId: string };
export async function netflyEmailCampaign(db: any): Promise<Campaign> {
  const firm = await db.from('firms').select('id').eq('slug', 'tmp').single();
  if (firm.error || !firm.data) throw new Error('NETFLY receiving firm is not configured.');
  const result = await db.from('campaigns').select('id, firm_id, firms(slug)')
    .eq('firm_id', firm.data.id).eq('name', NETFLY_CAMPAIGN).eq('case_type', 'mva').eq('path', 'secondary').eq('active', true).eq('esign_required', false).limit(2);
  if (result.error || result.data?.length !== 1 || result.data[0].firms?.slug !== 'tmp') throw new Error('NETFLY secondary campaign is not configured uniquely.');
  return result.data[0];
}

export async function preserveNetflySource(db: any, scope: Scope, name: string, bytes: Uint8Array, docType: string, contentType: string) {
  const hash = await contentHash(bytes);
  const id = await emailObjectId(`netfly-email-document|${scope.firmId}|${scope.claimId}|${hash}`);
  const ext = contentType === 'application/pdf' ? 'pdf' : 'txt';
  const path = `${scope.firmId}/${scope.leadId}/${scope.claimId}/netfly-email/${hash}.${ext}`;
  const existing = await db.from('case_documents').select('id, storage_path').eq('id', id).eq('firm_id', scope.firmId).eq('claim_id', scope.claimId).maybeSingle();
  if (existing.error) throw new Error('Could not check the existing email attachment.');
  if (existing.data) {
    if (existing.data.storage_path !== path) throw new Error('Existing email attachment identity does not match.');
    return id;
  }
  const bucket = db.storage.from('case-docs');
  const uploaded = await bucket.upload(path, bytes, { contentType, upsert: false });
  if (uploaded.error && String(uploaded.error.statusCode) !== '409' && !/already exists|duplicate/i.test(uploaded.error.message || ''))
    throw new Error('Incoming email attachment could not be stored.');
  if (uploaded.error) {
    const old = await bucket.download(path);
    if (old.error || !old.data || await contentHash(new Uint8Array(await old.data.arrayBuffer())) !== hash) throw new Error('Could not verify the previously stored email attachment.');
  }
  const saved = await db.from('case_documents').insert({ id, firm_id: scope.firmId, lead_id: scope.leadId, claim_id: scope.claimId,
    doc_type: docType, file_name: name, storage_path: path, uploaded_by_name: 'NETFLY email import' });
  if (saved.error && saved.error.code !== '23505') throw new Error('Email attachment stored but its file entry failed. Retry this email.');
  if (saved.error) {
    const raced = await db.from('case_documents').select('id, storage_path').eq('id', id).eq('firm_id', scope.firmId).eq('lead_id', scope.leadId).eq('claim_id', scope.claimId).maybeSingle();
    if (raced.error || raced.data?.storage_path !== path) throw new Error('Could not verify the saved attachment. Retry this email.');
  }
  return id;
}

export async function importNetflyEmail(db: any, campaign: Campaign, email: ReceivedEmail, apiKey: string, fetcher: typeof fetch = fetch, enrich = netflyEmailSuggestions) {
  const body = email.text?.trim() || emailPlainText(email.html || '').trim();
  await assertHandoffFirm(db, campaign.firm_id, body);
  const extraction = extractNetflyEmail(body);
  const fields = extraction.fields;
  const source = Object.fromEntries(extraction.rows.map(r => [r.label, r.value]));
  const name = fields.confirmed_name?.slice(0, 160) || 'NETFLY email — client name needed';
  // Exact repeated source content is idempotent even when forwarded twice.
  // A name alone or a shared phone never binds an original to an existing file.
  const fingerprint = extraction.agreementLinks.length === 1 && fields.confirmed_name
    ? `agreement:${new URL(extraction.agreementLinks[0]).pathname}|${fields.confirmed_name.toLowerCase().replace(/\s+/g, ' ').trim()}`
    : extraction.rows.length >= 2 && fields.confirmed_name
    ? JSON.stringify(extraction.rows) : email.message_id || email.id;
  const importKey = await emailObjectId(`netfly-source|${campaign.firm_id}|${campaign.id}|${fingerprint}`);
  let leadId = importKey;
  let leadNo = '';
  const lrId = /^\d{1,30}$/.test(source['LawRuler Lead ID'] || '') ? source['LawRuler Lead ID'] : '';
  if (lrId) {
    const match = await db.from('leads').select('id, lead_no, claimant_name, archived_at')
      .eq('firm_id', campaign.firm_id).eq('campaign_id', campaign.id)
      .or(`lawruler_ref_no.eq.${lrId},external_id.eq.${lrId}`).limit(2);
    if (match.error || match.data?.length > 1) throw new Error('LawRuler lead identity is ambiguous. Review before importing this email.');
    if (match.data?.length) {
      const target = match.data[0];
      if (target.archived_at || !fields.confirmed_name || target.claimant_name?.trim().toLowerCase() !== name.toLowerCase())
        throw new Error('The email does not match the active LawRuler client. Review before attaching the PDF.');
      leadId = target.id; leadNo = target.lead_no;
    }
  }
  let existing = await db.from('leads').select('id, lead_no, archived_at').eq('id', leadId).eq('firm_id', campaign.firm_id).eq('campaign_id', campaign.id).maybeSingle();
  if (existing.error) throw new Error('Could not check whether this email already has a file.');
  if (existing.data?.archived_at) throw new Error('This email belongs to an archived file. Restore it before importing.');
  let created = false;
  if (!existing.data) {
    const number = await db.rpc('mint_lead_no', { p_firm: campaign.firm_id });
    if (number.error || !number.data) throw new Error('Could not assign the incoming email a lead number.');
    const parts = name.split(/\s+/);
    const inserted = await db.from('leads').insert({ id: leadId, firm_id: campaign.firm_id, campaign_id: campaign.id,
      campaign: NETFLY_CAMPAIGN, case_type: 'mva', lead_no: number.data, claimant_name: name,
      first_name: fields.confirmed_name ? parts[0] : null, last_name: fields.confirmed_name ? parts.slice(1).join(' ') : null,
      phone: fields.confirmed_phone || null, email: fields.confirmed_email || null,
      external_id: `netfly-email:${importKey}`, source_system: 'netfly_email', marketing_source: 'NETFLY', stage: 'referral_received',
      perm_call: false, perm_text: false, perm_email: false });
    if (inserted.error && inserted.error.code !== '23505') throw new Error('Incoming lead could not be saved.');
    existing = await db.from('leads').select('id, lead_no, archived_at').eq('id', leadId).eq('firm_id', campaign.firm_id).eq('campaign_id', campaign.id).maybeSingle();
    if (existing.error || !existing.data || existing.data.archived_at) throw new Error('Incoming lead identity could not be verified after saving.');
    created = !inserted.error;
  }
  leadNo ||= existing.data.lead_no;
  const claims = await db.from('claims').select('id').eq('lead_id', leadId).eq('firm_id', campaign.firm_id).eq('campaign_id', campaign.id).limit(2);
  if (claims.error || claims.data?.length > 1) throw new Error('Incoming file has ambiguous matters. Review it before import.');
  const claimId = claims.data?.[0]?.id || await emailObjectId(`netfly-email-claim|${campaign.firm_id}|${leadId}`);
  if (!claims.data?.length) {
    const claim = await db.from('claims').insert({ id: claimId, firm_id: campaign.firm_id, lead_id: leadId,
      campaign_id: campaign.id, campaign: NETFLY_CAMPAIGN, claim_type: 'mva', status: 'new',
      answers: { [NETFLY_ANSWER_KEY]: { version: 1, fields: {}, review: { status: 'in_progress' } } } });
    if (claim.error && claim.error.code !== '23505') throw new Error('Lead saved but its intake did not save. Retry this email.');
    if (claim.error) {
      const raced = await db.from('claims').select('id').eq('id', claimId).eq('firm_id', campaign.firm_id).eq('campaign_id', campaign.id).eq('lead_id', leadId).maybeSingle();
      if (raced.error || !raced.data) throw new Error('Could not verify the incoming matter. Retry this email.');
    }
  }
  const scope = { firmId: campaign.firm_id, campaignId: campaign.id, leadId, claimId };
  const raw = `From: ${email.from}\nTo: ${email.to.join(', ')}\nSubject: ${email.subject}\nReceived: ${email.created_at}\nMessage-ID: ${email.message_id || email.id}\n\n${body}`;
  const original = await preserveNetflySource(db, scope, 'NETFLY original email.txt', new TextEncoder().encode(raw), 'other', 'text/plain');
  const note = body.length >= 10 ? body.slice(0, 20000) : `NETFLY email received. Body: ${body || '(empty)'}. Review the original email and attachments.`;
  const enrichment = await enrich(note);
  await saveNetflyHandoff(db, scope, note, extraction.candidates.map(c => c.id), {
    by: 'netfly_email', by_name: 'NETFLY email', channel: 'email', source_id: email.id,
  }, enrichment.suggestions);
  const pdfs = (email.attachments || []).filter(a => /\.pdf$/i.test(a.filename || '') || a.content_type === 'application/pdf');
  const warnings: string[] = [...extraction.warnings];
  const documentIds: string[] = [];
  if (!fields.confirmed_name) warnings.push('Client name missing');
  if (!fields.confirmed_phone) warnings.push('Client phone still needed');
  if (body.length > 20000) warnings.push('Long email: full text is in the original email document');
  if (pdfs.length > 8) warnings.push('More than eight PDFs: review the remaining attachments in Resend');
  let retry = false;
  for (const pdf of pdfs.slice(0, 8)) {
    try {
      const bytes = await receivedPdf(email.id, pdf.id, apiKey, fetcher);
      const safeName = (pdf.filename || 'signed-retainer.pdf').split(/[\\/]/).pop()!.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120);
      documentIds.push(await preserveNetflySource(db, scope, safeName, bytes, NETFLY_RETAINER_TYPE, 'application/pdf'));
    } catch { warnings.push(`PDF not imported: ${pdf.filename || 'attachment'}. Retry from Resend or upload it on the file.`); retry = true; }
  }
  if (!documentIds.length && extraction.agreementLinks.length === 1 && fields.confirmed_name) {
    try {
      const pdf = await netflyAgreementPdf(extraction.agreementLinks[0], fields.confirmed_name, fetcher);
      documentIds.push(await preserveNetflySource(db, scope, pdf.filename, pdf.bytes, NETFLY_RETAINER_TYPE, 'application/pdf'));
    } catch (error: any) {
      warnings.push(`Signed agreement needs attention: ${error.message || 'Download failed'}`);
      retry = true;
    }
  }
  if (!documentIds.length) warnings.push('Signed PDF missing');
  // Save the visible import receipt without replacing answers from the call.
  for (let attempt = 0; attempt < 4; attempt++) {
    const read = await db.from('claims').select('answers, updated_at').eq('id', claimId).eq('firm_id', campaign.firm_id).eq('campaign_id', campaign.id).single();
    if (read.error || !read.data) throw new Error('Could not record the email import receipt. Retry this email.');
    const answers = read.data.answers || {};
    const saved = await db.from('claims').update({ answers: { ...answers, [NETFLY_ANSWER_KEY]: { ...(answers[NETFLY_ANSWER_KEY] || {}),
      email_import: { email_id: email.id, received_at: email.created_at, original_document_id: original, document_ids: documentIds, warnings,
        status: retry || warnings.length ? 'partial' : 'needs_review', narrative_helper: enrichment.available ? 'available' : 'unavailable', source: 'resend', review_required: true } } }, updated_at: new Date().toISOString() })
      .eq('id', claimId).eq('firm_id', campaign.firm_id).eq('campaign_id', campaign.id).eq('updated_at', read.data.updated_at).select('id').maybeSingle();
    if (saved.error) throw new Error('The email receipt did not save. Retry this email.');
    if (saved.data) break;
    if (attempt === 3) throw new Error('The file changed while recording import. Retry this email.');
  }
  return { lead_id: leadId, claim_id: claimId, lead_no: leadNo, created, partial: warnings.length > 0, warnings, retry_required: retry };
}
