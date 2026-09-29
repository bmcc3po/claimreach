import { LAWRULER_PRESIGN_LABELS } from '@/lib/lawruler-presign-labels';

/** Shared file-level view of external facts; never presents an imported status
 * as an independently verified signature or manufactures unanswered details. */
export default function LawRulerSyncSummary({ imported }: { imported: any }) {
  if (!imported) return null;
  const intake = imported.presign;
  const sourceFacts = intake?.evidence && typeof intake.evidence === 'object' ? Object.values(intake.evidence) as any[] : [];
  const sync = imported.lastSync;
  const status = imported.reconciliation || sync?.status_result;
  const pending = [...(imported.pendingMissing || []), ...(sync?.document_result?.errors || [])];
  return <section aria-label="LawRuler import" style={{ margin: '12px 0', padding: 12, border: '1px solid #dbe3ef', borderRadius: 10, background: '#f7f9fc', fontSize: 14, lineHeight: 1.45 }}>
    <strong>LawRuler</strong>
    <p style={{ margin: '6px 0' }}>Source status: {imported.sourceStatus || 'Not supplied'}</p>
    {status?.acquisition_hold && <p style={{ margin: '6px 0', fontWeight: 600 }}>Acquisition follow-up stopped.{status.outcome === 'review_required' ? ' Status review needed.' : ''}</p>}
    {status?.outcome === 'review_required' && <p style={{ margin: '6px 0' }}>{status.reason}</p>}
    {imported.sourceSignedReported && <p style={{ margin: '6px 0' }}>LawRuler reports a signed agreement. {imported.originalRetainerStored ? 'Original retainer filed on this matter.' : 'Original retainer still needed.'} The imported signature has not been independently verified.</p>}
    {pending.length > 0 && <ul style={{ paddingLeft: 20, margin: '6px 0' }}>{[...new Set<string>(pending)].map(message => <li key={message}>{message}</li>)}</ul>}
    {sync?.intake_result?.outcome === 'failed' && <p role="alert" style={{ margin: '6px 0', color: '#9f2525' }}>PRESIGN import failed. {sync.intake_result.error} Retry the source import; previously saved answers are still shown.</p>}
    {intake && <>
      <p style={{ margin: '6px 0' }}><strong>PRESIGN intake</strong> · {Object.keys(intake.provenance || {}).length} answer fields imported{intake.review ? ` · ${intake.review} items need review` : ''}.</p>
      {!!intake.review && <p style={{ margin: '6px 0' }}>Existing answers and cleared fields were preserved. Review source facts below for questions that do not match exactly.</p>}
      {!!sourceFacts.length && <details><summary style={{ cursor: 'pointer', padding: '8px 0' }}>View source answers</summary>
        {sourceFacts.map((fact, index) => <div key={`${fact.token}-${index}`} style={{ padding: '8px 0', borderTop: '1px solid #dbe3ef', overflowWrap: 'anywhere' }}>
          <strong style={{ display: 'block' }}>{LAWRULER_PRESIGN_LABELS[fact.token] || 'Imported field'}</strong>
          <span style={{ whiteSpace: 'pre-wrap' }}>{Array.isArray(fact.raw) && fact.raw.every((v: unknown) => v == null || typeof v !== 'object') ? fact.raw.join(', ') : typeof fact.raw === 'object' ? JSON.stringify(fact.raw) : String(fact.raw ?? '')}</span>
        </div>)}
      </details>}
    </>}
  </section>;
}
