"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { extractNetflyEmail } from "@/lib/netfly-handoff";
import NetflyDeliverySettings, { type NetflyDeliveryConfig } from './NetflyDeliverySettings';
import "./netfly.css";
import "./netfly-home.css";

type FileRow = { intake_agent?: string; id: string; lead_no: string; claimant_name: string; phone: string; created_at: string; missing_source: string[];
  live_call: { by_name: string; expires_at: string } | null; claims?: { answers?: any; firm_sent_at?: string }[] };
export default function NetflyHome() {
  const router = useRouter();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [delivery, setDelivery] = useState<NetflyDeliveryConfig | null>(null);
  const [receiving, setReceiving] = useState<{ configured: boolean; address: string; latest?: { status: string; error?: string; created_at: string }; check_error?: string } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", source_note: "" });
  const editedContacts = useRef(new Set<"name" | "phone" | "email">());
  const extracted = useMemo(() => extractNetflyEmail(form.source_note), [form.source_note]);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'new' | 'followup' | 'sent'>('new');
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<'create' | 'settings' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  async function load() {
    try { const r = await fetch("/api/netfly", { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setFiles(d.files || []); setReceiving(d.receiving || null); setDelivery(d.delivery || null); setLoadError(""); }
    catch (e: any) { setLoadError(e.message || "NETFLY files did not load."); }
    finally { setLoaded(true); }
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 20_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const hash = () => {
      if (window.location.hash === '#firm-delivery') setPanel('settings');
      if (window.location.hash === '#new-file') setPanel('create');
    };
    hash(); window.addEventListener('hashchange', hash);
    return () => window.removeEventListener('hashchange', hash);
  }, []);
  useEffect(() => { if (panel) dialog.current?.showModal(); else dialog.current?.close(); }, [panel]);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create", ...form }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      router.push(`/app/netfly/${d.file.lead_no}`);
    } catch (e: any) { setError(e.message || "Could not create the file."); setBusy(false); }
  }
  function setContact(key: "name" | "phone" | "email", value: string) {
    editedContacts.current.add(key);
    setForm(old => ({ ...old, [key]: value }));
  }
  function setNote(source_note: string) {
    const fields = extractNetflyEmail(source_note).fields;
    setForm(old => ({ ...old, source_note,
      name: editedContacts.current.has("name") ? old.name : fields.confirmed_name || "",
      phone: editedContacts.current.has("phone") ? old.phone : fields.confirmed_phone || "",
      email: editedContacts.current.has("email") ? old.email : fields.confirmed_email || "",
    }));
  }
  const sentFiles = files.filter(row => !!row.claims?.[0]?.firm_sent_at);
  const pending = files.filter(row => !row.claims?.[0]?.firm_sent_at && !row.claims?.[0]?.answers?.netfly_secondary?.call_close);
  const other = files.filter(row => !row.claims?.[0]?.firm_sent_at && !!row.claims?.[0]?.answers?.netfly_secondary?.call_close);
  const rows = (view === 'new' ? pending : view === 'followup' ? other : sentFiles).filter(row =>
    `${row.claimant_name} ${row.phone} ${row.lead_no}`.toLowerCase().includes(search.trim().toLowerCase()));
  const renderRows = (rows: FileRow[]) => rows.map((row) => { const saved = row.claims?.[0]?.answers?.netfly_secondary; const close = saved?.call_close;
    const sentAt = row.claims?.[0]?.firm_sent_at;
    const days = sentAt ? Math.max(0, Math.ceil((Date.parse(sentAt) + 7 * 86400000 - Date.now()) / 86400000)) : 0;
    const label = sentAt ? `Sent to firm · ${new Date(sentAt).toLocaleString()} · ${days ? `${days}d in return window` : 'Return window ended'}` : row.missing_source?.length ? `Partial · needs ${row.missing_source.map(value => value === "handoff_note" ? "handoff note" : "signed PDF").join(" + ")}`
      : saved?.review?.status === "correction_needed" ? "Correction needed" : close?.disposition === "callback_to_finish" || close?.completion === "incomplete" ? "Callback to finish ontake" : close?.disposition === "appears_dq" ? "Appears DQ · supervisor review" : close?.disposition === "client_remorse" ? "Client remorse · supervisor review" : saved?.review?.status === "ready_for_review" ? "Ready for review" : close?.disposition === "appears_qualified" && close?.followup_required ? "Callback needed" : saved?.review?.status === "retainer_reviewed" ? "Retainer reviewed" : "Welcome call needed";
    const action = sentAt ? 'View sent file' : !close ? 'Start welcome call' : close.completion === 'incomplete' ? 'Continue call' : 'Review & send';
    return <Link key={row.id} href={`/app/netfly/${row.lead_no || row.id}`} className="nf-work-row"><span className="nf-work-client"><strong>{row.claimant_name || 'Name missing'}</strong><small>{row.lead_no} · {row.phone || 'Phone needed'}</small><small>Intake agent: {row.intake_agent || 'Not recorded'}</small></span><span className="nf-work-status">{row.live_call && <strong className="nf-work-presence">On phone · {row.live_call.by_name}</strong>}<span>{label}</span>{!sentAt && close?.callback_due_at && <small>Callback {new Date(close.callback_due_at).toLocaleString()}</small>}</span><span className="nf-work-action">{action} <span aria-hidden="true">→</span></span></Link>; });
  return <main className="nf-page nf-home">
    <Link href="/app" className="nf-back">← My desk</Link>
    <header className="nf-home-heading"><div><p>Turnbull, Moak &amp; Pendergrass</p><h1>NETFLY</h1><p>A warm welcome. A clear next step.</p></div><div className="nf-home-tools"><button type="button" className="nf-home-settings" onClick={() => setPanel('settings')}>Settings</button><button type="button" className="nf-primary" onClick={() => setPanel('create')}>+ Add file</button></div></header>
    {receiving && (!receiving.configured || receiving.check_error || (receiving.latest && receiving.latest.status !== 'received')) && <div className="nf-home-import-warning" role="status">Email import needs attention. Existing files are available. <button type="button" onClick={() => setPanel('settings')}>View details</button></div>}
    <section className="nf-home-work" aria-label="NETFLY files"><div className="nf-home-filter"><nav aria-label="File status">{([['new', 'Welcome calls', pending.length], ['followup', 'To finish', other.length], ['sent', 'Sent to firm', sentFiles.length]] as const).map(([key, title, count]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{title}<span>{count}</span></button>)}</nav><input type="search" aria-label="Find a NETFLY file" placeholder="Find a client…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {loadError && <p className="nf-error" role="alert">{loadError} <button type="button" onClick={() => void load()}>Try again</button></p>}
      <div className="nf-work-columns" aria-hidden="true"><span>Client</span><span>Where things stand</span><span>Next step</span></div>
      {!loaded ? <p className="nf-home-empty" role="status">Loading your files…</p> : rows.length ? <div className="nf-work-list">{renderRows(rows)}</div> : <p className="nf-home-empty">{search ? 'No matching files in this view.' : view === 'new' ? 'No welcome calls waiting.' : view === 'followup' ? 'No files waiting to be finished.' : 'Sent packets will appear here.'}</p>}
    </section>
    <footer className="nf-home-foot"><span>{receiving?.configured ? 'Email import connected' : 'Email import setup needed'}</span><button type="button" onClick={() => setPanel('settings')}>Firm delivery: {delivery?.to || 'Setup needed'}</button></footer>
    <dialog ref={dialog} className="nf-home-dialog" aria-labelledby="nf-panel-title" onCancel={() => setPanel(null)} onClose={() => setPanel(null)}><header><h2 id="nf-panel-title">{panel === 'create' ? 'Add a NETFLY file' : 'NETFLY settings'}</h2><button type="button" aria-label="Close panel" onClick={() => setPanel(null)}>Close</button></header>
    {panel === 'settings' && <><section className="nf-home-import" aria-label="Automatic NETFLY email import"><h3>Email import</h3><p>{receiving?.configured ? <>Forward “New Signing” emails to <strong>{receiving.address}</strong>.</> : 'Receiving setup needs owner attention. Use Add file to paste an email.'}</p>{receiving?.latest && <p className="nf-muted">Latest attempt: {new Date(receiving.latest.created_at).toLocaleString()} · {receiving.latest.status === 'received' ? 'Imported' : receiving.latest.error || 'Needs attention'}</p>}{receiving?.check_error && <p role="alert">{receiving.check_error}</p>}</section>{delivery && <NetflyDeliverySettings delivery={delivery} onSaved={setDelivery} />}</>}
    {panel === 'create' && <><p className="nf-muted">Paste the email and we’ll find the details. You can also start with just a name.</p>
      <form onSubmit={create} className="nf-form">
      <label>Paste the NETFLY email<textarea maxLength={20000} disabled={busy} value={form.source_note} onChange={(e) => setNote(e.target.value)} placeholder="Agent notes, Contact Information, Signed Agreement — paste it all here. If it has not arrived, enter the client's name below to start a partial file." /></label>
      {!!extracted.candidates.length && <p className="nf-saved" role="status">{extracted.candidates.length} details found. They will fill the file for you to confirm with the client.</p>}
      {extracted.warnings.map(warning => <p className="nf-alert" key={warning}>{warning}</p>)}
      <label>Client name<input required disabled={busy} value={form.name} onChange={(e) => setContact("name", e.target.value)} /></label>
      <label>Best phone<input type="tel" disabled={busy} value={form.phone} onChange={(e) => setContact("phone", e.target.value)} /></label>
      <label>Email<input type="email" disabled={busy} value={form.email} onChange={(e) => setContact("email", e.target.value)} /></label>
      <p className="nf-muted">The original email stays on the file. Upload the signed PDF there before final review.</p>
      {error && <p className="nf-error" role="alert">{error}</p>}<button className="nf-primary" disabled={busy}>{busy ? "Creating…" : "Create NETFLY file"}</button></form></>}
    </dialog>
  </main>;
}
