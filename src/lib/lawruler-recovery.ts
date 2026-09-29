// LawRuler recovery planning. Reading a plan never changes a file or runs automation.
import { mapLawRulerStatus, shouldApplyLr } from './lawruler-status';

export const lrKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
export function lrValue(fields: Record<string, any>, aliases: string[]): string | null {
  const hit = Object.entries(fields || {}).find(([key, value]) => aliases.includes(lrKey(key)) && value != null && String(value).trim() && !String(value).includes('{{'));
  return hit ? String(hit[1]).trim().slice(0, 500) : null;
}
export function lrSigningEvidence(fields: Record<string, any>) {
  const reported = lrValue(fields, ['signedcontractsreceived', 'contractssigned', 'retainersigned']);
  const rawDate = lrValue(fields, ['signedat', 'signeddate', 'datesigned', 'contractssignedat', 'retainersignedat']);
  // Only an explicit date field supplies a timestamp. "Yes" is never a date.
  const calendarValid = !!rawDate && Number.isFinite(Date.parse(rawDate.slice(0, 10))) && new Date(rawDate.slice(0, 10)).toISOString().slice(0, 10) === rawDate.slice(0, 10);
  const iso = rawDate && calendarValid && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(rawDate) && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
  return { source_signed_reported: /^(yes|true|1)$/i.test(reported || '') || !!iso, source_signed_value: reported, source_signed_at: iso, source_signed_date_raw: rawDate, signature_validation: 'not_performed' as const };
}

export function latestLawRulerSource(lead: any, activities: any[]) {
  const vendor = lead.vendor_fields || {};
  const raw = vendor.sources?.lawruler || {};
  const sources = [
    ...(vendor.lawruler_status || Object.keys(raw).length ? [{ label: vendor.lawruler_status || lrValue(raw, ['status', 'leadstatus']), at: raw._at || '', claim_id: null, fields: raw, source: 'saved_vendor_fields' }] : []),
    ...activities.filter(a => a.meta?.source === 'lawruler' && (a.meta?.status || a.meta?.event === 'source_snapshot')).map(a => ({ label: a.meta.status ? String(a.meta.status) : null, at: a.created_at || '', claim_id: a.meta.claim_id || null, fields: a.meta.source_fields || {}, source: 'lead_activity' })),
  ].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  return sources[0] || null;
}

// A later status-only hook must not erase a previously supplied signing date
// or the fact that the source reported a signature. This is provenance, not a
// claim that the signature is valid. Never borrow a sibling's history.
function signingHistory(lead: any, activities: any[], claimId: string | null, sole: boolean) {
  const scoped = activities.filter(a => a.meta?.source === 'lawruler' && (a.meta?.claim_id === claimId || (!a.meta?.claim_id && sole))).sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  const current = latestLawRulerSource(sole ? lead : { ...lead, vendor_fields: {} }, scoped);
  const snapshots = [lrSigningEvidence(current?.fields || {}), ...scoped.map(a => lrSigningEvidence(a.meta.source_fields || { 'Signed Contracts Received': a.meta.source_signed_reported, signed_at: a.meta.source_signed_at })), ...(sole ? [lrSigningEvidence(lead.vendor_fields?.sources?.lawruler || {})] : [])];
  const dated = snapshots.find(s => s.source_signed_at);
  const reported = snapshots.find(s => s.source_signed_reported);
  return { ...(dated || reported || snapshots[0]), source_signed_reported: !!reported, source_signed_at: dated?.source_signed_at || null };
}

/** One selected lead, with no guessed sibling or guessed status mapping. */
export function planLawRulerRecovery(lead: any, claims: any[], activities: any[], documents: any[]) {
  const source = latestLawRulerSource(lead, activities);
  const errors: string[] = [];
  const mine = claims.filter(c => c.lead_id === lead.id && c.firm_id === lead.firm_id);
  let claim = source?.claim_id ? mine.find(c => c.id === source.claim_id) : mine.length === 1 ? mine[0] : null;
  if (!source) errors.push('No saved LawRuler status or source payload is available.');
  if (!claim) errors.push(source?.claim_id ? 'The saved source names a missing or mismatched matter.' : mine.length > 1 ? 'Ambiguous matter: this source was not bound to a claim. Select and verify the source matter before applying.' : 'No matching matter exists.');
  const label = source?.label ? String(source.label) : null;
  const mapped = mapLawRulerStatus(label);
  if (!label) errors.push('The original LawRuler status label is missing.');
  if (label && !mapped) errors.push('Unknown LawRuler status: explicit owner/admin mapping approval is required.');
  const evidence = signingHistory(lead, activities, claim?.id || null, mine.length === 1);
  const docs = claim ? documents.filter(d => d.lead_id === lead.id && d.claim_id === claim.id && d.firm_id === lead.firm_id) : [];
  const imported = activities.filter(a => a.meta?.source === 'lawruler' && a.meta?.event === 'original_document' && a.meta?.claim_id === claim?.id);
  const originals = docs.filter(d => imported.some(a => a.meta.document_id === d.id)).map(d => {
    const meta = imported.find(a => a.meta.document_id === d.id)?.meta || {};
    return { document_id: d.id, file_name: d.file_name, doc_type: d.doc_type, sha256: meta.sha256, source_signed_at: meta.source_signed_at || null, original_stored: true };
  });
  return {
    firm_id: lead.firm_id, lead_id: lead.id, lead_no: lead.lead_no, vendor_lead_id: lead.lawruler_ref_no || lead.external_id || null,
    claim_id: claim?.id || null, campaign: claim?.campaign || null, current_status: claim?.status ?? null,
    source_status: label, source_observed_at: source?.at || null, source_kind: source?.source || null,
    mapping_known: !!mapped, proposed_status: mapped?.status || null, dq_reason_key: mapped?.dqReasonKey || null,
    would_change: !!claim && !!mapped && shouldApplyLr(claim.status, mapped),
    ...evidence, originals,
    original_retainer_stored: originals.some(d => d.doc_type === 'retainer'),
    unbound_documents: documents.filter(d => d.lead_id === lead.id && !d.claim_id).length,
    candidates: mine.map(c => ({ claim_id: c.id, campaign: c.campaign, status: c.status })), errors,
    actions_executed: false,
  };
}

export async function previewLawRulerRecovery(db: any, opts: { firmId: string; leadId?: string; cursor?: string; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit || 50, 1), 100);
  let query = db.from('leads').select('id, firm_id, lead_no, external_id, lawruler_ref_no, source_system, vendor_fields').eq('firm_id', opts.firmId).is('archived_at', null).order('id').limit(limit + 1);
  if (opts.leadId) query = query.eq('id', opts.leadId);
  if (opts.cursor) query = query.gt('id', opts.cursor);
  const { data, error } = await query;
  if (error) throw new Error(`Could not read source files: ${error.message}`);
  const page = (data || []).slice(0, limit);
  const ids = page.map((l: any) => l.id);
  if (!ids.length) return { dry_run: true, results: [], next_cursor: null, history_truncated: false };
  const [c, a, d] = await Promise.all([
    db.from('claims').select('id, firm_id, lead_id, campaign, campaign_id, status').eq('firm_id', opts.firmId).in('lead_id', ids).limit(500),
    db.from('lead_activity').select('id, lead_id, meta, created_at').eq('firm_id', opts.firmId).in('lead_id', ids).eq('meta->>source', 'lawruler').order('created_at', { ascending: false }).limit(500),
    db.from('case_documents').select('id, firm_id, lead_id, claim_id, file_name, doc_type').eq('firm_id', opts.firmId).in('lead_id', ids).limit(500),
  ]);
  for (const r of [c, a, d]) if (r.error) throw new Error(`Could not read recovery evidence: ${r.error.message}`);
  return {
    dry_run: true, next_cursor: data.length > limit ? page[page.length - 1].id : null,
    history_truncated: [c, a, d].some(r => (r.data || []).length >= 500),
    results: page.filter((lead: any) => lead.source_system === 'lawruler' || lead.lawruler_ref_no || lead.vendor_fields?.sources?.lawruler || (a.data || []).some((x: any) => x.lead_id === lead.id)).map((lead: any) => planLawRulerRecovery(lead, c.data || [], (a.data || []).filter((x: any) => x.lead_id === lead.id), d.data || [])),
  };
}

/** Read-only signing provenance for the exact matter. No generated signing or URLs. */
export async function loadLawRulerProvenance(db: any, leadId: string, claimId: string) {
  const c = await db.from('claims').select('id, lead_id, firm_id, status, campaign, answers').eq('id', claimId).eq('lead_id', leadId).maybeSingle();
  if (c.error) throw new Error(`Could not read imported signing scope: ${c.error.message}`);
  if (!c.data?.firm_id) return null;
  const firmId = c.data.firm_id;
  const [l, siblings, a, d] = await Promise.all([
    db.from('leads').select('id, firm_id, lead_no, external_id, lawruler_ref_no, vendor_fields').eq('id', leadId).eq('firm_id', firmId).maybeSingle(),
    db.from('claims').select('id, lead_id, firm_id').eq('lead_id', leadId).eq('firm_id', firmId),
    db.from('lead_activity').select('id, lead_id, meta, created_at').eq('lead_id', leadId).eq('firm_id', firmId).eq('meta->>source', 'lawruler').order('created_at', { ascending: false }).limit(500),
    db.from('case_documents').select('id, lead_id, claim_id, firm_id, file_name, doc_type').eq('lead_id', leadId).eq('claim_id', claimId).eq('firm_id', firmId),
  ]);
  for (const r of [l, siblings, a, d]) if (r.error) throw new Error(`Could not read imported signing evidence: ${r.error.message}`);
  if (!l.data) return null;
  const sole = siblings.data?.length === 1;
  const activities = (a.data || []).filter((x: any) => x.meta?.claim_id === claimId || (!x.meta?.claim_id && sole));
  const scopedLead = sole ? l.data : { ...l.data, vendor_fields: {} };
  const source = latestLawRulerSource(scopedLead, activities);
  const imported = activities.filter((x: any) => x.meta?.event === 'original_document');
  const presign = c.data.answers?.lawruler_presign || null;
  const lastSync = activities.find((x: any) => x.meta?.event === 'mva_sync_result')?.meta || null;
  const reconciliation = activities.find((x: any) => x.meta?.event === 'mva_status_reconciliation')?.meta || null;
  if (!source && !imported.length && !presign && !lastSync) return null;
  const signing = signingHistory(scopedLead, activities, claimId, sole);
  const originals = (d.data || []).flatMap((doc: any) => {
    const record = imported.find((x: any) => x.meta?.document_id === doc.id);
    return record ? [{ documentId: doc.id, fileName: doc.file_name, docType: doc.doc_type, sha256: record.meta.sha256 || null, sourceSignedAt: record.meta.source_signed_at || null }] : [];
  });
  const originalRetainerStored = originals.some((doc: any) => doc.docType === 'retainer');
  return {
    source: 'lawruler' as const, sourceStatus: source?.label || null,
    presign, lastSync, reconciliation,
    sourceSignedReported: signing.source_signed_reported, sourceSignedAt: signing.source_signed_at,
    originals, originalRetainerStored, signatureValidation: 'not_performed' as const,
    pendingMissing: [
      ...(signing.source_signed_reported && !originalRetainerStored ? ['Original signed retainer has not been recovered.'] : []),
      ...(signing.source_signed_reported && !signing.source_signed_at ? ['Source signing date was not supplied.'] : []),
      ...((a.data || []).length >= 500 ? ['Source history was truncated; review recovery evidence.'] : []),
    ],
  };
}
