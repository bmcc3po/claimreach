'use client';
import { useState } from 'react';
export default function RehearsalSetup({ leadId, campaignId, active }: { leadId: string; campaignId: string; active: boolean }) {
  const [phone, setPhone] = useState(''), [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (active) return <p role="status" style={{ padding: 14, background: '#fff8db' }}><strong>NONBINDING TEST FILE.</strong> Signing uses a dummy packet. No representation or medical authorization is created.</p>;
  return <details style={{ padding: 14, background: '#fff8db' }}><summary>Owner: prepare a nonbinding signing rehearsal</summary>
    <p>Only synthetic TEST files with no prior agreement qualify. This also covers newly created passengers. Existing campaign contracts stay unchanged.</p>
    <label>Approved test phone<input value={phone} onChange={e => setPhone(e.target.value)} type="tel" /></label>
    <label>Approved test emails (comma separated)<input value={emails} onChange={e => setEmails(e.target.value)} /></label>
    <button type="button" disabled={busy || !phone.trim()} onClick={async () => {
      setBusy(true); setError('');
      try {
        const response = await fetch('/api/calls/esign-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: campaignId, rehearsal_lead_id: leadId, rehearsal_phone: phone, rehearsal_emails: emails }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Test setup failed.');
        window.location.reload();
      } catch (e: any) { setError(e.message || 'Could not prepare the rehearsal.'); } finally { setBusy(false); }
    }}>{busy ? 'Preparing…' : 'Prepare nonbinding test packet'}</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}
