'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import FileQaCheck from '../calls/FileQaCheck';
type Preview = { errors: string[]; documents: { id: string; name: string }[]; to: string; cc: string[]; snapshot: string; case_url: string; sent_at: string | null; can_send: boolean; dispatch: { state: string; finished_at?: string } | null };
export default function NetflySendPacket({ fileKey, revision, signedDocuments, unsaved, onField, onReviewSteps }: { fileKey: string; revision: string; signedDocuments: { id: string; url: string | null; file_name: string }[]; unsaved: boolean; onField?: (id: string) => void; onReviewSteps?: () => void }) {
  const [packet, setPacket] = useState<Preview | null>(null), [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [sent, setSent] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const requestNumber = useRef(0);
  const endpoint = `/api/netfly/delivery?file=${encodeURIComponent(fileKey)}`;
  async function load() {
    const currentRequest = ++requestNumber.current;
    setError(''); setReviewed(false); setLoading(true);
    try { const r = await fetch(endpoint, { cache: 'no-store' }); const d = await r.json().catch(() => null); if (!r.ok || !d) throw new Error(d?.error || (r.status === 403 ? 'This account cannot open delivery. Your file is saved; ask an administrator to check access.' : 'Could not check this packet. Refresh delivery status to try again.')); if (currentRequest === requestNumber.current) setPacket(d); }
    catch (e: any) { if (currentRequest === requestNumber.current) { setPacket(null); setError(e.message || 'Could not check this packet.'); } }
    finally { if (currentRequest === requestNumber.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { requestNumber.current++; }; }, [fileKey, revision]);
  async function send() {
    if (!packet || busy || loading || unsaved || !reviewed || packet.errors.length || locked || !packet.can_send) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/netfly/delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: fileKey, snapshot: packet.snapshot, reviewed }) });
      const d = await r.json().catch(() => null); if (!r.ok || !d?.ok) throw new Error(d?.error || 'The delivery result could not be checked. Refresh delivery status before trying again.');
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
      <h2>Final step: send to the firm</h2><p>Review our ontake, NETFLY intake, and the signed retainer, then send the packet.</p>
      <FileQaCheck fileKey={fileKey} revision={revision} unsaved={unsaved} onField={onField} />
      <a className="nf-secondary" href={`${endpoint}&pdf=intake`} target="_blank" rel="noopener noreferrer">Open intake PDF ↗</a>
      {packet && <><p><strong>To firm:</strong> {packet.to || 'Not configured'}<br /><strong>Copy:</strong> {packet.cc.join(', ')}</p><Link href="/app/netfly#firm-delivery" target="_blank" rel="noopener noreferrer">Firm delivery email settings ↗</Link>
        <p><strong>Included:</strong> our ontake PDF{packet.documents.map(doc => ` + ${doc.name}`).join('')}</p>
        {packet.documents.map(doc => <p key={doc.id}><a className="nf-secondary" href={doc.id === 'netfly-source-notes' ? `${endpoint}&pdf=source` : `/api/netfly/retainer?file=${encodeURIComponent(fileKey)}&document=${encodeURIComponent(doc.id)}`} target="_blank" rel="noopener noreferrer">Open {doc.name}</a></p>)}
        {packet.errors.length > 0 && <div className="nf-alert" role="status"><strong>Sending is blocked until these items are saved:</strong><ul>{packet.errors.map(item => <li key={item}>{item}</li>)}</ul><p>Opening a PDF or checking the final box does not record the client-details check or signed-PDF review.</p>{onReviewSteps && <button type="button" className="nf-secondary" onClick={onReviewSteps}>Go to saved review steps</button>} <Link href={packet.case_url}>Open case and agreement actions →</Link></div>}
        {locked && <p className="nf-alert">A send is already running or needs its delivery result checked. Ask an owner to check delivery history before sending again.</p>}
        {loading && <p role="status">Checking saved reviews and delivery status…</p>}
        {!packet.can_send && <p className="nf-alert">This account cannot send this file. Ask an authorized intake user to complete delivery.</p>}
        <label className="nf-inline-confirm"><input type="checkbox" checked={reviewed} disabled={busy || loading || unsaved || !!packet.errors.length || locked || !packet.can_send} onChange={e => setReviewed(e.target.checked)} /> I reviewed our ontake, NETFLY intake, the signed retainer, and the recipients.</label>
        {unsaved && <p className="nf-alert">Save the answers and call result before sending. Your edits are still on screen.</p>}
        <button type="button" className="nf-primary" disabled={busy || loading || unsaved || !reviewed || !!packet.errors.length || locked || !packet.can_send} onClick={() => void send()}>{busy ? 'Sending packet…' : 'SEND TO FIRM + BRETT'}</button>
      </>}
    </>}
    {error && <p className="nf-alert" role="alert">{error}</p>}{warning && <p className="nf-alert" role="status">{warning}</p>}
    <button type="button" className="nf-secondary" disabled={busy} onClick={() => void load()}>Refresh delivery status</button>
  </section>;
}
