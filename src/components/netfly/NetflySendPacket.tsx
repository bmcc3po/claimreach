'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
type Preview = { errors: string[]; documents: { id: string; name: string }[]; to: string; cc: string[]; snapshot: string; case_url: string; sent_at: string | null; can_send: boolean; dispatch: { state: string; finished_at?: string } | null };
export default function NetflySendPacket({ fileKey, revision, signedDocuments, unsaved }: { fileKey: string; revision: string; signedDocuments: { id: string; url: string | null; file_name: string }[]; unsaved: boolean }) {
  const [packet, setPacket] = useState<Preview | null>(null), [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [sent, setSent] = useState('');
  const [warning, setWarning] = useState('');
  const requestNumber = useRef(0);
  const endpoint = `/api/netfly/delivery?file=${encodeURIComponent(fileKey)}`;
  async function load() {
    const currentRequest = ++requestNumber.current;
    setError(''); setReviewed(false);
    try { const r = await fetch(endpoint, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); if (currentRequest === requestNumber.current) setPacket(d); }
    catch (e: any) { if (currentRequest === requestNumber.current) { setPacket(null); setError(e.message || 'Could not check this packet.'); } }
  }
  useEffect(() => { void load(); return () => { requestNumber.current++; }; }, [fileKey, revision]);
  async function send() {
    if (!packet || busy) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/netfly/delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: fileKey, snapshot: packet.snapshot, reviewed }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'The packet was not sent.');
      if (d.warning) setWarning(d.warning);
      if (!d.skipped) setSent(new Date().toISOString());
      await load();
    } catch (e: any) { setError(e.message || 'The delivery result could not be checked. Refresh delivery status before trying again.'); }
    finally { setBusy(false); }
  }
  const sentAt = packet?.sent_at || (packet?.dispatch?.state === 'sent' ? packet.dispatch.finished_at : '') || sent;
  const locked = ['sending', 'uncertain'].includes(packet?.dispatch?.state || '');
  return <section className="nf-call-block nf-final-send" aria-label="Send NETFLY packet to firm">
    {sentAt ? <><div className="nf-sent-balloons" aria-hidden="true">🎈 🎈 🎈</div><h2>File sent to the firm!</h2><p>Sent {new Date(sentAt).toLocaleString()}. Brett was copied. The packet is recorded on this file.</p><Link className="nf-primary" href="/app/netfly">Back to NETFLY files</Link></> : <>
      <h2>Final step: send to the firm</h2><p>Review the intake and signed PDF above, then send the packet.</p>
      <a className="nf-secondary" href={`${endpoint}&pdf=intake`} target="_blank" rel="noopener noreferrer">Open intake PDF ↗</a>
      {packet && <><p><strong>To firm:</strong> {packet.to || 'Not configured'}<br /><strong>Copy:</strong> {packet.cc.join(', ')}</p>
        <p><strong>Included:</strong> intake PDF{packet.documents.map(doc => ` + ${doc.name}`).join('')}</p>
        {packet.documents.map(doc => { const stored = signedDocuments.find(item => item.id === doc.id); return stored?.url ? <p key={doc.id}><a className="nf-secondary" href={stored.url} target="_blank" rel="noopener noreferrer">Open {doc.name} ↗</a></p> : null; })}
        {packet.errors.length > 0 && <div className="nf-alert"><strong>Finish these items on this file:</strong><ul>{packet.errors.map(item => <li key={item}>{item}</li>)}</ul><Link href={packet.case_url}>Open case and agreement actions →</Link></div>}
        {locked && <p className="nf-alert">A send is already running or needs its delivery result checked. Ask an owner to check delivery history before sending again.</p>}
        <label className="nf-inline-confirm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} /> I reviewed the intake, every signed PDF listed, and the recipients.</label>
        {unsaved && <p className="nf-alert">Save the answers and call result before sending. Your edits are still on screen.</p>}
        <button type="button" className="nf-primary" disabled={busy || unsaved || !reviewed || !!packet.errors.length || locked || !packet.can_send} onClick={() => void send()}>{busy ? 'Sending packet…' : 'SEND TO FIRM + BRETT'}</button>
      </>}
    </>}
    {error && <p className="nf-alert" role="alert">{error}</p>}{warning && <p className="nf-alert" role="status">{warning}</p>}
    <button type="button" className="nf-secondary" disabled={busy} onClick={() => void load()}>Refresh delivery status</button>
  </section>;
}
