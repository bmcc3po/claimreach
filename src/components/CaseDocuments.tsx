"use client";
import { useState, useEffect, useRef } from "react";

const DOC_TYPES = [{ id: "lor", label: "LOR" }, { id: "retainer", label: "Retainer" }, { id: "records", label: "Records" }, { id: "other", label: "Other" }];

export default function CaseDocuments({ leadId, claimId }: { leadId: string; claimId?: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [docType, setDocType] = useState("lor");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loadedScope, setLoadedScope] = useState("");
  const currentScope = useRef("");
  currentScope.current = `${leadId}/${claimId ?? ""}`;
  const scopeMatches = loadedScope === currentScope.current;

  useEffect(() => {
    const controller = new AbortController();
    const requestedScope = `${leadId}/${claimId ?? ""}`;
    setLoading(true); setDocs([]); setError("");
    const params = new URLSearchParams({ lead: leadId });
    if (claimId) params.set("claim", claimId);
    (async () => {
      try {
        const r = await fetch(`/api/documents?${params}`, { signal: controller.signal, cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load documents.");
        if (!controller.signal.aborted) setDocs(d.docs ?? []);
      } catch (e: any) {
        if (!controller.signal.aborted) setError(e.message || "Could not load documents.");
      } finally { if (!controller.signal.aborted) { setLoadedScope(requestedScope); setLoading(false); } }
    })();
    return () => controller.abort();
  }, [leadId, claimId, refresh]);

  async function upload(file: File) {
    setBusy(true); setError("");
    const startedScope = currentScope.current;
    const fd = new FormData();
    fd.append("file", file); fd.append("lead_id", leadId); if (claimId) fd.append("claim_id", claimId); fd.append("doc_type", docType);
    try {
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Upload failed. Try again.");
      if (currentScope.current === startedScope) setRefresh(n => n + 1);
    } catch (e: any) {
      if (currentScope.current === startedScope) setError(e.message || "Upload failed. Try again.");
    } finally { setBusy(false); }
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

      {(!scopeMatches || loading) && <p className="muted">Loading…</p>}
      {scopeMatches && error && <p role="alert">{error} <button className="btn ghost sm" onClick={() => setRefresh(n => n + 1)}>Reload documents</button></p>}
      {scopeMatches && !loading && !error && docs.length === 0 && <p className="muted">No documents yet.</p>}
      {(scopeMatches ? docs : []).map((d) => (
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
