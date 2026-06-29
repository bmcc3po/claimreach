"use client";
import { useEffect, useState, useRef } from "react";
import PdfFieldEditor from "./PdfFieldEditor";

// Global retainer hub: text templates (edited on a full page) AND uploaded PDF
// templates with field placement. No popups.
export default function RetainerTemplatesManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [pdfs, setPdfs] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [editPdf, setEditPdf] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try { const d = await (await fetch("/api/retainer-templates")).json(); setTemplates(d.templates ?? []); } catch {}
    try { const d = await (await fetch("/api/pdf-templates")).json(); setPdfs(d.templates ?? []); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function delText(id: string) {
    if (!confirm("Delete this retainer template?")) return;
    await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "delete_template", id }) });
    load();
  }
  async function uploadPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setMsg("Uploading PDF…");
    const fd = new FormData(); fd.append("file", file); fd.append("name", file.name.replace(/\.pdf$/i, ""));
    const r = await fetch("/api/pdf-templates", { method: "POST", body: fd });
    const d = await r.json();
    if (d.ok) { setMsg("Uploaded. Now place the signature and date fields."); await load(); setEditPdf({ id: d.id, name: file.name.replace(/\.pdf$/i, ""), fields: [] }); }
    else setMsg(d.error || "Upload failed");
  }
  async function delPdf(id: string) {
    if (!confirm("Delete this PDF template?")) return;
    await fetch("/api/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "delete", id }) });
    load();
  }

  // PDF field editor opens inline (full width), not a popup.
  if (editPdf) {
    return <PdfFieldEditor templateId={editPdf.id} initialName={editPdf.name} initialFields={editPdf.fields} onClose={() => { setEditPdf(null); load(); }} />;
  }

  return (
    <div>
      {/* Text retainers */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Retainer templates</h2>
          <p className="muted" style={{ marginTop: 0 }}>Create reusable retainers (AI-assisted), bind each to a case type, and mark one default per type. On a file, the matching default pre-selects automatically.</p>
        </div>
        <a className="btn" href="/templates/retainer/new">+ New retainer</a>
      </div>
      {msg && <p className="muted" style={{ marginTop: 6 }}>{msg}</p>}

      <table className="docket" style={{ marginTop: 12 }}>
        <thead><tr><th>Name</th><th>Case type</th><th>Default</th><th></th></tr></thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <td style={{ fontWeight: 600 }}>{t.name}</td>
              <td>{t.case_type || "any"}</td>
              <td>{t.is_default ? <span className="badge count">default</span> : "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <a className="btn ghost sm" href={`/templates/retainer/${t.id}`}>Edit</a>
                <button className="btn ghost sm danger" onClick={() => delText(t.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {templates.length === 0 && <tr><td colSpan={4} className="muted">No retainer templates yet. Create one, or let AI draft it.</td></tr>}
        </tbody>
      </table>

      {/* PDF retainers */}
      <div className="section-title" style={{ marginTop: 28 }}>PDF retainers (upload + place fields)</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Upload your firm's real retainer PDF, then place signature, date, and text boxes and assign each to the client or agent. Used for in-house or certified signing on a file.</p>
      <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={uploadPdf} />
      <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Upload PDF</button>

      <table className="docket" style={{ marginTop: 12 }}>
        <thead><tr><th>Name</th><th>Fields</th><th>Pages</th><th></th></tr></thead>
        <tbody>
          {pdfs.map((p) => (
            <tr key={p.id}>
              <td style={{ fontWeight: 600 }}>{p.name}</td>
              <td>{(p.fields?.length ?? 0)} fields</td>
              <td>{p.page_count ?? "—"} pages</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => setEditPdf({ id: p.id, name: p.name, fields: p.fields || [] })}>Edit fields</button>
                <button className="btn ghost sm danger" onClick={() => delPdf(p.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {pdfs.length === 0 && <tr><td colSpan={4} className="muted">No PDF retainers uploaded yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
