'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartnerReportRow } from '@/lib/partner-report';
import './sheet.css';

type Report = { rows: PartnerReportRow[]; updatedAt: string };
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
      setReport(null); setPassword(''); setLocked(true); setError(''); setSearch('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign out.'); }
  }
  const rows = (report?.rows || []).filter(row => (!search.trim() || `${row.name} ${row.phone} ${row.status}`.toLowerCase().includes(search.trim().toLowerCase())) &&
    (signed === 'All clients' || signed === 'Signed' && row.signed === 'Yes' || signed === 'Not signed' && row.signed === 'No' || signed === 'Check signature' && row.signed === 'Check signature'));
  return <main className="pr-sheet">
    <header className="pr-top"><a href="/pr-digital" aria-label="ClaimReach PR Digital report">Claim<span>Reach</span></a><span>PR Digital</span></header>
    {locked ? <section className="pr-login"><div className="pr-kicker">PRIVATE CASE REPORT</div><h1>Welcome, PR Digital.</h1><p>Enter your password to see the latest INNO MVA case statuses.</p>
      <form onSubmit={unlock}><label htmlFor="report-password">Password</label><input id="report-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="pr-error" role="alert">{error}</p>}<button type="submit" disabled={loading || !password}>{loading ? 'Opening…' : 'Open live sheet'}</button></form></section> : <>
      <section className="pr-heading"><div><div className="pr-kicker">INNO MVA</div><h1>Live case sheet</h1><p>{report ? `${report.rows.length} clients · ${report.rows.filter(r => r.signed === 'Yes').length} signed` : 'Loading the latest statuses…'}</p></div>
        <div className="pr-controls"><button className="pr-secondary" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>{report && <button className="pr-text" onClick={lock}>Sign out</button>}</div></section>
      {error && <p className="pr-error" role="alert">{error}{report && ' Showing the last successful update below.'}</p>}
      {report && <><div className="pr-toolbar"><label className="pr-search"><span className="pr-sr">Find a client</span><input type="search" placeholder="Find a client…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label><span className="pr-sr">Signature filter</span><select value={signed} onChange={e => setSigned(e.target.value)}>{['All clients', 'Signed', 'Not signed', 'Check signature'].map(s => <option key={s}>{s}</option>)}</select></label>
        <span className="pr-updated" aria-live="polite">{error ? 'Last updated' : 'Updated'} {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(report.updatedAt))} Pacific</span></div>
        <div className="pr-table-wrap"><table><caption className="pr-sr">Live INNO MVA client statuses for PR Digital</caption><thead><tr>{['Full name', 'Phone #', 'Date received', 'Called', 'Signed', 'Date signed', 'Current status'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${row.name}-${index}`}>
            <td data-label="Full name" className="pr-name">{row.name}</td><td data-label="Phone #" className="pr-phone">{phone(row.phone)}</td><td data-label="Date received">{date(row.receivedAt)}</td>
            <td data-label="Called"><span className={row.called ? 'pr-yes' : 'pr-no'}>{row.called ? 'Yes' : 'No'}</span></td>
            <td data-label="Signed"><span className={row.signed === 'Yes' ? 'pr-yes' : 'pr-no'}>{row.signed}</span></td><td data-label="Date signed">{row.signed === 'Yes' ? date(row.signedAt) : '—'}</td>
            <td data-label="Current status" className="pr-status"><span>{row.status}</span></td></tr>)}</tbody></table>
          {!rows.length && <p className="pr-empty">{report.rows.length ? 'No clients match your search.' : 'No files to show yet.'}</p>}</div>
        <footer className="pr-foot"><span>Read only · Refreshes every minute · Dates in Pacific time</span><span>Called = a recorded call or saved call outcome. Missing historical dates stay “Not recorded.”</span></footer></>}
    </>}
  </main>;
}
