// INNO MVA sync: independent outcomes for status, structured intake and originals.
// A failed PDF must not leave an externally signed file in the acquisition queue.
import { recordLawRulerSource, storeLawRulerOriginals, validateLawRulerOriginal, type LrDocumentScope, type LrOriginal } from './lawruler-documents';
import { reconcileLawRulerMvaStatus } from './lawruler-mva-status';
import { importLawRulerPresign } from './lawruler-presign-import';
import { lrValue } from './lawruler-recovery';

export function hasRemoteLawRulerOriginal(fields: Record<string, any>): boolean {
  return Object.entries(fields).some(([key, value]) => /attachment|document|retainer|intake.*url/i.test(key)
    && /https?:\/\//i.test(typeof value === 'string' ? value : JSON.stringify(value)));
}

export async function syncLawRulerMva(db: any, scope: LrDocumentScope & { campaignId: string }, fields: Record<string, any>, files: LrOriginal[], historical: boolean) {
  await recordLawRulerSource(db, scope, fields);
  const reconciliation = await reconcileLawRulerMvaStatus(db, {
    firmId: scope.firmId, leadId: scope.leadId, claimId: scope.claimId, campaignId: scope.campaignId,
    sourceStatus: lrValue(fields, ['status', 'leadstatus']), historical,
    dqReasonKey: lrValue(fields, ['dqreasonkey', 'disqualificationreasonkey']) || undefined,
  });
  let intake: Record<string, any>;
  try { intake = await importLawRulerPresign(db, scope, fields, { historical }); }
  catch (error) { intake = { outcome: 'failed', retry_required: true, error: error instanceof Error ? error.message : 'Intake import failed.' }; }

  let originals: Awaited<ReturnType<typeof storeLawRulerOriginals>> = [];
  const documentErrors: string[] = [];
  let documentRetry = false;
  if (hasRemoteLawRulerOriginal(fields)) documentErrors.push('A document link was received, but remote links are not downloaded. Supply the original PDF with verified LawRuler identity.');
  if (files.length > 8) documentErrors.push('At most eight originals may be supplied in one request.');
  else for (const file of files) {
    try { validateLawRulerOriginal(file, scope, fields); }
    catch (error) { documentErrors.push(error instanceof Error ? error.message : 'Original needs review.'); continue; }
    try { originals.push(...await storeLawRulerOriginals(db, scope, [file], fields)); }
    catch (error) {
      documentRetry = true;
      documentErrors.push(error instanceof Error ? error.message : 'Original document import failed.');
    }
  }
  const documents = { outcome: documentErrors.length ? 'pending' : files.length ? 'stored' : 'not_supplied', errors: documentErrors, received: files.length, stored: originals.length, retry_required: documentRetry };
  // Keep the exact-matter result visible in File and available for recovery.
  const recorded = await db.from('lead_activity').insert({
    firm_id: scope.firmId, lead_id: scope.leadId, kind: 'system',
    body: `LawRuler sync: status ${reconciliation.outcome}; intake ${intake.outcome}; documents ${documents.outcome}.`,
    meta: { source: 'lawruler', event: 'mva_sync_result', claim_id: scope.claimId, vendor_lead_id: scope.vendorId,
      status_result: reconciliation, intake_result: intake, document_result: documents, communications_triggered: false },
  });
  if (recorded.error) throw new Error(`The sync ran, but its result could not be recorded: ${recorded.error.message}. Retry the same source event.`);
  return { reconciliation, intake, documents, originals, attachments_complete: documentErrors.length === 0, retry_required: !!intake.retry_required || documentRetry, communications_triggered: false as const };
}
