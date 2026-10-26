'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import FileQaCheck from '../calls/FileQaCheck';
type Preview = { missing_retainer: boolean; errors: string[]; documents: { id: string; name: string }[]; to: string; cc: string[]; snapshot: string; case_url: string; sent_at: string | null; can_send: boolean; dispatch: { state: string; finished_at?: string } | null };
export default function NetflySendPacket({ fileKey, revision, signedDocuments, unsaved, onField, onReviewSteps }: { fileKey: string; revision: string; signedDocuments: { id: string; url: string | null; file_name: string }[]; unsaved: boolean; onField?: (id: string) => void; onReviewSteps?: () => void }) {
  const [packet, setPacket] = useState<Preview | null>(null), [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [sent, setSent] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const requestNumber = useRef(0);
  const sending = useRef(false);
  const [unverifiedRetainer, setUnverifiedRetainer] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const endpoint = `/api/netfly/delivery?file=${encodeURIComponent(fileKey)}`;
  async function load() {
    const currentRequest = ++requestNumber.current;
    setError(''); setReviewed(false); setUnverifiedRetainer(false); setRefreshRequired(false); setLoading(true);
    try { const r = await fetch(endpoint, { cache: 'no-store' }); const d = await r.json().catch(() => null); if (!r.ok || !d) throw new Error(d?.error || (r.status === 403 ? 'This account cannot open delivery. Your file is saved; ask an administrator to check access.' : 'Could not check this packet. Refresh delivery status to try again.')); if (currentRequest === requestNumber.current) setPacket(d); }
    catch (e: any) { if (currentRequest === requestNumber.current) { setPacket(null); setError(e.message || 'Could not check this packet.'); } }
    finally { if (currentRequest === requestNumber.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { requestNumber.current++; }; }, [fileKey, revision]);
  async function send() {
    if (!packet || sending.current || busy || loading || refreshRequired || unsaved || !reviewed || packet.errors.length || locked || !packet.can_send) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const r = await fetch('/api/netfly/delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: fileKey, snapshot: packet.snapshot, reviewed, retainer_decision: packet.missing_retainer ? 'missing' : unverifiedRetainer ? 'unverified' : 'reviewed' }) });
      const d = await r.json().catch(() => null); if (!r.ok || !d?.ok) throw new Error(d?.error || 'The delivery result could not be checked. Refresh delivery status before trying again.');
      if (d.warning) setWarning(d.warning);
      if (!d.skipped) setSent(new Date().toISOString());
      await load();
    } catch (e: any) { setReviewed(false); setRefreshRequired(true); setError(e.message || 'The delivery result could not be checked. Refresh delivery status before trying again.'); }
    finally { sending.current = false; setBusy(false); }
  }
  const sentAt = packet?.sent_at || (packet?.dispatch?.state === 'sent' ? packet.dispatch.finished_at : '') || sent;
  const locked = ['sending', 'uncertain'].includes(packet?.dispatch?.state || '');
  return <section className="nf-call-block nf-final-send" aria-label="Send NETFLY packet to firm">
    {sentAt ? <><div className="nf-sent-balloons" aria-hidden="true">🎈 🎈 🎈</div><h2>File sent to the firm!</h2><p>Sent {new Date(sentAt).toLocaleString()}. Brett was copied. The packet is recorded on this file.</p><Link className="nf-primary" href="/app/netfly">Back to NETFLY files</Link></> : <>
      <h2>Final step: send to the firm</h2><p>Review the available packet and recipients, then confirm below. Your confirmation records your attestation; opening a PDF is not tracked or required.</p>
      <FileQaCheck fileKey={fileKey} revision={revision} unsaved={unsaved} onField={onField} />
      <a className="nf-secondary" href={`${endpoint}&pdf=intake`} target="_blank" rel="noopener noreferrer">Open intake PDF ↗</a>
      {packet && <><p><strong>To firm:</strong> {packet.to || 'Not configured'}<br /><strong>Copy:</strong> {packet.cc.join(', ')}</p><Link href="/app/netfly#firm-delivery" target="_blank" rel="noopener noreferrer">Firm delivery email settings ↗</Link>
        <p><strong>Included:</strong> our ontake PDF{packet.documents.map(doc => ` + ${doc.name}`).join('')}</p>
        {packet.documents.map(doc => <p key={doc.id}><a className="nf-secondary" href={doc.id === 'netfly-source-notes' ? `${endpoint}&pdf=source` : `/api/netfly/retainer?file=${encodeURIComponent(fileKey)}&document=${encodeURIComponent(doc.id)}`} target="_blank" rel="noopener noreferrer">Open {doc.name}</a></p>)}
        {packet.errors.length > 0 && <div className="nf-alert" role="status"><strong>Sending is blocked until these items are saved:</strong><ul>{packet.errors.map(item => <li key={item}>{item}</li>)}</ul>{onReviewSteps && <button type="button" className="nf-secondary" onClick={onReviewSteps}>Go to file details</button>} <Link href={packet.case_url}>Open case and agreement actions →</Link></div>}
        {locked && <p className="nf-alert">A send is already running or needs its delivery result checked. Ask an owner to check delivery history before sending again.</p>}
        {loading && <p role="status">Checking packet and delivery status…</p>}
        {!packet.can_send && <p className="nf-alert">This account cannot send this file. Ask an authorized intake user to complete delivery.</p>}
        {packet.missing_retainer ? <p className="nf-alert" role="alert"><strong>Retainer missing.</strong> The available packet can be sent. The email will say “RETAINER NOT PROVIDED BY NETFLY.” Your acknowledgment will be recorded; this does not mark a retainer received or signed.</p> : <>
          <button type="button" className="nf-secondary" disabled={busy || loading || refreshRequired} onClick={() => { setUnverifiedRetainer(value => !value); setReviewed(false); }}>{unverifiedRetainer ? 'Cancel unverified-retainer override' : 'Cannot verify the retainer? Send with a warning'}</button>
          {unverifiedRetainer && <p className="nf-alert" role="alert"><strong>Retainer unverified.</strong> The attached retainer will still be included. The email will say “ATTACHED RETAINER NOT VERIFIED.”</p>}
        </>}
        {refreshRequired && <p role="status">Refresh delivery status before confirming another attempt.</p>}
        <label className="nf-inline-confirm"><input type="checkbox" checked={reviewed} disabled={busy || loading || refreshRequired || unsaved || !!packet.errors.length || locked || !packet.can_send} onChange={e => setReviewed(e.target.checked)} aria-label="Confirm packet review" /> {packet.missing_retainer ? 'I reviewed the available packet and recipients. NETFLY did not provide a retainer; send without it and warn the firm.' : unverifiedRetainer ? 'I reviewed the available packet and recipients. I cannot verify the retainer; send it with a warning to the firm.' : 'I confirm I reviewed the available packet, including the attached retainer, and the recipients. Send to the firm.'}</label>
        {unsaved && <p className="nf-alert">Save the answers and call result before sending. Your edits are still on screen.</p>}
        <button type="button" className="nf-primary" disabled={busy || loading || refreshRequired || unsaved || !reviewed || !!packet.errors.length || locked || !packet.can_send} onClick={() => void send()}>{busy ? 'Sending packet…' : packet.missing_retainer ? 'SEND WITHOUT RETAINER + WARN FIRM' : unverifiedRetainer ? 'SEND WITH RETAINER WARNING' : 'SEND TO FIRM + BRETT'}</button>
      </>}
    </>}
    {error && <p className="nf-alert" role="alert">{error}</p>}{warning && <p className="nf-alert" role="status">{warning}</p>}
    <button type="button" className="nf-secondary" disabled={busy} onClick={() => void load()}>Refresh delivery status</button>
  </section>;
}
