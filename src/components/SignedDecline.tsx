'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { declineOutcome } from '@/lib/signed-decline';

export default function SignedDecline({ claimId, declined = false, embedded = false }: { claimId: string; declined?: boolean; embedded?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [data, setData] = useState<any>(null), [reason, setReason] = useState('');
  useEffect(() => { if (declined) void load(); }, [claimId, declined]);
  async function load() {
    setOpen(true); setBusy(true); setError(''); setData(null);
    try {
      const r = await fetch('/api/signed-decline?claim=' + encodeURIComponent(claimId));
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not open this action.'); setData(d);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this action.'); }
    finally { setBusy(false); }
  }
  async function save(retry = false) {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/signed-decline', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: claimId, action: retry ? 'retry_email' : 'decline', confirm: true, reason, to: data.to, version: data.version }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'The decline could not be completed.');
      setData((old: any) => ({ ...old, ...d })); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'The decline could not be completed.'); }
    finally { setBusy(false); }
  }
  const mail = data?.notification;
  return <section id="signed-decline" className={embedded ? undefined : 'card'} style={embedded ? { marginTop: 10 } : { padding: 16, marginBottom: 16 }} aria-label="BMC decline and drop letter">
    {!open ? <button className="btn ghost danger" onClick={load}>{declined || data?.decline ? 'Signed and declined — view outcome' : 'BMC declined'}</button> : <>
      <h3 style={{ marginTop: 0 }}>{declined || data?.decline ? 'Signed and declined' : 'BMC declined'}</h3>
      {data && <>
        <p><strong>{data.name} · {data.number}</strong></p>
        {data.decline ? <>
          <p><strong>Outcome: {declineOutcome(data.decline)}</strong> · {data.decline.actorName}</p>
          <p>{data.decline.reason}</p><p><strong>Bad sign · no commission eligibility</strong><br />{data.decline.agentName}</p>
          <p>Removed from active work. The signed agreement and file history are preserved.</p>
          <p role="status">{mail?.state === 'sent' ? `Drop-letter request emailed to ${mail.to}. The firm still needs to send the client’s letter.` :
            mail?.state === 'failed' ? `The file is declined, but the email to ${mail.to} failed.` :
            mail ? 'The email is sending or its result is uncertain. Check Resend before any further send.' : 'The file is declined. The drop-letter email has not been requested yet.'}</p>
          {mail?.error && <p role="alert">{mail.error}</p>}
          {(!mail || mail.state === 'failed') && <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? 'Sending…' : 'Send drop-letter request'}</button>}
        </> : <>
          <label htmlFor={`decline-${claimId}`}>Why does this signed file not qualify? (required)</label>
          <textarea id={`decline-${claimId}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={5000} rows={3} style={{ width: '100%', marginTop: 8 }} />
          <p>This records a bad sign for <strong>{data.agent}</strong>, removes unpaid commission eligibility, and clears this file from active work.</p>
          <p>It emails <strong>{data.to || 'Firm email not configured'}</strong> to request a drop letter. The firm sends the letter to the client.</p>
          <p className="muted">Previously paid commissions stay in payroll history for a separate clawback.</p>
          <button className="btn danger" disabled={busy || !reason.trim() || !data.to} onClick={() => save()}>{busy ? 'Declining…' : 'Confirm BMC decline & request drop letter'}</button>
        </>}
      </>}
      {error && <p role="alert">{error} <button className="btn ghost" disabled={busy} onClick={load}>Reload file status</button></p>}
      <button className="btn ghost" style={{ marginLeft: 8 }} disabled={busy} onClick={() => { setOpen(false); setError(''); }}>Close</button>
    </>}
  </section>;
}
