import { mapLawRulerPresign, previewLawRulerPresignMerge } from './lawruler-presign';
import { fillMissingAnswerLeaves, isAnswerObject } from './mva-call/answer-merge';
import type { LrDocumentScope } from './lawruler-documents';

/** Exact-matter, missing-only import. CAS retries recompute every group against
 * the latest saved answers. The call editor uses the same canonical document. */
export async function importLawRulerPresign(db: any, scope: LrDocumentScope & { campaignId: string }, fields: Record<string, any>, opts: { historical?: boolean; now?: string } = {}) {
  const now = opts.now || new Date().toISOString();
  const source = Object.fromEntries(Object.entries(fields).filter(([key]) => /^(?:Custom41\d{2}|<<Custom41\d{2}>>)$/i.test(key.trim())));
  if (!Object.keys(source).length) return { outcome: 'not_supplied', filled: 0, review: 0 };
  if (JSON.stringify(source).length > 100_000) throw new Error('PRESIGN answers exceed the 100 KB import limit. Review the source before retrying.');
  const mapping = mapLawRulerPresign(source, { asOfDate: now.slice(0, 10), slashDateOrder: 'MDY' });
  if (!mapping.evidence.length) return { outcome: 'not_supplied', filled: 0, review: 0 };
  const campaign = await db.from('campaigns').select('id, firm_id, name, case_type, active').eq('id', scope.campaignId).eq('firm_id', scope.firmId).maybeSingle();
  const lead = await db.from('leads').select('id, firm_id, archived_at, lawruler_ref_no, external_id').eq('id', scope.leadId).eq('firm_id', scope.firmId).maybeSingle();
  if (campaign.error || lead.error) throw new Error('Could not verify the PRESIGN import scope.');
  if (!campaign.data?.active || campaign.data.name?.trim().toLowerCase() !== 'inno mva' || campaign.data.case_type !== 'mva'
    || !lead.data || ![lead.data.lawruler_ref_no, lead.data.external_id].includes(scope.vendorId)) throw new Error('PRESIGN does not match this exact LawRuler file and INNO MVA campaign.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await db.from('claims').select('id, answers, updated_at, campaign_id, claim_type').eq('id', scope.claimId).eq('lead_id', scope.leadId).eq('firm_id', scope.firmId).maybeSingle();
    if (current.error || !current.data) throw new Error('Could not read the exact matter for PRESIGN import.');
    if (current.data.campaign_id !== scope.campaignId || current.data.claim_type !== 'mva') throw new Error('PRESIGN import scope changed. Review this matter.');
    if (current.data.answers != null && !isAnswerObject(current.data.answers)) throw new Error('The existing answer document needs review before importing PRESIGN.');
    const answers = isAnswerObject(current.data.answers) ? current.data.answers : {};
    const hasCanonical = Object.prototype.hasOwnProperty.call(answers, 'mva_call');
    const raw = hasCanonical ? answers.mva_call : {};
    // Do not introduce a sparse canonical document over an older call whose
    // answers still restore from the call record. Opening/saving it in the App
    // first makes that baseline explicit; the source remains available below.
    let legacyCall = false;
    if (!hasCanonical) {
      const calls = await db.from('intake_calls').select('id').eq('firm_id', scope.firmId).eq('lead_id', scope.leadId)
        .or(`claim_id.eq.${scope.claimId},claim_id.is.null`).limit(1);
      if (calls.error) throw new Error('Could not verify older call answers before PRESIGN import.');
      legacyCall = !!calls.data?.length;
    }
    const preview = previewLawRulerPresignMerge(mapping, raw);
    const stageOnly = !!opts.historical || !!lead.data.archived_at || legacyCall;
    const proposed: Record<string, any> = {};
    if (!stageOnly) for (const [path, value] of Object.entries(preview.patch)) {
      const segments = path.split('.');
      let target = proposed;
      for (const segment of segments.slice(0, -1)) target = (target[segment] ||= {});
      target[segments[segments.length - 1]] = value;
    }
    const merged = isAnswerObject(raw) ? fillMissingAnswerLeaves(raw, proposed) : { value: raw, filledPaths: [] as string[] };
    const prior = isAnswerObject(answers.lawruler_presign) ? answers.lawruler_presign : {};
    const provenance = { ...(prior.provenance || {}) };
    for (const path of merged.filledPaths) provenance[path] = { source: 'LawRuler PRESIGN', vendor_id: scope.vendorId, received_at: now,
      tokens: mapping.candidates.find(c => Object.prototype.hasOwnProperty.call(c.changes, path))?.sources || [],
      originals: mapping.evidence.filter(e => mapping.candidates.find(c => Object.prototype.hasOwnProperty.call(c.changes, path))?.sources.includes(e.token)) };
    const evidence = { ...(prior.evidence || {}) };
    const touched = new Set(mapping.evidence.map(e => e.token));
    // Keep every alias when the source supplied contradictory values, so a
    // reviewer can see the conflict instead of only the last value received.
    for (const [key, item] of Object.entries(evidence)) if (touched.has((item as any)?.token)) delete evidence[key];
    for (const item of mapping.evidence) {
      const multiple = mapping.evidence.filter(e => e.token === item.token).length > 1;
      evidence[multiple ? `${item.token}:${item.sourceKey}` : item.token] = { ...item, received_at: now };
    }
    const latestDecisions = preview.decisions.map(d => ({ id: d.candidate.id, question_id: d.candidate.questionId,
      status: stageOnly && d.status === 'eligible' ? 'needs_review' : d.status,
      sources: d.candidate.sources, reasons: d.reasons }));
    const decisions = [...(Array.isArray(prior.decisions) ? prior.decisions.filter((d: any) => !d.sources?.some((t: string) => touched.has(t))) : []), ...latestDecisions];
    const warnings = [...(Array.isArray(prior.warnings) ? prior.warnings.filter((w: any) => !w.tokens?.some((t: string) => touched.has(t))) : []), ...mapping.warnings];
    if (legacyCall) warnings.push({ code: 'legacy_call_baseline', tokens: [...touched], message: 'An older call holds saved answers. Open and save that call in the App before applying source answers.' });
    const review = decisions.filter(d => ['conflict', 'needs_review'].includes(d.status)).length + warnings.length;
    const metadata = { schema: mapping.schemaVersion, source: 'LawRuler PRESIGN', vendor_id: scope.vendorId, claim_id: scope.claimId,
      received_at: now, provenance, evidence, decisions, warnings,
      outcome: stageOnly ? 'review_required' : review ? 'imported_with_review' : 'imported', filled: merged.filledPaths.length, review };
    const next = { ...answers, ...(merged.filledPaths.length ? { mva_call: merged.value } : {}), lawruler_presign: metadata };
    let update = db.from('claims').update({ answers: next }).eq('id', scope.claimId).eq('lead_id', scope.leadId).eq('firm_id', scope.firmId);
    update = current.data.updated_at == null ? update.is('updated_at', null) : update.eq('updated_at', current.data.updated_at);
    const saved = await update.select('id').maybeSingle();
    if (saved.error) throw new Error(`PRESIGN answers were not saved: ${saved.error.message}`);
    if (saved.data) return { outcome: metadata.outcome, filled: merged.filledPaths.length, review, schema: mapping.schemaVersion };
  }
  throw new Error('The matter changed during PRESIGN import. Retry the same event; no existing answer was overwritten.');
}
