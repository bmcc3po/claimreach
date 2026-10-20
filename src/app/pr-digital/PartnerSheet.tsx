'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartnerReportRow, PartnerReportSummary } from '@/lib/partner-report';
import { datePreset, inReportRange, summarizePartnerRows, groupPartnerRows, sortPartnerRows, partnerCsv, REPORT_COLUMNS, reportCell, reportDuration, type ReportSortKey } from '@/lib/partner-report-view';
import './sheet.css';
import './summary.css';

type Report = { rows: PartnerReportRow[]; summary: PartnerReportSummary; updatedAt: string };
function phone(value: string) {
  const n = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : value || 'Not recorded';
}
export default function PartnerSheet({ ownerPreview = false }: { ownerPreview?:boolean } = {}) {
  const [report, setReport] = useState<Report | null>(null);
  const [locked, setLocked] = useState(false), [loading, setLoading] = useState(true);
  const [password, setPassword] = useState(''), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [signed, setSigned] = useState('All clients');
  const [view, setView] = useState<'summary' | 'clients'>('summary');
  const [statusesSelected, setStatusesSelected] = useState<string[]>([]);
  const [preset,setPreset] = useState('All time'), [from,setFrom] = useState(''), [to,setTo] = useState('');
  const [basis,setBasis] = useState<'receivedAt'|'signedAt'>('receivedAt');
  const [state,setState] = useState(''), [uncalled,setUncalled] = useState(false);
  const [bucket,setBucket] = useState('');
  const [dqKind,setDqKind] = useState(''), [dqReason,setDqReason] = useState('');
  const [sort,setSort] = useState<ReportSortKey>('receivedAt'), [direction,setDirection] = useState<'asc'|'desc'>('desc');
  const running = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true; setLoading(true);
    const current = generation.current;
    try {
      const response = await fetch(ownerPreview ? '/api/owner/pr-digital-report' : '/api/pr-digital', { cache: 'no-store' });
      const data = await response.json();
      if (current !== generation.current) return;
      if (ownerPreview && [401,403].includes(response.status)) { setReport(null); throw new Error('Sign in with your active owner account to preview this report.'); }
      if (response.status === 401) { setLocked(true); setReport(null); setError(''); return; }
      if (!response.ok) throw new Error(data.error || 'Could not refresh. Please try again.');
      setReport(data); setLocked(false); setError('');
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Could not refresh. Please try again.'); }
    finally { if (current === generation.current) { running.current = false; setLoading(false); } }
  }, [ownerPreview]);
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
      setReport(null); setPassword(''); setLocked(true); setError(''); setSearch(''); setSigned('All clients'); setStatusesSelected([]); setBucket(''); setState(''); setUncalled(false); setPreset('All time'); setFrom(''); setTo(''); setBasis('receivedAt'); setView('summary');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign out.'); }
  }
  const range = preset === 'Custom range' ? {from,to} : datePreset(preset,report?.updatedAt || new Date().toISOString());
  const invalidRange = !!range.from && !!range.to && range.from > range.to;
  const allRows = report?.rows || [];
  const summaryRows = invalidRange ? [] : allRows.filter(r => inReportRange(r,range.from,range.to));
  const summary = summarizePartnerRows(summaryRows);
  const rows = sortPartnerRows((invalidRange ? [] : allRows).filter(row =>
    inReportRange(row,range.from,range.to,basis) && (!dqKind || row.dqKind === dqKind) && (!dqReason || row.dqReason === dqReason) &&
    (!search.trim() || `${row.name} ${row.phone} ${row.status} ${row.state || ''} ${row.notes || ''}`.toLowerCase().includes(search.trim().toLowerCase())) &&
    (!statusesSelected.length || statusesSelected.includes(row.status)) && (!state || (row.state || 'Not recorded') === state) &&
    (!uncalled || !row.called) &&
    (!bucket || bucket === 'progress' && row.signed !== 'Yes' && ['new','contacting','esign_sent'].includes(row.statusKey) ||
      bucket === 'lost' && row.signed !== 'Yes' && ['dq','external_dq_review','not_interested'].includes(row.statusKey)) &&
    (signed === 'All clients' || signed === 'Signed' && row.signed === 'Yes' || signed === 'Not signed' && row.signed === 'No' || signed === 'Check signature' && row.signed === 'Check signature')),sort,direction);
  function showClients(signature = 'All clients', fileStatus = '', group = '') {
    setDqKind(''); setDqReason(''); setSigned(signature); setStatusesSelected(fileStatus ? [fileStatus] : []); setBucket(group); setSearch(''); setState(''); setUncalled(false); setBasis('receivedAt'); setView('clients');
  }
  const statuses = Object.entries(summaryRows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1; return counts;
  }, {})).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  const statusOptions = [...new Set(allRows.map(r=>r.status))].sort();
  const stateOptions = [...new Set(allRows.map(r=>r.state || 'Not recorded'))].sort();
  const percent = (n:number) => new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:1}).format(n);
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([partnerCsv(rows)],{type:'text/csv;charset=utf-8;'}));
    const link = document.createElement('a'); link.href=url; link.download=`PR-Digital-INNO-MVA-${new Date().toISOString().slice(0,10)}.csv`; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function sortBy(key:ReportSortKey) {
    if (sort === key) setDirection(direction === 'asc'?'desc':'asc'); else { setSort(key); setDirection(['receivedAt','signedAt','lastActivityAt'].includes(key)?'desc':'asc'); }
  }
  return <main className="pr-sheet">
    <header className="pr-top"><a href="/pr-digital" aria-label="ClaimReach PR Digital report">Claim<span>Reach</span></a><span>PR Digital</span></header>
    {locked ? <section className="pr-login"><div className="pr-kicker">PRIVATE CASE REPORT</div><h1>Welcome, PR Digital.</h1><p>Enter your password to see the latest INNO MVA case statuses.</p>
      <form onSubmit={unlock}><label htmlFor="report-password">Password</label><input id="report-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="pr-error" role="alert">{error}</p>}<button type="submit" disabled={loading || !password}>{loading ? 'Opening…' : 'Open live sheet'}</button></form></section> : <>
      <section className="pr-heading"><div><div className="pr-kicker">INNO MVA</div><h1>{view === 'summary' ? 'Your leads at a glance' : 'Client list'}</h1><p>{report ? 'Only your PR Digital leads · Test data excluded' : 'Loading the latest statuses…'}</p></div>
        <div className="pr-controls"><button className="pr-secondary" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>{report && !ownerPreview && <button className="pr-text" onClick={lock}>Sign out</button>}</div></section>
      {error && <p className="pr-error" role="alert">{error}{report && ' Showing the last successful update below.'}</p>}
      {report && <><div className="pr-viewbar"><nav aria-label="Report views"><button className={view === 'summary' ? 'pr-selected' : 'pr-text'} aria-current={view === 'summary' ? 'page' : undefined} onClick={() => setView('summary')}>Summary</button><button className={view === 'clients' ? 'pr-selected' : 'pr-text'} aria-current={view === 'clients' ? 'page' : undefined} onClick={() => showClients()}>Client list ({summaryRows.length})</button></nav>
        <span className="pr-updated" aria-live="polite">{error ? 'Last updated' : 'Updated'} {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(report.updatedAt))} Pacific</span></div>
        <section className="pr-date-filter" aria-label="Date filters">
          <label>Campaign<select aria-label="Campaign"><option>INNO MVA</option></select></label><label>Date range<select value={preset} onChange={e=>setPreset(e.target.value)}>{['Last 7 days','Last 14 days','Last 30 days','This month','Custom range','All time'].map(p=><option key={p}>{p}</option>)}</select></label>
          {view === 'clients' ? <label>Filter by<select value={basis} onChange={e=>setBasis(e.target.value as typeof basis)}><option value="receivedAt">Date received</option><option value="signedAt">Date signed</option></select></label> : <span>By lead creation date · Pacific time</span>}
          {preset === 'Custom range' && <><label>From<input type="date" value={from} max={to || undefined} onChange={e=>setFrom(e.target.value)}/></label><label>Through<input type="date" value={to} min={from || undefined} onChange={e=>setTo(e.target.value)}/></label></>}
          {view === 'clients' && <><label>DQ outcome<select value={dqKind} onChange={e=>setDqKind(e.target.value)}><option value="">All outcomes</option>{['Current intake DQ','Historical DQ','Firm turn-down'].map(k=><option key={k}>{k}</option>)}</select></label><label>DQ reason<select value={dqReason} onChange={e=>setDqReason(e.target.value)}><option value="">All reasons</option>{[...new Set(summaryRows.map(r=>r.dqReason).filter(Boolean))].map(k=><option key={k!}>{k}</option>)}</select></label></>}
          {invalidRange && <span role="alert" className="pr-range-error">End date must be on or after the start date.</span>}
        </section>
        {view === 'summary' && summary ? <section className="pr-summary" aria-label="Summary report">
          <div className="pr-metrics">
            <button className="pr-metric" onClick={() => showClients()}><span>Total leads</span><strong>{summary.total}</strong><small>View every client →</small></button>
            <button className="pr-metric" onClick={() => showClients('All clients','','progress')}><span>In progress</span><strong>{summary.inProgress}</strong><small>New + Contacting + e-Sign Sent →</small></button>
            <button className="pr-metric pr-metric-signed" onClick={() => showClients('Signed')}><span>Signed</span><strong>{summary.signed}</strong><small>Confirmed signatures →</small></button>
            <button className="pr-metric" onClick={() => showClients('All clients','','lost')}><span>Lost</span><strong>{summary.lost}</strong><small>DQ + Not Interested →</small></button>
            <div className="pr-metric"><span>Sign rate</span><strong>{percent(summary.signRate)}</strong><small>Signed / Total leads</small></div>
            <div className="pr-metric"><span>Average speed to lead</span><strong className="pr-speed-value">{summary.averageSpeedMinutes == null ? '—' : reportDuration(summary.averageSpeedMinutes*60)}</strong><small>{summary.speedSamples} of {summary.total} leads with verified timestamps</small></div>
          </div>
          {summary.verify > 0 && <button className="pr-check-signature" onClick={() => showClients('Check signature')}>{summary.verify} {summary.verify === 1 ? 'signature needs' : 'signatures need'} verification. View clients →</button>}
          <div className="pr-summary-columns"><section className="pr-summary-panel"><h2>After signing</h2><p>Where your signed files stand.</p>
            <dl className="pr-delivery-totals"><div><dt><i className="pr-dot pr-dot-wait" />Awaiting delivery</dt><dd>{summary.awaitingDelivery}</dd></div><div><dt><i className="pr-dot" />Sent to firm</dt><dd>{summary.sentToFirm}</dd></div><div><dt><i className="pr-dot pr-dot-declined" />Signed and declined</dt><dd>{summary.declined}</dd></div></dl>
            <p className="pr-summary-note">Each signed file appears in one group. These groups add up to Signed.</p>
          </section><section className="pr-summary-panel"><h2>Current statuses</h2><p>Select a status to see the clients.</p>
            <div className="pr-status-breakdown">{statuses.map(([label, count]) => <button key={label} onClick={() => showClients('All clients', label)}><span>{label}</span><strong>{count}</strong><span className="pr-status-track" aria-hidden="true"><span style={{ width: `${summary.total ? count / summary.total * 100 : 0}%` }} /></span></button>)}{!statuses.length && <p>No files to show yet.</p>}</div>
          </section></div>
          <section className="pr-summary-panel"><h2>Disqualification reasons</h2><p>Current intake DQ, historical DQ, and firm turn-downs are counted separately. Select a reason to read the explanations.</p>
          {['Current intake DQ','Historical DQ','Firm turn-down'].map(kind => <section key={kind}><h3>{kind} ({summaryRows.filter(r=>r.dqKind===kind).length})</h3><div className="pr-status-breakdown">{Object.entries(summaryRows.filter(r=>r.dqKind===kind).reduce<Record<string,number>>((m,r)=>{ const k=r.dqReason || 'Reason missing';m[k]=(m[k]||0)+1;return m;},{})).map(([reason,count])=><button key={reason} onClick={()=>{showClients();setDqKind(kind);setDqReason(reason);}}><span>{reason}</span><strong>{count}</strong></button>)}</div></section>)}
          <p>{summaryRows.filter(r=>r.dqReview?.startsWith('Review required')).length} leads need review. Unreviewed historical narratives remain private.</p></section>
          <div className="pr-summary-columns pr-group-tables">{(['week','state'] as const).map(by=><section key={by} className="pr-summary-panel"><h2>{by === 'week'?'By week received':'By state'}</h2><p>{by === 'week'?'Weeks begin Monday · grouped by receipt date':'Client mailing state'}</p><div className="pr-compact-wrap"><table><thead><tr><th>{by === 'week'?'Week of':'State'}</th><th>Leads</th><th>Signed</th><th>Sign rate</th>{by === 'week'&&<th>Still in progress</th>}</tr></thead><tbody>{groupPartnerRows(summaryRows,by).map(g=><tr key={g.key}><td>{g.key}</td><td>{g.total}</td><td>{g.signed}</td><td>{percent(g.signRate)}</td>{by === 'week'&&<td>{g.inProgress}</td>}</tr>)}</tbody></table>{!summaryRows.length&&<p>No leads in this date range.</p>}</div></section>)}</div>
          <div className="pr-summary-action"><button onClick={() => showClients()}>View all {summary.total} clients →</button><span>Names, phone numbers, dates and live statuses.</span></div>
        </section> : <><div className="pr-toolbar"><label className="pr-search"><span className="pr-sr">Find a client</span><input type="search" placeholder="Find a client…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label><span className="pr-sr">Signature filter</span><select value={signed} onChange={e => setSigned(e.target.value)}>{['All clients', 'Signed', 'Not signed', 'Check signature'].map(s => <option key={s}>{s}</option>)}</select></label>
        <details className="pr-status-menu"><summary>Status ({statusesSelected.length || 'All'})</summary><div>{statusOptions.map(option=><label key={option}><input type="checkbox" checked={statusesSelected.includes(option)} onChange={e=>setStatusesSelected(e.target.checked?[...statusesSelected,option]:statusesSelected.filter(s=>s!==option))}/>{option}</label>)}<button className="pr-text" onClick={()=>setStatusesSelected([])}>Clear statuses</button></div></details>
        <label><span className="pr-sr">State</span><select value={state} onChange={e=>setState(e.target.value)}><option value="">All states</option>{stateOptions.map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="pr-checkbox"><input type="checkbox" checked={uncalled} onChange={e=>setUncalled(e.target.checked)}/>Not called yet</label>
        {bucket && <button className="pr-secondary" onClick={()=>setBucket('')}>{bucket === 'progress'?'In progress':'Lost'} ×</button>}
        <span className="pr-result-count" aria-live="polite">{rows.length} {rows.length === 1 ? 'client' : 'clients'}</span><button className="pr-secondary" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div>
        <div className="pr-mobile-sort"><label>Sort by<select value={sort} onChange={e=>sortBy(e.target.value as ReportSortKey)}>{REPORT_COLUMNS.map(c=><option value={c.key} key={c.key}>{c.label}</option>)}</select></label><button className="pr-secondary" onClick={()=>setDirection(direction === 'asc'?'desc':'asc')}>{direction === 'asc'?'Ascending ↑':'Descending ↓'}</button></div>
        <p className="pr-data-note">Call duration is the recorded total and may include ring time; historical talk-only time is unavailable. Missing timestamps stay unrecorded.</p>
        <div className="pr-table-wrap pr-clients"><table><caption className="pr-sr">Live INNO MVA client statuses for PR Digital</caption><thead><tr>{REPORT_COLUMNS.map(c=><th key={c.key} scope="col" aria-sort={sort === c.key ? direction === 'asc'?'ascending':'descending':'none'}><button onClick={()=>sortBy(c.key)}>{c.label}{sort === c.key ? direction === 'asc'?' ↑':' ↓':''}</button></th>)}</tr></thead>
          <tbody>{rows.map((row,index)=><tr key={`${row.name}-${row.phone}-${index}`}>{REPORT_COLUMNS.map(c=><td key={c.key} data-label={c.label} className={c.key === 'name'?'pr-name':c.key === 'phone'?'pr-phone':c.key === 'status'?'pr-status':c.key === 'notes'?'pr-note-cell':''}>{c.key === 'phone'?phone(row.phone):c.key === 'status'?<span>{row.status}</span>:c.key === 'called' || c.key === 'signed'?<span className={row[c.key] === true || row[c.key] === 'Yes'?'pr-yes':'pr-no'}>{reportCell(row,c.key)}</span>:reportCell(row,c.key)}</td>)}</tr>)}</tbody></table>
          {!rows.length && <p className="pr-empty">{report.rows.length ? 'No clients match these filters.' : 'No files to show yet.'}</p>}</div></>}
        <footer className="pr-foot"><span>Read only · Refreshes every minute · Dates in Pacific time · Received = date added to ClaimReach · Test data excluded</span><span>Called = recorded call evidence. Open New leads with call evidence display as Contacting. Missing historical dates stay “Not recorded.”</span></footer></>}
    </>}
  </main>;
}
