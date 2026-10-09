'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartnerReportRow, PartnerReportSummary } from '@/lib/partner-report';
import './sheet.css';
import './summary.css';

type Report = { rows: PartnerReportRow[]; summary: PartnerReportSummary; updatedAt: string };
function date(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : 'America/Los_Angeles', dateStyle: 'medium' }).format(new Date(value)) : 'Not recorded';
}
function phone(value: string) {
  const n = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : value || 'Not recorded';
}
export default function PartnerSheet() {
  const [report, setReport] = useState<Report | null>(null);
  const [locked, setLocked] = useState(false), [loading, setLoading] = useState(true);
  const [password, setPassword] = useState(''), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [signed, setSigned] = useState('All clients');
  const [view, setView] = useState<'summary' | 'clients'>('summary');
  const [status, setStatus] = useState('');
  const running = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true; setLoading(true);
    const current = generation.current;
    try {
      const response = await fetch('/api/pr-digital', { cache: 'no-store' });
      const data = await response.json();
      if (current !== generation.current) return;
      if (response.status === 401) { setLocked(true); setReport(null); setError(''); return; }
      if (!response.ok) throw new Error(data.error || 'Could not refresh. Please try again.');
      setReport(data); setLocked(false); setError('');
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Could not refresh. Please try again.'); }
    finally { if (current === generation.current) { running.current = false; setLoading(false); } }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    generation.current++; running.current = false;
    try {
      const response = await fetch('/api/pr-digital', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not open the report.');
      setPassword(''); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the report.'); }
    finally { setLoading(false); }
  }
  async function lock() {
    try {
      const response = await fetch('/api/pr-digital', { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not sign out. Please try again.');
      generation.current++; running.current = false; setLoading(false);
      setReport(null); setPassword(''); setLocked(true); setError(''); setSearch(''); setSigned('All clients'); setStatus(''); setView('summary');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign out.'); }
  }
  const rows = (report?.rows || []).filter(row => (!search.trim() || `${row.name} ${row.phone} ${row.status}`.toLowerCase().includes(search.trim().toLowerCase())) &&
    (!status || row.status === status) &&
    (signed === 'All clients' || signed === 'Signed' && row.signed === 'Yes' || signed === 'Not signed' && row.signed === 'No' || signed === 'Check signature' && row.signed === 'Check signature'));
  function showClients(signature = 'All clients', fileStatus = '') {
    setSigned(signature); setStatus(fileStatus); setSearch(''); setView('clients');
  }
  const statuses = Object.entries((report?.rows || []).reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1; return counts;
  }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const summary = report?.summary;
  return <main className="pr-sheet">
    <header className="pr-top"><a href="/pr-digital" aria-label="ClaimReach PR Digital report">Claim<span>Reach</span></a><span>PR Digital</span></header>
    {locked ? <section className="pr-login"><div className="pr-kicker">PRIVATE CASE REPORT</div><h1>Welcome, PR Digital.</h1><p>Enter your password to see the latest INNO MVA case statuses.</p>
      <form onSubmit={unlock}><label htmlFor="report-password">Password</label><input id="report-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="pr-error" role="alert">{error}</p>}<button type="submit" disabled={loading || !password}>{loading ? 'Opening…' : 'Open live sheet'}</button></form></section> : <>
      <section className="pr-heading"><div><div className="pr-kicker">INNO MVA</div><h1>{view === 'summary' ? 'Your leads at a glance' : 'Client list'}</h1><p>{report ? 'All time · Only your PR Digital leads' : 'Loading the latest statuses…'}</p></div>
        <div className="pr-controls"><button className="pr-secondary" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>{report && <button className="pr-text" onClick={lock}>Sign out</button>}</div></section>
      {error && <p className="pr-error" role="alert">{error}{report && ' Showing the last successful update below.'}</p>}
      {report && <><div className="pr-viewbar"><nav aria-label="Report views"><button className={view === 'summary' ? 'pr-selected' : 'pr-text'} aria-current={view === 'summary' ? 'page' : undefined} onClick={() => setView('summary')}>Summary</button><button className={view === 'clients' ? 'pr-selected' : 'pr-text'} aria-current={view === 'clients' ? 'page' : undefined} onClick={() => showClients()}>All clients ({report.rows.length})</button></nav>
        <span className="pr-updated" aria-live="polite">{error ? 'Last updated' : 'Updated'} {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(report.updatedAt))} Pacific</span></div>
        {view === 'summary' && summary ? <section className="pr-summary" aria-label="Summary report">
          <div className="pr-metrics">
            <button className="pr-metric" onClick={() => showClients()}><span>Total leads</span><strong>{summary.total}</strong><small>View every client →</small></button>
            <button className="pr-metric pr-metric-signed" onClick={() => showClients('Signed')}><span>Signed</span><strong>{summary.signed}</strong><small>Confirmed signatures →</small></button>
            <button className="pr-metric" onClick={() => showClients('Not signed')}><span>Not signed</span><strong>{summary.unsigned}</strong><small>View these clients →</small></button>
            <div className="pr-metric"><span>Called</span><strong>{summary.called}<em> / {summary.total}</em></strong><small>{summary.total - summary.called} with no recorded call</small></div>
          </div>
          {summary.verify > 0 && <button className="pr-check-signature" onClick={() => showClients('Check signature')}>{summary.verify} {summary.verify === 1 ? 'signature needs' : 'signatures need'} verification. View clients →</button>}
          <div className="pr-summary-columns"><section className="pr-summary-panel"><h2>After signing</h2><p>Where your signed files stand.</p>
            <dl className="pr-delivery-totals"><div><dt><i className="pr-dot pr-dot-wait" />Awaiting delivery</dt><dd>{summary.awaitingDelivery}</dd></div><div><dt><i className="pr-dot" />Sent to firm</dt><dd>{summary.sentToFirm}</dd></div><div><dt><i className="pr-dot pr-dot-declined" />Signed and declined</dt><dd>{summary.declined}</dd></div></dl>
            <p className="pr-summary-note">Awaiting delivery excludes declined files. Sent to firm includes files declined after delivery.</p>
          </section><section className="pr-summary-panel"><h2>Current statuses</h2><p>Select a status to see the clients.</p>
            <div className="pr-status-breakdown">{statuses.map(([label, count]) => <button key={label} onClick={() => showClients('All clients', label)}><span>{label}</span><strong>{count}</strong><span className="pr-status-track" aria-hidden="true"><span style={{ width: `${count / summary.total * 100}%` }} /></span></button>)}{!statuses.length && <p>No files to show yet.</p>}</div>
          </section></div>
          <div className="pr-summary-action"><button onClick={() => showClients()}>View all {summary.total} clients →</button><span>Names, phone numbers, dates and live statuses.</span></div>
        </section> : <><div className="pr-toolbar"><label className="pr-search"><span className="pr-sr">Find a client</span><input type="search" placeholder="Find a client…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label><span className="pr-sr">Signature filter</span><select value={signed} onChange={e => setSigned(e.target.value)}>{['All clients', 'Signed', 'Not signed', 'Check signature'].map(s => <option key={s}>{s}</option>)}</select></label>
        {status && <button className="pr-secondary pr-status-filter" onClick={() => setStatus('')} aria-label={`Clear status filter: ${status}`}>{status} ×</button>}<span className="pr-result-count">{rows.length} {rows.length === 1 ? 'client' : 'clients'}</span></div>
        <div className="pr-table-wrap"><table><caption className="pr-sr">Live INNO MVA client statuses for PR Digital</caption><thead><tr>{['Full name', 'Phone #', 'Date received', 'Called', 'Signed', 'Date signed', 'Current status'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${row.name}-${index}`}>
            <td data-label="Full name" className="pr-name">{row.name}</td><td data-label="Phone #" className="pr-phone">{phone(row.phone)}</td><td data-label="Date received">{date(row.receivedAt)}</td>
            <td data-label="Called"><span className={row.called ? 'pr-yes' : 'pr-no'}>{row.called ? 'Yes' : 'No'}</span></td>
            <td data-label="Signed"><span className={row.signed === 'Yes' ? 'pr-yes' : 'pr-no'}>{row.signed}</span></td><td data-label="Date signed">{row.signed === 'Yes' ? date(row.signedAt) : '—'}</td>
            <td data-label="Current status" className="pr-status"><span>{row.status}</span></td></tr>)}</tbody></table>
          {!rows.length && <p className="pr-empty">{report.rows.length ? 'No clients match your search.' : 'No files to show yet.'}</p>}</div></>}
        <footer className="pr-foot"><span>Read only · Refreshes every minute · Dates in Pacific time</span><span>Called = a recorded call or saved call outcome. Missing historical dates stay “Not recorded.”</span></footer></>}
    </>}
  </main>;
}
