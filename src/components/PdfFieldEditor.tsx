"use client";
import { useEffect, useRef, useState, useCallback } from "react";

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
  const [pages, setPages] = useState<{ num: number; w: number; h: number; canvas: HTMLCanvasElement }[]>([]);
  const [tool, setTool] = useState<string>("signature");
  const [role, setRole] = useState<Role>("client");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const pageDims = useRef<Record<number, { w: number; h: number }>>({});
  // live drag/resize state
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; pageEl: HTMLElement; orig: PField } | null>(null);

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
        const out: { num: number; w: number; h: number; canvas: HTMLCanvasElement }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.4 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          pageDims.current[i] = { w: viewport.width / 1.4, h: viewport.height / 1.4 }; // store PDF points
          out.push({ num: i, w: viewport.width, h: viewport.height, canvas });
        }
        if (!cancelled) { setPages(out); setLoading(false); }
      } catch (e: any) { if (!cancelled) { setErr(String(e?.message ?? e)); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  // drop a new field where you click on the page
  function onPageMouseDown(e: React.MouseEvent, pageNum: number) {
    // only drop if you clicked empty page area (not an existing field)
    if ((e.target as HTMLElement).closest(".pdf-field")) return;
    const pageEl = e.currentTarget as HTMLElement;
    const rect = pageEl.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const w = tool === "checkbox" ? 4 : tool === "signature" ? 22 : 16;
    const h = tool === "signature" || tool === "initials" ? 7 : tool === "checkbox" ? 3.5 : 5;
    const def = FIELD_TYPES.find((t) => t.key === tool)!;
    const nf: PField = { id: crypto.randomUUID(), type: tool, page: pageNum, xPct: clamp(xPct - w / 2, 0, 100 - w), yPct: clamp(yPct - h / 2, 0, 100 - h), wPct: w, hPct: h, role, label: def.label, required: true };
    setFields((arr) => [...arr, nf]);
    setSelected(nf.id);
  }

  function startDrag(e: React.MouseEvent, f: PField, mode: "move" | "resize") {
    e.stopPropagation();
    const pageEl = (e.currentTarget as HTMLElement).closest(".pdf-page") as HTMLElement;
    drag.current = { id: f.id, mode, startX: e.clientX, startY: e.clientY, pageEl, orig: { ...f } };
    setSelected(f.id);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", endDrag);
  }
  const onDragMove = useCallback((e: MouseEvent) => {
    const dg = drag.current; if (!dg) return;
    const rect = dg.pageEl.getBoundingClientRect();
    const dxPct = ((e.clientX - dg.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - dg.startY) / rect.height) * 100;
    setFields((arr) => arr.map((f) => {
      if (f.id !== dg.id) return f;
      if (dg.mode === "move") {
        return { ...f, xPct: clamp(dg.orig.xPct + dxPct, 0, 100 - f.wPct), yPct: clamp(dg.orig.yPct + dyPct, 0, 100 - f.hPct) };
      } else {
        return { ...f, wPct: clamp(dg.orig.wPct + dxPct, 3, 100 - f.xPct), hPct: clamp(dg.orig.hPct + dyPct, 2.5, 100 - f.yPct) };
      }
    }));
  }, []);
  const endDrag = useCallback(() => {
    drag.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", endDrag);
  }, [onDragMove]);

  function removeField(id: string) { setFields((a) => a.filter((f) => f.id !== id)); setSelected(null); }
  function setFieldRole(id: string, r: Role) { setFields((a) => a.map((f) => f.id === id ? { ...f, role: r } : f)); }

  async function save() {
    setMsg("Saving…");
    const r = await fetch("/api/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_fields", id: templateId, name, fields, page_count: pages.length, page_dims: pageDims.current }) });
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
          <button className={role === "client" ? "on client" : ""} onClick={() => setRole("client")}>👤 Client</button>
          <button className={role === "agent" ? "on agent" : ""} onClick={() => setRole("agent")}>🧑‍💼 Agent</button>
        </div>
        <button className="btn" onClick={save}>Save layout</button>
      </div>

      <div className="pdf-editor-body">
        <div className="pdf-tools">
          <div className="pdf-tools-label">Field to place</div>
          {FIELD_TYPES.map((t) => (
            <button key={t.key} className={`pdf-tool ${tool === t.key ? "on" : ""}`} style={{ ["--fc" as any]: t.color }} onClick={() => setTool(t.key)}>
              <span className="pdf-tool-dot" />{t.label}
            </button>
          ))}
          <div className="pdf-tools-hint">Pick a field type and who fills it, then click on the page to drop it. Drag the box to move it, drag the corner handle to resize. Click a box to change its role or delete it.</div>
          <div className="pdf-legend">
            <span><i className="lg client" /> Client fills/signs</span>
            <span><i className="lg agent" /> Agent fills</span>
          </div>
          <div className="pdf-count muted">{fields.length} field{fields.length === 1 ? "" : "s"} placed</div>
        </div>

        <div className="pdf-canvas-scroll">
          {loading && <p className="muted">Loading PDF…</p>}
          {err && <p className="save-msg warn">{err}</p>}
          <div className="pdf-pages">
            {pages.map((p) => (
              <div key={p.num} className="pdf-page" style={{ width: p.w, height: p.h }}
                onMouseDown={(e) => onPageMouseDown(e, p.num)}
                ref={(el) => { if (el && !el.querySelector("canvas")) el.insertBefore(p.canvas, el.firstChild); }}>
                {fields.filter((f) => f.page === p.num).map((f) => {
                  const sel = selected === f.id;
                  return (
                    <div key={f.id} className={`pdf-field ${f.role} ${sel ? "sel" : ""}`}
                      style={{ left: `${f.xPct}%`, top: `${f.yPct}%`, width: `${f.wPct}%`, height: `${f.hPct}%` }}
                      onMouseDown={(e) => startDrag(e, f, "move")}
                      onClick={(e) => { e.stopPropagation(); setSelected(sel ? null : f.id); }}>
                      <span className="pdf-field-label">{f.label}</span>
                      <span className="pdf-resize" onMouseDown={(e) => startDrag(e, f, "resize")} />
                      {sel && (
                        <div className="pdf-field-menu" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                          <button className={f.role === "client" ? "on" : ""} onClick={() => setFieldRole(f.id, "client")}>Client</button>
                          <button className={f.role === "agent" ? "on" : ""} onClick={() => setFieldRole(f.id, "agent")}>Agent</button>
                          <button className="rm" onClick={() => removeField(f.id)}>Delete</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {msg && <div className="pdf-save-msg">{msg}</div>}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
