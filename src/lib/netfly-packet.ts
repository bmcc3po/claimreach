import { NETFLY_CAMPAIGN, NETFLY_RETAINER_TYPE, netflyFlags, validateNetflyCallClose } from './netfly-ontake';
import { contentHash } from './resend-inbound';

export async function netflyPacketReview(db: any, lead: any, claim: any, campaign: any) {
  if (campaign.name !== NETFLY_CAMPAIGN || campaign.path !== 'secondary' || campaign.esign_required !== false ||
      lead.firm_id !== campaign.firm_id || claim.firm_id !== campaign.firm_id || claim.lead_id !== lead.id ||
      claim.campaign_id !== campaign.id || lead.campaign_id !== campaign.id || claim.claim_type !== 'mva' || lead.archived_at)
    throw new Error('NETFLY packet does not match this active file and campaign.');
  const read = await db.from('case_documents').select('id, file_name, storage_path, created_at')
    .eq('firm_id', campaign.firm_id).eq('lead_id', lead.id).eq('claim_id', claim.id).eq('doc_type', NETFLY_RETAINER_TYPE)
    .order('created_at', { ascending: false });
  if (read.error) throw new Error('Could not check the signed PDF. Refresh and retry.');
  const latest = read.data?.[0];
  const saved = claim.answers?.netfly_secondary || {};
  // A newly uploaded original replaces the prior source packet. PDFs arriving
  // together in the same authenticated email remain one packet.
  const incoming = saved.email_import?.document_ids;
  const ids = latest && Array.isArray(incoming) && incoming.includes(latest.id) ? incoming : latest ? [latest.id] : [];
  const documents = (read.data || []).filter((row: any) => ids.includes(row.id));
  const errors: string[] = [];
  if (!documents.length || documents.length !== ids.length) errors.push('Import or upload the signed NETFLY PDF.');
  for (const doc of documents) {
    const path = String(doc.storage_path || '');
    if (!path.startsWith(`${campaign.firm_id}/${lead.id}/`) || /\.\.|%|\\|\/\//.test(path)) throw new Error('Signed PDF storage association is invalid.');
  }
  const revisions = saved.handoffs?.length || 0, fieldsRevision = saved.source_field_revisions?.length || 0;
  if (!revisions || saved.handoff_verification?.source_revision !== revisions || (saved.handoff_verification?.source_field_revision || 0) !== fieldsRevision)
    errors.push('Read back NETFLY’s note and choose Details match or Record changes.');
  const close = saved.call_close;
  if (!close || close.source_revision !== revisions || (close.source_field_revision || 0) !== fieldsRevision || validateNetflyCallClose(close))
    errors.push('Record the call result and the 24–48 hour callback promise.');
  else if (close.completion !== 'complete' || close.disposition !== 'appears_qualified') errors.push('This call needs follow-up or supervisor review before firm delivery.');
  if (saved.review?.status === 'correction_needed') errors.push('Resolve the signed-agreement correction before sending.');
  if (saved.review?.status === 'needs_supervisor') errors.push('A supervisor must resolve this file’s review flag before sending.');
  if (latest && saved.review?.retainer_reviewed_document_id !== latest.id) errors.push('Open the signed PDF and record your review.');
  if (netflyFlags(saved.fields || {}).length) errors.push('The flagged case details need supervisor attention before sending.');
  const to = String(campaign.firm_email || '').trim().toLowerCase();
  const configuredCc = String(campaign.firm_cc || '').split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const cc = [...new Set([...configuredCc, 'bmc@innovativeintake.com'])].filter(address => address !== to);
  const validEmail = (address: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(address);
  if (!validEmail(to) || configuredCc.some(address => !validEmail(address)) || to === 'bmc@innovativeintake.com') errors.push('Set a separate firm delivery email in the NETFLY campaign settings.');
  const snapshot = await contentHash(new TextEncoder().encode(JSON.stringify({
    lead: { id: lead.id, name: lead.claimant_name, phone: lead.phone, email: lead.email, address: [lead.mail_addr1, lead.mail_city, lead.mail_state, lead.mail_zip] },
    claim: claim.id, fields: saved.fields, handoffs: saved.handoffs, source: saved.source_field_revisions,
    verification: saved.handoff_verification, close, review: saved.review, documents, to, cc,
  })));
  return { errors, documents, to, cc, configuredCc, snapshot };
}

export async function netflyPacketBytes(db: any, documents: any[]) {
  if (!documents.length || documents.length > 8) throw new Error('The NETFLY packet needs between one and eight reviewed PDFs.');
  const files = []; let total = 0;
  for (const doc of documents) {
    const result = await db.storage.from('case-docs').download(doc.storage_path);
    if (result.error || !result.data || result.data.size > 15 * 1024 * 1024) throw new Error('The signed PDF could not be read. Retry or upload the original again.');
    const bytes = new Uint8Array(await result.data.arrayBuffer()); total += bytes.length;
    if (total > 20 * 1024 * 1024) throw new Error('The signed packet exceeds the 20 MB email attachment limit.');
    if (bytes.length < 100 || !new TextDecoder().decode(bytes.slice(0, 8)).startsWith('%PDF-') || !new TextDecoder().decode(bytes.slice(-2048)).includes('%%EOF')) throw new Error('A signed packet file is not a complete PDF.');
    const hash = /\/netfly-email\/([a-f0-9]{64})\.pdf$/.exec(doc.storage_path)?.[1];
    if (hash && await contentHash(bytes) !== hash) throw new Error('The saved signed PDF failed its integrity check.');
    files.push({ document: doc, bytes });
  }
  return files;
}
