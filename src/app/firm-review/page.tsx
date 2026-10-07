'use client';
export const runtime = 'edge';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { REVIEW_LABELS, type ReviewAction } from '@/lib/firm-review-access';
import './review.css';
type File = { id: string; number: string; name: string; receivedAt: string | null; decision: ReviewAction | null; explanation: string; reviewer: string; packetNote?: string; declined?: boolean; outcome?: string; declineReason?: string; version?: string };
export default function FirmReview() {
  const [files, setFiles] = useState<File[]>([]), [name, setName] = useState(''), [campaign, setCampaign] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null), [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState<string | null>(null), [notice, setNotice] = useState('');
  async function load() {
    setError(''); setLoading(true);
    try { const res = await fetch('/api/firm-review', { cache: 'no-store' }); const data = await res.json();
      if (!res.ok) throw new Error(data.error); setFiles(data.files); setName(data.name); setCampaign(data.campaign);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your files.'); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(file: File, action: ReviewAction) {
    setBusy(file.id); setError(''); setNotice('');
    try { const res = await fetch('/api/firm-review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim: file.id, action, explanation: action === 'turned_down' ? explanation : '', confirm: true, version: file.version }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setFiles(rows => rows.map(row => row.id === file.id ? { ...row, ...data } : row));
      setSelected(null); setExplanation(''); setNotice(`${file.name}: ${REVIEW_LABELS[action]} saved.` + (data.notification
        ? data.notification.state === 'sent' ? ' Drop-letter request emailed to ' + data.notification.to + '.'
        : ' The drop-letter email needs attention. Ask BMC to check the request on this file.' : ''));
    } catch (e) { setError(e instanceof Error ? e.message : 'Your review has not saved.'); } finally { setBusy(null); }
  }
  const visible = files.filter(file => `${file.name} ${file.number}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="firm-review"><header><div><span className="fr-brand">ClaimReach · Firm inbox</span>
    <h1>{campaign || 'Your files'}</h1><p>Open the PDFs. Mark received. Record your decision.</p></div>
    <div className="fr-account"><span>{name}</span><button onClick={async () => { await supabaseBrowser().auth.signOut(); window.location.assign('/firm-review-login'); }}>Sign out</button></div></header>
    <div className="fr-toolbar"><label>Find a client<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or file number" /></label>
      <span>{files.length} files · {files.filter(file => !file.receivedAt).length} awaiting receipt</span><button disabled={loading} onClick={load}>Refresh</button></div>
    {error && <div className="fr-error" role="alert">{error}</div>}{notice && <div className="fr-notice" role="status">{notice}</div>}
    {loading ? <p role="status">Loading your files…</p> : !visible.length ? <p>No files found.</p> : <div className="fr-files">{visible.map(file => <article key={file.id}>
      <div className="fr-file-heading"><div><span className="fr-number">{file.number}</span><h2>{file.name}</h2></div><div className="fr-status">
        <span>{file.receivedAt ? '✓ Received' : 'Awaiting receipt'}</span>{file.declined ? <strong>Signed and declined · {file.outcome}</strong> : file.decision && <strong>{REVIEW_LABELS[file.decision]}</strong>}</div></div>
      <div className="fr-docs"><a href={`/api/firm-review?claim=${file.id}&document=intake`} target="_blank" rel="noreferrer">Open intake PDF ↗</a>
        <a href={`/api/firm-review?claim=${file.id}&document=retainer`} target="_blank" rel="noreferrer">Open retainer PDF ↗</a></div>
      {file.packetNote && <p>{file.packetNote}</p>}
      <div className="fr-actions"><button disabled={busy === file.id || !!file.receivedAt} onClick={() => save(file, 'received')}>{file.receivedAt ? 'Received ✓' : 'Mark received'}</button>
        <button className="fr-accept" disabled={busy === file.id || file.decision === 'accepted' || file.declined} onClick={() => save(file, 'accepted')}>Case Accepted</button>
        <button disabled={busy === file.id || file.declined} onClick={() => { setSelected(file.id); setExplanation(file.explanation || ''); }}>Case Turn Down</button></div>
      {selected === file.id && <div className="fr-decline"><label htmlFor={`reason-${file.id}`}>Why is the firm turning down this case?</label>
        <textarea id={`reason-${file.id}`} rows={4} maxLength={5000} value={explanation} onChange={e => setExplanation(e.target.value)} placeholder="Please explain in a short paragraph." />
        <p>This marks the file signed and declined and emails your configured firm delivery address requesting the client’s drop letter.</p>
        <button disabled={busy === file.id || !explanation.trim()} onClick={() => save(file, 'turned_down')}>{busy === file.id ? 'Saving…' : 'Confirm turn down & request drop letter'}</button>
        <button disabled={busy === file.id} onClick={() => setSelected(null)}>Cancel</button></div>}
      {(file.declined || file.decision === 'turned_down') && selected !== file.id && <p className="fr-reason">{file.declineReason || file.explanation}</p>}
      {file.reviewer && <small>Last reviewed by {file.reviewer}</small>}
    </article>)}</div>}
  </main>;
}
