'use client';
import { useState } from 'react';

export type NetflyDeliveryConfig = { to: string; cc: string; can_edit: boolean };
export default function NetflyDeliverySettings({ delivery, onSaved }: { delivery: NetflyDeliveryConfig; onSaved: (value: NetflyDeliveryConfig) => void }) {
  const [editing, setEditing] = useState(false), [email, setEmail] = useState(''), [expectedTo, setExpectedTo] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/netfly', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'delivery_settings', firm_email: email, expected_to: expectedTo }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'The delivery email did not save.');
      onSaved(result.delivery); setEditing(false);
      setMessage(result.warning || `Saved. Future NETFLY packets will go to ${result.delivery.to}.`);
    } catch (cause: any) { setError(cause.message || 'The delivery email did not save. Your change is still here to retry.'); }
    finally { setBusy(false); }
  }
  const copies = [...new Set([...delivery.cc.split(/[,;]/).map(value => value.trim().toLowerCase()), 'bmc@innovativeintake.com'])]
    .filter(value => value && value !== delivery.to.toLowerCase());
  return <section id="firm-delivery" className="nf-panel" aria-label="Firm delivery email">
    <div className="nf-delivery-heading"><div><h2>Firm delivery email</h2><p><strong>{delivery.to || 'Not configured'}</strong></p></div>
      {delivery.can_edit && !editing && <button type="button" className="nf-secondary" onClick={() => { setEmail(delivery.to); setExpectedTo(delivery.to); setEditing(true); setError(''); setMessage(''); }}>Change email</button>}
    </div>
    <p className="nf-muted">Copy to Brett: {copies.join(', ')}. Agents send the packet after their file review.</p>
    {editing && <form className="nf-form" onSubmit={save}>
      <label>Send NETFLY firm packets to<input type="email" required maxLength={254} autoFocus disabled={busy} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <p className="nf-muted">Applies to future NETFLY sends. Previously sent packets keep their delivery history.</p>
      <div className="nf-actions"><button className="nf-primary" disabled={busy}>{busy ? 'Saving…' : 'Save delivery email'}</button><button className="nf-secondary" type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel</button></div>
    </form>}
    {error && <p className="nf-error" role="alert">{error}</p>}{message && <p className="nf-saved" role="status">{message}</p>}
  </section>;
}
