"use client";
import { useState, useEffect, useRef } from "react";

const DOC_TYPES = [{ id: "lor", label: "LOR" }, { id: "retainer", label: "Retainer" }, { id: "records", label: "Records" }, { id: "other", label: "Other" }];

export default function CaseDocuments({ leadId, claimId }: { leadId: string; claimId?: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [docType, setDocType] = useState("lor");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const currentLead = useRef(leadId);
  currentLead.current = leadId;

  async function load() {
    if (currentLead.current !== leadId) return;
    const current = ++generation.current;
    setLoading(true); setLoadError("");
    try {
      const r = await fetch(`/api/documents?lead=${leadId}`); const d = await r.json();
      if (!r.ok || !Array.isArray(d.docs)) throw new Error("load failed");
      if (current === generation.current) setDocs(d.docs);
    } catch { if (current === generation.current) setLoadError("Could not refresh the documents. The list may be out of date. Please retry."); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { setDocs([]); setUploadMessage(""); inFlight.current = false; setBusy(false); load(); return () => { generation.current++; }; }, [leadId]);

  async function upload(file: File) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setUploadMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("lead_id", leadId); if (claimId) fd.append("claim_id", claimId); fd.append("doc_type", docType);
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      const d = await r.json().catch(() => null);
      if (currentLead.current !== leadId) return;
      if (!r.ok || !d?.doc?.id) { setUploadMessage(d?.error || "Could not confirm the upload. Refresh the documents before trying again."); return; }
      setUploadMessage("File uploaded."); await load();
    } catch { if (currentLead.current === leadId) setUploadMessage("Could not confirm the upload. Check the connection and refresh the documents before trying again."); }
    finally { if (currentLead.current === leadId) { inFlight.current = false; setBusy(false); } }
  }

  return (
    <div>
      <div className="section-title">Documents (LOR, retainer, records)</div>
      <div className="card" style={{ padding: 18, borderStyle: "dashed", textAlign: "center", marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "center", gap: 8, marginBottom: 10 }}>
          {DOC_TYPES.map((t) => <button key={t.id} disabled={busy} className={`chip ${docType === t.id ? "active" : ""}`} onClick={() => setDocType(t.id)}>{t.label}</button>)}
        </div>
        <label className="btn" style={{ cursor: "pointer" }}>
          {busy ? "Uploading…" : "Choose file to upload"}
          <input type="file" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload(file); }} disabled={busy} />
        </label>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Stored securely. Visible to both teams on this case.</p>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {uploadMessage && <p role="status">{uploadMessage}</p>}
      {loadError && <p role="alert">{loadError} <button className="btn ghost sm" onClick={load}>Retry loading documents</button></p>}
      {!loading && !loadError && docs.length === 0 && <p className="muted">No documents yet.</p>}
      {docs.map((d) => (
        <div key={d.id} className="qcard row" style={{ justifyContent: "space-between" }}>
          <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
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
