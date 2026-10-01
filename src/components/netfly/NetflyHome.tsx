"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./netfly.css";

type FileRow = { id: string; lead_no: string; claimant_name: string; phone: string; created_at: string; missing_source: string[];
  live_call: { by_name: string; expires_at: string } | null; claims?: { answers?: any }[] };
export default function NetflyHome() {
  const router = useRouter();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", source_note: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try { const r = await fetch("/api/netfly", { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setFiles(d.files || []); setError(""); }
    catch (e: any) { setError(e.message || "NETFLY files did not load."); }
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 20_000); return () => window.clearInterval(timer); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create", ...form }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      router.push(`/app/netfly/${d.file.lead_no}`);
    } catch (e: any) { setError(e.message || "Could not create the file."); setBusy(false); }
  }
  const set = (key: keyof typeof form, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const pending = files.filter(row => !row.claims?.[0]?.answers?.netfly_secondary?.call_close);
  const other = files.filter(row => !!row.claims?.[0]?.answers?.netfly_secondary?.call_close);
  const renderRows = (rows: FileRow[]) => rows.map((row) => { const saved = row.claims?.[0]?.answers?.netfly_secondary; const close = saved?.call_close;
    const label = row.missing_source?.length ? `Partial · needs ${row.missing_source.map(value => value === "handoff_note" ? "handoff note" : "signed PDF").join(" + ")}`
      : saved?.review?.status === "correction_needed" ? "Correction needed" : close?.disposition === "callback_to_finish" || close?.completion === "incomplete" ? "Callback to finish ontake" : close?.disposition === "appears_dq" ? "Appears DQ · supervisor review" : close?.disposition === "client_remorse" ? "Client remorse · supervisor review" : saved?.review?.status === "ready_for_review" ? "Ready for review" : close?.disposition === "appears_qualified" && close?.followup_required ? "Case-manager follow-up needed" : saved?.review?.status === "retainer_reviewed" ? "Retainer reviewed" : "Welcome call needed";
    return <Link key={row.id} href={`/app/netfly/${row.lead_no || row.id}`} className={`nf-list-row${row.missing_source?.length ? " nf-partial-row" : ""}`}><span><strong>{row.claimant_name || "Name missing"}</strong><small>{row.lead_no} · {row.phone || "Phone added at live transfer"}</small></span><span className="nf-list-right">{row.live_call && <b className="nf-on-phone">On phone · {row.live_call.by_name}</b>}<span>{label} →</span></span></Link>; });
  return <main className="nf-page">
    <div className="nf-head"><div><Link href="/app" className="nf-back">← Desk</Link><p className="nf-eyebrow">Turnbull, Moak &amp; Pendergrass</p><h1>NETFLY ONTAKE</h1><p>Already signed. Welcome the client, verify NETFLY's handoff, and handle what changed.</p></div></div>
    <div className="nf-columns"><section className="nf-panel"><h2>Receive a signed transfer</h2><p className="nf-muted">Enter the callback details and paste NETFLY's existing intake note. The original signed PDF is uploaded on the file after creation.</p>
      <form onSubmit={create} className="nf-form"><label>Client name<input required value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label>Best phone<input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
      <label>Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
      <label>NETFLY's intake note<textarea value={form.source_note} onChange={(e) => set("source_note", e.target.value)} placeholder="Paste the handoff exactly as received. You can add it to the file later if it has not arrived yet." /></label>
      {error && <p className="nf-error" role="alert">{error}</p>}<button className="nf-primary" disabled={busy}>{busy ? "Creating…" : "Open signed transfer file"}</button></form></section>
      <section className="nf-panel"><h2>NETFLY files <small>{files.length}</small></h2><p className="nf-muted">Each file keeps its own intake and original signed-retainer evidence.</p>
      <div className="nf-list"><h3 className="nf-list-heading">New NETFLY · welcome call needed <span>{pending.length}</span></h3>{renderRows(pending)}<h3 className="nf-list-heading">Follow-up and reviewed <span>{other.length}</span></h3>{renderRows(other)}{files.length === 0 && <p className="nf-muted">No NETFLY files yet.</p>}</div></section></div>
  </main>;
}
