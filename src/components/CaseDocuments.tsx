"use client";
import { useState, useEffect } from "react";

const DOC_TYPES = [{ id: "lor", label: "LOR" }, { id: "retainer", label: "Retainer" }, { id: "records", label: "Records" }, { id: "other", label: "Other" }];

export default function CaseDocuments({ leadId, claimId }: { leadId: string; claimId?: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [docType, setDocType] = useState("lor");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const r = await fetch(`/api/documents?lead=${leadId}`); const d = await r.json(); setDocs(d.docs ?? []); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, [leadId]);

  async function upload(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("lead_id", leadId); if (claimId) fd.append("claim_id", claimId); fd.append("doc_type", docType);
    const r = await fetch("/api/documents", { method: "POST", body: fd });
    if (r.ok) await load();
    setBusy(false);
  }

  return (
    <div>
      <div className="section-title">Documents (LOR, retainer, records)</div>
      <div className="card" style={{ padding: 18, borderStyle: "dashed", textAlign: "center", marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "center", gap: 8, marginBottom: 10 }}>
          {DOC_TYPES.map((t) => <button key={t.id} className={`chip ${docType === t.id ? "active" : ""}`} onClick={() => setDocType(t.id)}>{t.label}</button>)}
        </div>
        <label className="btn" style={{ cursor: "pointer" }}>
          {busy ? "Uploading…" : "Choose file to upload"}
          <input type="file" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={busy} />
        </label>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Stored securely. Visible to both teams on this case.</p>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && docs.length === 0 && <p className="muted">No documents yet.</p>}
      {docs.map((d) => (
        <div key={d.id} className="qcard row" style={{ justifyContent: "space-between" }}>
          <div>
            <span className="badge gold" style={{ marginRight: 8 }}>{d.doc_type}</span>
            <strong style={{ fontSize: 13.5 }}>{d.file_name}</strong>
            <div className="pmeta" style={{ fontSize: 12, color: "var(--ink-soft)" }}>{d.uploaded_by_name} · {new Date(d.created_at).toLocaleString()}</div>
          </div>
          {d.url && <a className="btn ghost sm" href={d.url} target="_blank" rel="noopener noreferrer">Open</a>}
        </div>
      ))}
    </div>
  );
}
