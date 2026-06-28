"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// Field types we expose, mapped to SignWell field types at send time.
const FIELD_TYPES = [
  { key: "signature", label: "Signature", color: "#2f6df6" },
  { key: "initials", label: "Initials", color: "#7c4dff" },
  { key: "date", label: "Date", color: "#1f9d68" },
  { key: "text", label: "Text", color: "#d9982a" },
  { key: "checkbox", label: "Checkbox", color: "#e0533d" },
];
type Role = "client" | "agent";
interface PField { id: string; type: string; page: number; xPct: number; yPct: number; wPct: number; hPct: number; role: Role; label?: string; required?: boolean; }

declare global { interface Window { pdfjsLib: any; } }

export default function PdfFieldEditor({ templateId, initialName, initialFields, onClose }: { templateId: string; initialName?: string; initialFields?: PField[]; onClose: () => void }) {
  const [name, setName] = useState(initialName || "Retainer PDF");
  const [fields, setFields] = useState<PField[]>(initialFields || []);
  const [pageCount, setPageCount] = useState(1);
  const [tool, setTool] = useState<string>("signature");
  const [role, setRole] = useState<Role>("client");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const pagesWrap = useRef<HTMLDivElement>(null);
  const pageDims = useRef<Record<number, { w: number; h: number }>>({});

  // load pdf.js from CDN, fetch the signed PDF url, render pages to canvas
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.pdfjsLib) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            s.onload = () => res(); s.onerror = () => rej(new Error("pdf.js failed to load"));
            document.body.appendChild(s);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const r = await fetch("/api/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "signed_url", id: templateId }) });
        const d = await r.json();
        if (!d.url) throw new Error("Could not load the PDF.");
        const pdf = await window.pdfjsLib.getDocument(d.url).promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);
        const wrap = pagesWrap.current!; wrap.innerHTML = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.4 });
          const holder = document.createElement("div");
          holder.className = "pdf-page-holder"; holder.dataset.page = String(i);
          holder.style.width = `${viewport.width}px`; holder.style.height = `${viewport.height}px`;
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width; canvas.height = viewport.height;
          holder.appendChild(canvas); wrap.appendChild(holder);
          pageDims.current[i] = { w: viewport.width, h: viewport.height };
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        }
        setLoading(false);
      } catch (e: any) { if (!cancelled) { setErr(String(e?.message ?? e)); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  // click on a page to drop a field
  const onPageClick = useCallback((e: React.MouseEvent, page: number) => {
    if (selected) { setSelected(null); return; }
    const holder = (e.currentTarget as HTMLElement);
    const rect = holder.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const def = FIELD_TYPES.find((t) => t.key === tool)!;
    const w = tool === "checkbox" ? 4 : tool === "signature" ? 22 : 16;
    const h = tool === "signature" || tool === "initials" ? 7 : tool === "checkbox" ? 3.5 : 4.5;
    const nf: PField = { id: crypto.randomUUID(), type: tool, page, xPct: Math.max(0, xPct - w / 2), yPct: Math.max(0, yPct - h / 2), wPct: w, hPct: h, role, label: def.label, required: true };
    setFields((arr) => [...arr, nf]);
  }, [tool, role, selected]);

  function removeField(id: string) { setFields((a) => a.filter((f) => f.id !== id)); setSelected(null); }
  function setFieldRole(id: string, r: Role) { setFields((a) => a.map((f) => f.id === id ? { ...f, role: r } : f)); }

  async function save() {
    setMsg("Saving…");
    // capture page dimensions in PDF points (canvas was rendered at scale 1.4)
    const dims: Record<number, { w: number; h: number }> = {};
    for (const [p, d] of Object.entries(pageDims.current)) dims[Number(p)] = { w: d.w / 1.4, h: d.h / 1.4 };
    const r = await fetch("/api/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_fields", id: templateId, name, fields, page_count: pageCount, page_dims: dims }) });
    const d = await r.json();
    setMsg(d.ok ? "Saved." : (d.error || "Save failed"));
  }

  return (
    <div className="pdf-editor">
      <div className="pdf-editor-bar">
        <button className="btn ghost sm" onClick={onClose}>← Back</button>
        <input className="pdf-name" value={name} onChange={(e) => setName(e.target.value)} />
        <span className="spacer" />
        <div className="pdf-role-toggle">
          <button className={role === "client" ? "on client" : ""} onClick={() => setRole("client")}>👤 Client fills/signs</button>
          <button className={role === "agent" ? "on agent" : ""} onClick={() => setRole("agent")}>🧑‍💼 Agent fills</button>
        </div>
        <button className="btn" onClick={save}>Save layout</button>
      </div>

      <div className="pdf-editor-body">
        <div className="pdf-tools">
          <div className="pdf-tools-label">Drop a field</div>
          {FIELD_TYPES.map((t) => (
            <button key={t.key} className={`pdf-tool ${tool === t.key ? "on" : ""}`} style={{ ["--fc" as any]: t.color }} onClick={() => setTool(t.key)}>
              <span className="pdf-tool-dot" />{t.label}
            </button>
          ))}
          <div className="pdf-tools-hint">Pick a field + a role, then click on the page to place it. Click a placed field to assign or remove it.</div>
          <div className="pdf-legend">
            <span><i className="lg client" /> Client</span>
            <span><i className="lg agent" /> Agent</span>
          </div>
        </div>

        <div className="pdf-canvas-scroll">
          {loading && <p className="muted">Loading PDF…</p>}
          {err && <p className="save-msg warn">{err}</p>}
          <div ref={pagesWrap} className="pdf-pages" onClick={(e) => {
            const holder = (e.target as HTMLElement).closest(".pdf-page-holder") as HTMLElement | null;
            if (holder && (e.target as HTMLElement).classList.contains("pdf-page-holder") === false && (e.target as HTMLElement).tagName === "CANVAS") {
              onPageClick(e as any, parseInt(holder.dataset.page || "1", 10));
            } else if (holder && (e.target as HTMLElement) === holder) {
              onPageClick(e as any, parseInt(holder.dataset.page || "1", 10));
            }
          }} />
          {/* field overlays, positioned per page */}
          <FieldOverlays fields={fields} pagesWrap={pagesWrap} selected={selected} onSelect={setSelected} onRole={setFieldRole} onRemove={removeField} ready={!loading} />
        </div>
      </div>
      {msg && <div className="pdf-save-msg">{msg}</div>}
    </div>
  );
}

// Renders field boxes absolutely over the rendered pages.
function FieldOverlays({ fields, pagesWrap, selected, onSelect, onRole, onRemove, ready }: any) {
  const [, force] = useState(0);
  useEffect(() => { if (ready) force((n) => n + 1); }, [ready, fields.length]);
  if (!ready || !pagesWrap.current) return null;
  const holders = Array.from(pagesWrap.current.querySelectorAll(".pdf-page-holder")) as HTMLElement[];
  const wrapRect = pagesWrap.current.getBoundingClientRect();
  return (
    <>
      {fields.map((f: PField) => {
        const holder = holders[f.page - 1]; if (!holder) return null;
        const hr = holder.getBoundingClientRect();
        const top = hr.top - wrapRect.top + (f.yPct / 100) * hr.height;
        const left = hr.left - wrapRect.left + (f.xPct / 100) * hr.width;
        const w = (f.wPct / 100) * hr.width; const h = (f.hPct / 100) * hr.height;
        const sel = selected === f.id;
        return (
          <div key={f.id} className={`pdf-field ${f.role} ${sel ? "sel" : ""}`} style={{ top, left, width: w, height: h }}
            onClick={(e) => { e.stopPropagation(); onSelect(sel ? null : f.id); }}>
            <span className="pdf-field-label">{f.label}</span>
            {sel && (
              <div className="pdf-field-menu" onClick={(e) => e.stopPropagation()}>
                <button className={f.role === "client" ? "on" : ""} onClick={() => onRole(f.id, "client")}>Client</button>
                <button className={f.role === "agent" ? "on" : ""} onClick={() => onRole(f.id, "agent")}>Agent</button>
                <button className="rm" onClick={() => onRemove(f.id)}>✕</button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
