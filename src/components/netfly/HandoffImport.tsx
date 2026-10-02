'use client';
import { useState } from 'react';
import { extractNetflyEmail } from '@/lib/netfly-handoff';
import { NETFLY_FIELDS } from '@/lib/netfly-ontake';

const labels = new Map(NETFLY_FIELDS.map(f => [f.id, f.label]));
export default function HandoffImport({ fileKey, values, onSaved }: {
  fileKey: string; values: Record<string, string>; onSaved: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const candidates = extractNetflyEmail(note).candidates;
  const occupied = (id: string) => !!values[id]?.trim() || !!values[`${id}_unavailable`];
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await fetch('/api/netfly', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'handoff', file: fileKey, note,
          apply_fields: candidates.filter(c => !occupied(c.id) && !excluded.includes(c.id)).map(c => c.id) }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'The email did not save.');
      await onSaved(); setNote(''); setExcluded([]);
      setMessage(`Original email saved. ${d.applied?.length || 0} blank fields filled. Confirm these details with the client.`);
    } catch (e: any) { setError(e.message || 'The email did not save. Your text is still here.'); }
    finally { setBusy(false); }
  }
  return <details className="nf-history nf-email-import"><summary>Paste email & fill missing details</summary>
    <p className="nf-muted">Paste the whole NETFLY email. Review the details below, then save. Existing answers stay in place; the original email stays on the file.</p>
    <label>NETFLY email<textarea className="nf-source-input" value={note} maxLength={20000} disabled={busy}
      onChange={e => { setNote(e.target.value); setExcluded([]); setMessage(''); }} placeholder="Paste the entire email here, including the agent notes" /></label>
    {candidates.length > 0 && <div className="nf-import-preview"><h3>Review details from the email</h3>{candidates.map(c => <label key={c.id} className="nf-import-row">
      <input type="checkbox" checked={!occupied(c.id) && !excluded.includes(c.id)} disabled={busy || occupied(c.id)}
        onChange={e => setExcluded(old => e.target.checked ? old.filter(id => id !== c.id) : [...old, c.id])} />
      <span><strong>{labels.get(c.id) || c.source}</strong><span>{c.value}</span>{occupied(c.id) && <small>Keeping the answer already on this file.</small>}</span>
    </label>)}</div>}
    {note.trim().length >= 10 && !candidates.length && <p>No clearly labeled fields found. You can still save the complete email as the handoff note.</p>}
    {error && <p className="nf-alert" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <button className="nf-primary" disabled={busy || note.trim().length < 10} onClick={() => void save()}>{busy ? 'Saving…' : 'Save email & fill selected fields'}</button>
  </details>;
}
