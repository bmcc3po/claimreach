'use client';
import { useEffect, useRef, useState } from 'react';
import type { QaReport } from '@/lib/file-qa/report';
import './file-qa.css';

export default function FileQaCheck({ leadId, claimId, fileKey, revision, unsaved = false, onField }: {
  leadId?: string; claimId?: string; fileKey?: string; revision?: string; unsaved?: boolean; onField?: (id: string) => void;
}) {
  const [report, setReport] = useState<QaReport | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => { generation.current++; setReport(null); setError(''); setBusy(false); return () => { generation.current++; }; }, [leadId, claimId, fileKey, revision, unsaved]);
  async function run() {
    if (unsaved || busy) return;
    const request = ++generation.current;
    setBusy(true); setError('');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
    async function fetchCheck(op: 'check' | 'story', fingerprint?: string) {
      const r = await fetch('/api/calls/file-qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ op, lead_id: leadId, claim_id: claimId, file: fileKey, fingerprint }) });
      const d = await r.json();
      if (!r.ok || !d.report) throw new Error(d.error || 'The check could not finish.');
      return d.report as QaReport;
    }
    try {
      const quick = await fetchCheck('check');
      if (request !== generation.current) return;
      setReport(quick);
      if (!quick.sent) {
        const story = await fetchCheck('story', quick.fingerprint);
        if (request === generation.current) setReport(story);
      }
    } catch (e: any) { if (request === generation.current) { setReport(null); setError(e.name === 'AbortError' ? 'The check took too long. Your file is saved; retry or continue your normal review.' : e.message); } }
    finally { clearTimeout(timer); if (request === generation.current) setBusy(false); }
  }
  const fix = report?.findings.filter(f => f.level === 'fix') || [], review = report?.findings.filter(f => f.level === 'review') || [], followup = report?.findings.filter(f => f.level === 'followup') || [];
  return <section className="file-qa-check" aria-label="File check">
    <div className="file-qa-title"><div><h3>Let’s check your file</h3><p>Check the saved answers, story and packet before your final review.</p></div><button type="button" disabled={busy || unsaved} onClick={() => void run()}>{busy ? report ? 'Checking the story…' : 'Checking…' : 'I’m done — check my file'}</button></div>
    {unsaved && <p role="status">Save your latest answers first.</p>}
    {error && <p role="alert">{error}</p>}
    {report && <div aria-live="polite">
      <strong>{report.sent ? 'Already sent — review the delivery receipt' : fix.length ? `${fix.length} item${fix.length === 1 ? '' : 's'} to finish` : review.length ? 'A few facts need a second look' : 'Quick check complete — continue your PDF review'}</strong>
      {([['Finish', fix], ['Ask a reviewer', review], ['Follow up', followup]] as const).map(([title, items]) => !!items.length && <div key={title}><h4>{title}</h4><ul>{items.map(item => <li key={item.id}>{item.field && onField ? <button type="button" className="file-qa-field" onClick={() => onField(item.field!)}>{item.message} →</button> : item.message}{item.evidence?.map((quote, i) => <blockquote key={i}>{quote}</blockquote>)}</li>)}</ul></div>)}
      {!report.sent && <p>{report.narrative === 'complete' ? 'Story suggestions are for human review. Confirm the facts with their sources.' : report.narrative === 'unavailable' ? 'The story helper was unavailable. The quick checks ran; continue with your own review or retry.' : 'Checking the story against the saved answers…'}</p>}
      <p className="file-qa-caption">This check does not approve or send the file. Finish the file’s PDF review, then use Send to firm.</p>
    </div>}
  </section>;
}
