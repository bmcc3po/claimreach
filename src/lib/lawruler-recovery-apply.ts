import { previewLawRulerRecovery } from './lawruler-recovery';
import { setClaimStatusForLeads } from './claim-status';

export type LrRecoverySelection = {
  lead_id: string; claim_id: string; expected_status: string | null;
  source_status: string; status: string; mapping_approved?: boolean;
  dq_reason_key?: string; mapping_note?: string;
};

/** Apply only selections the operator reviewed. Re-read source identity and CAS the status.
 * Historical reconciliation never starts automation, delivery or communications. */
export async function applyLawRulerRecovery(db: any, firmId: string, selections: LrRecoverySelection[], actor: { id: string; name?: string }) {
  const catalog = await db.from('statuses').select('*').order('sort');
  if (catalog.error) throw new Error(`Could not read statuses: ${catalog.error.message}`);
  const results: any[] = [];
  for (const selected of selections) {
    const base = { lead_id: selected.lead_id, claim_id: selected.claim_id, changed: false };
    try {
      const preview = await previewLawRulerRecovery(db, { firmId, leadId: selected.lead_id, limit: 1 });
      const plan = preview.results[0];
      if (preview.history_truncated) throw new Error('Source history is truncated. Review the complete source before applying.');
      if (!plan || plan.claim_id !== selected.claim_id) throw new Error('The source cannot be bound to this exact matter. Refresh and resolve its identity.');
      if (!plan.source_status || plan.source_status !== selected.source_status) throw new Error('The original source status changed. Refresh the preview.');
      if (plan.current_status !== selected.expected_status) throw new Error('This matter changed after the preview. Refresh before applying.');
      const status = (catalog.data || []).find((s: any) => s.key === selected.status && s.active !== false);
      if (!status) throw new Error('Select an active ClaimReach status.');
      const customMapping = !plan.mapping_known || plan.proposed_status !== selected.status;
      if (customMapping && (selected.mapping_approved !== true || !selected.mapping_note?.trim())) throw new Error('This original label requires explicit owner/admin mapping approval and a review note.');
      if (plan.current_status === selected.status) { results.push({ ...base, status: selected.status, unchanged: true }); continue; }
      if (!customMapping && !plan.would_change) throw new Error('The existing mapping prevents this backward transition. Review an explicit mapping override.');
      let dqReason = selected.dq_reason_key || plan.dq_reason_key;
      if (status.qualify === 'disqualify') {
        const reason = await db.from('dq_reasons').select('key, active').eq('key', dqReason || '').maybeSingle();
        if (reason.error || !reason.data || reason.data.active === false) throw new Error('Select an active disqualification reason.');
      } else dqReason = null;
      let auditFailure: string | null = null;
      const changed = await setClaimStatusForLeads({
        leadIds: [selected.lead_id], claimIds: [selected.claim_id], expectedStatus: selected.expected_status,
        status: selected.status, dqReasonKey: dqReason, historical: true,
        actorId: actor.id, actorName: actor.name || 'LawRuler recovery', statuses: catalog.data || [],
      }, {
        db,
        audit: async () => {
          try {
          const r = await db.from('lead_activity').insert({ firm_id: firmId, lead_id: selected.lead_id, actor: actor.id, kind: 'system', body: 'Historical LawRuler status reconciled. No communications or new signing were triggered.', meta: {
            source: 'lawruler', event: 'historical_status_reconciled', claim_id: selected.claim_id,
            original_status: plan.source_status, previous_status: selected.expected_status, mapped_status: selected.status,
            mapping_approved: customMapping && selected.mapping_approved === true, mapping_note: selected.mapping_note?.slice(0, 1000) || null,
            source_signed_reported: plan.source_signed_reported, source_signed_at: plan.source_signed_at,
            original_retainer_stored: plan.original_retainer_stored, signature_validation: 'not_performed',
          } });
          if (r.error) auditFailure = r.error.message;
          } catch (error) { auditFailure = error instanceof Error ? error.message : 'The recovery audit failed.'; }
        },
        automation: async () => { throw new Error('Historical import must not run automation.'); },
        webhook: async () => { throw new Error('Historical import must not publish an event.'); },
        deliver: async () => { throw new Error('Historical import must not deliver a file.'); },
      });
      if (!changed.ok || auditFailure) {
        results.push({ ...base, changed: !!changed.claimIds?.length, status: selected.status, error: auditFailure ? `Status changed, but recovery audit failed: ${auditFailure}. Review the matter before retrying.` : changed.error });
      } else results.push({ ...base, changed: true, status: selected.status });
    } catch (error) {
      results.push({ ...base, error: error instanceof Error ? error.message : 'Recovery failed.' });
    }
  }
  return { dry_run: false, changed: results.filter(r => r.changed).length, communications_triggered: false, results };
}
