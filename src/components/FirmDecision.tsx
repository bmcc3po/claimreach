'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIRM_DECISION_LABELS, reviewState, type ReviewAction } from '@/lib/firm-review-access';
import SignedDecline from './SignedDecline';

export default function FirmDecision({ claimId, allowBmc = false }: { claimId: string; allowBmc?: boolean }) {
  const router = useRouter();
  const [events, setEvents] = useState<any[]>([]);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<'accepted' | 'turned_down' | null>(null), [reason, setReason] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const state = reviewState(events);
  async function load() {
    setError(''); setReady(false);
    try {
      const r = await fetch('/api/owner-firm-review?claim=' + encodeURIComponent(claimId));
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load firm decisions.');
      setEvents(d.history); setPreview(d.preview); setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load firm decisions.'); }
  }
  useEffect(() => { void load(); }, [claimId]); // mounted per matter
  async function save() {
    if (!choice || busy || choice === 'turned_down' && !reason.trim()) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/owner-firm-review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: claimId, action: choice, explanation: reason, confirm: true, version: preview?.version, to: preview?.to }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'The decision has not saved.');
      setEvents(old => d.event ? [d.event, ...old] : old); setChoice(null); setReason(''); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'The decision has not saved.'); }
    finally { setBusy(false); }
  }
  return <section className="card" style={{ marginBottom: 16, padding: 18 }} aria-label="Firm decision">
    <strong>File outcome</strong>
    {state.decision && <p><b>{FIRM_DECISION_LABELS[state.decision as keyof typeof FIRM_DECISION_LABELS]}</b></p>}
    {state.decision && <p>{state.explanation}{state.explanation && <br />}<small>Recorded by {state.reviewer}{state.decisionAt ? ' · ' + new Date(state.decisionAt).toLocaleString() : ''}</small></p>}
    {!state.decision && ready && <p className="muted">Record the firm’s answer.</p>}
    {!choice && <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
      <button className="btn" disabled={!ready || busy} onClick={() => { setChoice('accepted'); setError(''); }}>Firm approved</button>
      <button className="btn ghost" disabled={!ready || busy} onClick={() => { setChoice('turned_down'); setReason(state.explanation || ''); setError(''); }}>Firm declined</button>
    </div>}
    {allowBmc && !choice && <SignedDecline claimId={claimId} embedded />}
    {choice && <div style={{ marginTop: 12 }}>
      <p><b>{FIRM_DECISION_LABELS[choice]}</b>{state.decision ? ' — this will add an updated decision to the history.' : ' — save this decision?'}</p>
      {choice === 'turned_down' && <label>Why did the firm decline this file? (required)
        <textarea value={reason} maxLength={5000} rows={3} style={{ width: '100%' }} onChange={e => setReason(e.target.value)} /></label>}
      {choice === 'turned_down' && preview && <p>This marks the file <strong>Signed and declined</strong>, removes it from active work and unpaid commission eligibility, and emails <strong>{preview.to || 'Firm email not configured'}</strong> to request a drop letter.</p>}
      <div className="row" style={{ gap: 10, marginTop: 10 }}><button className="btn" disabled={busy || choice === 'turned_down' && (!reason.trim() || !!preview && !preview.to)} onClick={save}>{busy ? 'Saving…' : choice === 'turned_down' && preview ? 'Confirm firm decline & request drop letter' : 'Save firm decision'}</button>
        <button className="btn ghost" disabled={busy} onClick={() => setChoice(null)}>Cancel</button></div>
    </div>}
    {error && <p role="alert">{error} <button className="btn ghost" disabled={busy} onClick={() => { router.refresh(); void load(); }}>Reload file status</button></p>}
    {events.length > 0 && <details style={{ marginTop: 12 }}><summary>Decision history</summary>{events.map(e => <p key={e.id}>
      <b>{e.meta.action === 'received' ? 'Received' : FIRM_DECISION_LABELS[e.meta.action as Exclude<ReviewAction, 'received'>]}</b> · {e.meta.reviewer_name} · {new Date(e.created_at).toLocaleString()}
      {e.meta.explanation && <><br />{e.meta.explanation}</>}</p>)}</details>}
  </section>;
}
