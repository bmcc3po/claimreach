"use client";
import { useEffect, useState, type ReactNode } from 'react';
import FileHeader from '../FileHeader';
import FileStatusControl from '../FileStatusControl';
import FileOutcomeActions from '../FileOutcomeActions';
import FileArchiveButton from '../FileArchiveButton';

export default function CallFileHeader({ leadId, claimId, name, leadNo, revision, saveNotice, saveBad, children }: {
  leadId: string; claimId: string; name: string; leadNo: string; revision?: string; saveNotice?: string; saveBad?: boolean; children?: ReactNode;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let latest = 0;
    async function load() {
      const request = ++latest;
      try {
        const q = new URLSearchParams({ lead_id: leadId, claim_id: claimId, summary: '1' });
        const r = await fetch(`/api/calls/file?${q}`, { cache: 'no-store', signal: controller.signal });
        const d = await r.json();
        if (!r.ok || d.claim_id !== claimId) throw new Error(d.error || 'Could not check the file status.');
        if (!controller.signal.aborted && request === latest) { setData(d); setError(''); }
      } catch (e: any) { if (!controller.signal.aborted && request === latest) setError(e.message || 'Could not check the file status.'); }
    }
    void load();
    const focus = () => { void load(); };
    const handoff = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.leadId === leadId && detail?.claimId === claimId) void load(); };
    window.addEventListener('focus', focus);
    window.addEventListener('cr:firm-handoff', handoff);
    return () => { controller.abort(); window.removeEventListener('focus', focus); window.removeEventListener('cr:firm-handoff', handoff); };
  }, [leadId, claimId, revision, refresh]);
  const changed = (status: string) => { setData((old: any) => old && ({ ...old, status: { key: status } })); setRefresh(n => n + 1); };
  const current = data?.claim_id === claimId ? data : null;
  return <FileHeader name={name} leadNo={leadNo} backHref="/app" intakeAgent={current?.intake_agent || (error ? "Unavailable" : "Checking…")} status={<>{error
    ? <span role="alert">{error} <button type="button" onClick={() => setRefresh(n => n + 1)}>Retry</button></span>
    : current ? <FileStatusControl leadId={leadId} claimId={claimId} current={current.status.key} currentLabel={current.status.label} role={current.role}
      signedDeclineAvailable={current.campaign === 'INNO MVA' && !current.archived_at} onChanged={changed} /> : <span role="status">Checking status…</span>}
    {saveNotice && <span className={saveBad ? 'file-header-save-error' : 'file-header-save'} role={saveBad ? 'alert' : 'status'}>{saveNotice}</span>}</>}>
    <div className="file-header-actions">
      {!error && current && <FileOutcomeActions claimId={claimId} campaign={current.campaign} status={current.status.key} role={current.role} archived={!!current.archived_at} onChanged={changed} />}
      {children}
      {!error && current && <FileArchiveButton leadId={leadId} label={`${name} (${leadNo})`} archivedAt={current.archived_at} allowed={current.can_archive === true} />}
    </div>
  </FileHeader>;
}
