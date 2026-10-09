"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './file-header.css';

/** One header across file tabs, intake layouts and device sizes. Collapse never
 * unmounts a form or discards its draft. Only the UI preference is stored. */
export default function FileHeader({ name, leadNo, backHref, status, intakeAgent, children }: {
  name: string; leadNo?: string; backHref: string; status?: ReactNode; intakeAgent?: string; children?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const id = useId();
  useEffect(() => { try { setCollapsed(sessionStorage.getItem('cr:file-header-collapsed') === '1'); } catch {} }, []);
  function toggle() {
    setCollapsed(old => {
      try { sessionStorage.setItem('cr:file-header-collapsed', old ? '0' : '1'); } catch {}
      return !old;
    });
  }
  return <header className={`file-header${collapsed ? ' file-header-collapsed' : ''}`} aria-label="Client file header">
    <div className="file-header-summary">
      <a className="file-header-back" href={backHref} aria-label="Back to files">←</a>
      <div className="file-header-identity"><strong title={name}>{name || 'Unnamed client'}</strong><span>{leadNo}</span>{intakeAgent && <small className="file-header-agent">Intake agent: {intakeAgent}</small>}</div>
      <button type="button" className="file-header-toggle" aria-expanded={!collapsed} aria-controls={id} onClick={toggle}>{collapsed ? 'Show header' : 'Hide header'} <span aria-hidden="true">{collapsed ? '⌄' : '⌃'}</span></button>
      <div className="file-header-status">{status}</div>
    </div>
    <div id={id} className="file-header-content" hidden={collapsed}>{children}</div>
  </header>;
}

/** Header actions open on demand; no status mutation happens on opening. */
export function FileHeaderDialog({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { if (open && !ref.current?.open) ref.current?.showModal(); }, [open]);
  return <>
    <button type="button" className="cl-btn cl-ghost" onClick={() => setOpen(true)}>{label}</button>
    {open && createPortal(<dialog ref={ref} className="file-header-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)}>
      <div className="file-header-dialog-title"><h2 id={titleId}>{label}</h2><button type="button" className="cl-btn cl-ghost" onClick={() => ref.current?.close()}>Close</button></div>
      {children}
    </dialog>, document.body)}
  </>;
}
