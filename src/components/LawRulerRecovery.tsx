"use client";

import { useRef, useState } from 'react';
import type { planLawRulerRecovery } from '@/lib/lawruler-recovery';
import type { LrRecoverySelection } from '@/lib/lawruler-recovery-apply';

type Plan = ReturnType<typeof planLawRulerRecovery>;
type Choice = { selected: boolean; status: string; approved: boolean; note: string; reason: string };
type Props = {
  firms: { id: string; name: string }[];
  statuses: { key: string; label: string; qualify: string; active?: boolean }[];
  reasons: { key: string; label: string; active?: boolean }[];
  loadError?: string | null;
  canApply?: boolean;
};
export function reviewedLawRulerSelections(plans: Plan[], choices: Record<string, Choice>): LrRecoverySelection[] {
  return plans.flatMap(plan => {
    const choice = choices[plan.lead_id];
    if (!choice?.selected) return [];
    if (!plan.claim_id || !plan.source_status || !choice.status) throw new Error('Every selected source must name one exact matter and a target status.');
    const manual = !plan.mapping_known || plan.proposed_status !== choice.status;
    if (manual && (!choice.approved || !choice.note.trim())) throw new Error('Approve and explain each manual status mapping before applying.');
    return [{ lead_id: plan.lead_id, claim_id: plan.claim_id, expected_status: plan.current_status,
      source_status: plan.source_status, status: choice.status, mapping_approved: manual && choice.approved,
      mapping_note: choice.note, dq_reason_key: choice.reason || plan.dq_reason_key || undefined }];
  });
}

export default function LawRulerRecovery({ firms, statuses, reasons, loadError, canApply = true }: Props) {
  const [firm, setFirm] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const generation = useRef(0);
  const label = (key: string | null) => statuses.find(s => s.key === key)?.label || key || 'No status';
  const selected = plans.filter(p => choices[p.lead_id]?.selected).length;
  const setChoice = (id: string, patch: Partial<Choice>) => {
    setChoices(current => ({ ...current, [id]: { ...current[id], ...patch } })); setReviewed(false);
  };
  async function preview(cursor?: string) {
    if (!firm) return;
    const version = ++generation.current;
    setBusy(true); setError(''); setResult(''); setReviewed(false); setChoices({});
    try {
      const query = new URLSearchParams({ firm_id: firm, limit: '30' }); if (cursor) query.set('cursor', cursor);
      const response = await fetch(`/api/webhooks/lawruler/status-sync?${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Could not load the recovery preview.');
      if (version !== generation.current) return;
      const rows: Plan[] = data.results || [];
      setPlans(rows); setNextCursor(data.next_cursor || null); setTruncated(!!data.history_truncated); setLoaded(true);
      setChoices(Object.fromEntries(rows.map(p => [p.lead_id, { selected: false, status: p.proposed_status || '', approved: false, note: '', reason: p.dq_reason_key || '' }])));
    } catch (e) { if (version === generation.current) { setError(e instanceof Error ? e.message : 'Preview failed.'); setPlans([]); setLoaded(false); } }
    finally { if (version === generation.current) setBusy(false); }
  }
  async function apply() {
    if (!canApply || !reviewed || truncated || !firm || busy) return;
    let submitted = false;
    try {
      const selections = reviewedLawRulerSelections(plans, choices);
      if (!selections.length) throw new Error('Select at least one reviewed matter.');
      for (const s of selections) if (statuses.find(st => st.key === s.status)?.qualify === 'disqualify' && !s.dq_reason_key) throw new Error('Select a disqualification reason for each DQ status.');
      setBusy(true); setError(''); setResult('');
      submitted = true;
      const response = await fetch('/api/webhooks/lawruler/status-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firm_id: firm, selections }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Recovery failed.');
      const failures = (data.results || []).filter((r: any) => r.error);
      setResult(`${data.changed || 0} matter status${data.changed === 1 ? '' : 'es'} changed. No messages, signing requests, or firm deliveries were started.`);
      if (failures.length) setError(failures.map((r: any) => `${plans.find(p => p.lead_id === r.lead_id)?.lead_no || r.lead_id}: ${r.error}`).join(' '));
      // Every apply invalidates its preview, including partial outcomes. A fresh
      // read is required before another write; old selections cannot be reused.
      setPlans([]); setChoices({}); setLoaded(false); setNextCursor(null); setReviewed(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Recovery failed.';
      setError(submitted ? `${message} The result may be incomplete. Load a fresh preview before retrying.` : message);
      if (submitted) { setPlans([]); setChoices({}); setLoaded(false); setNextCursor(null); setReviewed(false); }
    }
    finally { setBusy(false); }
  }
  return <section className="side-card" style={{ maxWidth: 1040 }} aria-labelledby="lawruler-recovery-title">
    <h3 id="lawruler-recovery-title">Review LawRuler imports</h3>
    <p className="muted">Compare the original LawRuler status with the exact ClaimReach matter. Previewing changes nothing. Applying selected status corrections preserves signing dates and does not start messages, signing requests, or firm delivery.</p>
    {loadError && <p role="alert">{loadError}</p>}
    {!canApply && <p>You can preview these imports. Your account does not have permission to change claim statuses.</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
      <label>Firm<br /><select aria-label="LawRuler recovery firm" value={firm} disabled={busy || !!loadError} onChange={event => {
        generation.current++; setFirm(event.target.value); setPlans([]); setChoices({}); setNextCursor(null); setLoaded(false); setReviewed(false); setError(''); setResult('');
      }}><option value="">Choose a firm</option>{firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <button className="btn" type="button" disabled={!firm || busy || !!loadError} onClick={() => preview()}>{busy ? 'Working...' : 'Preview imports'}</button>
      {nextCursor && <button className="btn" type="button" disabled={busy} onClick={() => preview(nextCursor)}>Next files</button>}
    </div>
    {error && <p role="alert" style={{ color: '#b42318', whiteSpace: 'pre-wrap' }}>{error}</p>}
    {result && <p role="status">{result} Load a fresh preview to continue.</p>}
    {truncated && <p role="alert">This page has more source history than the preview can load. Applying is disabled; review a smaller set of files first.</p>}
    {loaded && !plans.length && <p>No LawRuler source records were found on this page.{nextCursor ? ' Continue to the next files.' : ''}</p>}
    {plans.map(plan => {
      const choice = choices[plan.lead_id]; if (!choice) return null;
      const manual = !plan.mapping_known || choice.status !== plan.proposed_status;
      const identityBlocked = !plan.claim_id || !plan.source_status;
      return <fieldset key={plan.lead_id} disabled={busy} style={{ border: '1px solid #d8e0e8', borderRadius: 8, marginTop: 16, padding: 16, minWidth: 0 }}>
        <legend><strong>{plan.lead_no || plan.lead_id}</strong> {plan.campaign || 'Matter needs review'}</legend>
        <p style={{ marginTop: 0 }}>Matter: {plan.claim_id || 'Cannot determine a unique matter'}{plan.claim_id && <> &middot; <a href={`/leads/${encodeURIComponent(plan.lead_no || plan.lead_id)}?claim=${plan.claim_id}`} target="_blank" rel="noreferrer">Open file</a></>}</p>
        <p>LawRuler: <strong>{plan.source_status || 'Original status missing'}</strong><br />ClaimReach now: <strong>{label(plan.current_status)}</strong></p>
        <p className="muted">{plan.source_signed_reported ? 'LawRuler reports a signed contract.' : 'The saved source does not report a signed contract.'} {plan.source_signed_at ? `Source signing date: ${plan.source_signed_at.slice(0, 10)}.` : 'No source signing date supplied.'}<br />{plan.original_retainer_stored ? 'Original retainer stored; signature validity has not been independently checked.' : 'Original retainer not yet recovered.'} {plan.originals.length} original document{plan.originals.length === 1 ? '' : 's'} stored.{plan.unbound_documents > 0 && ` ${plan.unbound_documents} older document(s) are not bound to a matter.`}</p>
        {plan.errors.length > 0 && <p style={{ color: '#8a4b08' }}>{plan.errors.join(' ')}</p>}
        {!identityBlocked && <>
          <label>Set ClaimReach status to<br /><select value={choice.status} onChange={e => setChoice(plan.lead_id, { status: e.target.value, approved: false })}>
            <option value="">Choose after reviewing the source</option>{statuses.filter(s => s.active !== false).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select></label>
          {manual && <div style={{ marginTop: 12 }}>
            <label><input type="checkbox" checked={choice.approved} onChange={e => setChoice(plan.lead_id, { approved: e.target.checked })} /> I reviewed this original label and approve this mapping.</label><br />
            <label>Why this status matches the source<br /><input style={{ width: '100%', maxWidth: 640 }} value={choice.note} maxLength={1000} onChange={e => setChoice(plan.lead_id, { note: e.target.value })} placeholder="Explain the mapping; do not add client details." /></label>
          </div>}
          {statuses.find(s => s.key === choice.status)?.qualify === 'disqualify' && <label style={{ display: 'block', marginTop: 12 }}>Disqualification reason<br /><select value={choice.reason} onChange={e => setChoice(plan.lead_id, { reason: e.target.value })}><option value="">Choose a reason</option>{reasons.filter(r => r.active !== false).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>}
          <label style={{ display: 'block', marginTop: 12 }}><input type="checkbox" checked={choice.selected} disabled={truncated || !choice.status || choice.status === plan.current_status} onChange={e => setChoice(plan.lead_id, { selected: e.target.checked })} /> Include this exact matter in the correction</label>
        </>}
      </fieldset>;
    })}
    {plans.length > 0 && <div style={{ marginTop: 16 }}>
      <label><input type="checkbox" checked={reviewed} disabled={busy || !selected || truncated} onChange={e => setReviewed(e.target.checked)} /> I reviewed the {selected} selected matter{selected === 1 ? '' : 's'}, source labels and status mappings.</label><br />
      <button className="btn" type="button" style={{ marginTop: 12 }} disabled={!canApply || busy || !reviewed || !selected || truncated} onClick={apply}>Apply selected status corrections</button>
    </div>}
    <p className="muted" style={{ marginBottom: 0 }}>Historical resends must include <code>recovery_mode=historical</code> so they remain pending review and do not start live events or delivery. Missing originals need the original PDF/CSV files resent through the authenticated LawRuler inbound hook. A signed status alone does not recreate a retainer or DocuSeal evidence. No remote document links are fetched.</p>
  </section>;
}
