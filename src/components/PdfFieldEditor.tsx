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
interface PField { id: string; type: string; page: number; xPct: number; yPct: number; wPct: number; hPct: number; role: Role; label?: string; required?: boolean; mapTo?: string; }

declare global { interface Window { pdfjsLib: any; } }

export default function PdfFieldEditor({ templateId, initialName, initialFields, initialCampaignId, initialCaseType, onClose }: { templateId: string; initialName?: string; initialFields?: PField[]; initialCampaignId?: string; initialCaseType?: string; onClose: () => void }) {
  const [name, setName] = useState(initialName || "Retainer PDF");
  const [fields, setFields] = useState<PField[]>(initialFields || []);
  const [pages, setPages] = useState<{ num: number; w: number; h: number; canvas: HTMLCanvasElement }[]>([]);
  const [tool, setTool] = useState<string>("signature");
  const [role, setRole] = useState<Role>("client");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignId, setCampaignId] = useState(initialCampaignId || "");
  const [bindCaseType, setBindCaseType] = useState(initialCaseType || "any");
  const [catalog, setCatalog] = useState<{ group: string; token: string; label: string }[]>([]);
  useEffect(() => {
    const qs = campaignId ? `campaign_id=${campaignId}` : (bindCaseType && bindCaseType !== "any" ? `case_type=${bindCaseType}` : "");
    (async () => {
      try { const d = await (await fetch(`/api/autofill-catalog${qs ? "?" + qs : ""}`)).json(); setCatalog(d.catalog ?? []); } catch { setCatalog([]); }
    })();
  }, [campaignId, bindCaseType]);
  // When a campaign is chosen, reflect its case type in the dropdown so the binding
  // is visible and intake questions load without a separate step.
  useEffect(() => {
    if (!campaignId) return;
    const c = campaigns.find((x: any) => x.id === campaignId);
    const ct = (c?.case_type || c?.intake_template || "").toLowerCase();
    if (ct && ct !== bindCaseType) setBindCaseType(ct);
  }, [campaignId, campaigns]);
  useEffect(() => { (async () => { try { const d = await (await fetch("/api/campaigns")).json(); setCampaigns((d.campaigns ?? []).filter((c: any) => c.active)); } catch {} })(); }, []);
  const pageDims = useRef<Record<number, { w: number; h: number }>>({});
  const pageText = useRef<Record<number, { s: string; xPct: number; yPct: number }[]>>({});
  // live drag/resize state
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; pageEl: HTMLElement; orig: PField; moved: boolean } | null>(null);

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
          // Capture text items with page-relative percentage positions for AI placement.
          try {
            const tc = await page.getTextContent();
            const vw = viewport.width, vh = viewport.height;
            pageText.current[i] = tc.items.map((it: any) => {
              const tx = it.transform; // [a,b,c,d,e,f] -> e,f are x,y from bottom-left at scale 1.4
              const xPct = (tx[4] / vw) * 100;
              const yPct = ((vh - tx[5]) / vh) * 100; // convert to top-left origin %
              return { s: (it.str || "").trim(), xPct: Math.round(xPct * 10) / 10, yPct: Math.round(yPct * 10) / 10 };
            }).filter((t: any) => t.s);
          } catch {}
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
    drag.current = { id: f.id, mode, startX: e.clientX, startY: e.clientY, pageEl, orig: { ...f }, moved: false };
    setSelected(f.id);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", endDrag);
  }
  const onDragMove = useCallback((e: MouseEvent) => {
    const dg = drag.current; if (!dg) return;
    const rect = dg.pageEl.getBoundingClientRect();
    const dxPct = ((e.clientX - dg.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - dg.startY) / rect.height) * 100;
    // Only count as a real move past a small threshold so a click that nudges a
    // pixel still selects (and keeps the menu open) instead of being a drag.
    if (Math.abs(e.clientX - dg.startX) > 3 || Math.abs(e.clientY - dg.startY) > 3) dg.moved = true;
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
    // Selection already set on mousedown; keep it whether or not it moved so the
    // Client/Agent/Delete menu stays open after dragging.
    drag.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", endDrag);
  }, [onDragMove]);

  function removeField(id: string) { setFields((a) => a.filter((f) => f.id !== id)); setSelected(null); }
  function setFieldRole(id: string, r: Role) { setFields((a) => a.map((f) => f.id === id ? { ...f, role: r } : f)); }
  function setFieldMap(id: string, mapTo: string) { setFields((a) => a.map((f) => f.id === id ? { ...f, mapTo: mapTo || undefined } : f)); }

  const [aiBusy, setAiBusy] = useState(false);
  async function aiPlace() {
    setAiBusy(true); setMsg("AI is reading the document and placing fields…");
    try {
      // Send each page's text (with positions) so the AI can locate signature
      // lines, date blanks, and name blanks.
      const pagesText = Object.entries(pageText.current).map(([num, items]) => ({ page: Number(num), items }));
      const r = await fetch("/api/pdf-templates/ai-place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages: pagesText }) });
      const d = await r.json();
      if (d.fields && d.fields.length) {
        const placed: PField[] = d.fields.map((f: any) => {
          // Snap the AI's rough guess to the nearest real text line on that page,
          // so fields land ON the signature/date/name lines, not floating at the
          // bottom. The AI returns a label hint; match it to the closest line by
          // text similarity first, then by its y guess.
          const lines = pageText.current[f.page || 1] || [];
          let snapX = f.xPct ?? 10, snapY = f.yPct ?? 10;
          if (lines.length) {
            const hint = String(f.label || f.mapTo || f.type || "").toLowerCase();
            const key = hint.includes("sign") ? "sign" : hint.includes("date") ? "date"
              : hint.includes("name") ? "name" : hint.includes("address") ? "address" : "";
            // Candidate lines that mention the key, else all lines.
            const cands = key ? lines.filter((l) => l.s.toLowerCase().includes(key)) : [];
            const pool = cands.length ? cands : lines;
            // Of the pool, pick the line closest to the AI's y guess.
            let best = pool[0], bestD = Infinity;
            for (const l of pool) { const dd = Math.abs(l.yPct - (f.yPct ?? 50)); if (dd < bestD) { bestD = dd; best = l; } }
            if (best) {
              // Place just to the RIGHT of the label text, vertically aligned.
              snapX = clamp(best.xPct + 12, 2, 80);
              snapY = clamp(best.yPct - 1, 0, 96);
            }
          }
          return {
            id: crypto.randomUUID(), type: f.type || "text", page: f.page || 1,
            xPct: clamp(snapX, 0, 95), yPct: clamp(snapY, 0, 97),
            wPct: f.type === "signature" ? 22 : f.type === "checkbox" ? 4 : 16,
            hPct: f.type === "signature" || f.type === "initials" ? 7 : f.type === "checkbox" ? 3.5 : 5,
            role: f.role === "agent" ? "agent" : "client", label: f.label || f.type, mapTo: f.mapTo || undefined, required: true,
          };
        });
        setFields((a) => [...a, ...placed]);
        setMsg(`AI placed ${placed.length} fields, snapped to the document lines. Review and nudge any that are off.`);
      } else setMsg(d.error || "AI could not find clear field locations. Place them manually.");
    } catch { setMsg("AI placement failed. Place fields manually."); }
    finally { setAiBusy(false); }
  }

  async function save() {
    setMsg("Saving…");
    const r = await fetch("/api/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_fields", id: templateId, name, fields, page_count: pages.length, page_dims: pageDims.current, campaign_id: campaignId || null, case_type: bindCaseType }) });
    const d = await r.json();
    setMsg(d.ok ? "Saved." : (d.error || "Save failed"));
  }

  return (
    <div className="pdf-editor">
      <div className="pdf-editor-bar">
        <button className="btn ghost sm" onClick={onClose}>← Back</button>
        <input className="pdf-name" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={{ width: "auto" }} title="Show on files for this campaign">
          <option value="">Any campaign</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={bindCaseType} onChange={(e) => setBindCaseType(e.target.value)} style={{ width: "auto" }} title="Bind to case type">
          {["any", "motel_trafficking", "bard_powerport", "pfas", "medmal", "mva"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="spacer" />
        <div className="pdf-role-toggle">
          <button className={role === "client" ? "on client" : ""} onClick={() => setRole("client")}>👤 Client</button>
          <button className={role === "agent" ? "on agent" : ""} onClick={() => setRole("agent")}>🧑‍💼 Agent</button>
        </div>
        <button className="btn ghost" onClick={aiPlace} disabled={aiBusy}>{aiBusy ? "AI placing…" : "✨ AI place fields"}</button>
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
          <div className="pdf-tools-hint">Pick a field type and who fills it, then click on the page to drop it. Drag to move, corner handle to resize. Click a box to select it.</div>

          <div className="pdf-autofill-panel">
            <div className="pdf-tools-label">Autofill fields{catalog.length > 0 ? ` (${catalog.length})` : ""}</div>
            {(() => {
              const selField = fields.find((f) => f.id === selected);
              const isTextSel = selField && selField.type === "text";
              return (
                <>
                  <div className="pdf-autofill-hint">
                    {isTextSel
                      ? "Click a field below to autofill the selected Text box with it."
                      : "These are available to autofill. Drop a Text box and click it, then pick one of these."}
                  </div>
                  {catalog.filter((c) => c.group === "Intake questions").length === 0 && (
                    <div className="pdf-autofill-group">
                      <div className="pdf-autofill-grouplabel">Intake questions</div>
                      <div className="muted" style={{ fontSize: 12, lineHeight: 1.45, padding: "2px 0" }}>
                        {bindCaseType === "any"
                          ? "Set the case type at the top of the page (it's on \"any\") to load this case's intake questions here."
                          : `No intake questions found for "${bindCaseType}".`}
                      </div>
                    </div>
                  )}
                  <div className="pdf-autofill-scroll">
                  {["Client", "Case", "Intake questions", "Other"].map((grp) => {
                    const opts = catalog.filter((c) => c.group === grp);
                    if (opts.length === 0) return null;
                    return (
                      <div key={grp} className="pdf-autofill-group">
                        <div className="pdf-autofill-grouplabel">{grp}</div>
                        <div className="pdf-autofill-chips">
                          {opts.map((c) => (
                            <button key={c.token}
                              className={`pdf-autofill-chip ${isTextSel && selField!.mapTo === c.token ? "on" : ""}`}
                              disabled={!isTextSel}
                              title={isTextSel ? `Autofill selected box with ${c.label}` : "Select a Text box first"}
                              onClick={() => isTextSel && setFieldMap(selField!.id, c.token)}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                  {isTextSel && selField!.mapTo && (
                    <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setFieldMap(selField!.id, "")}>Clear autofill on this box</button>
                  )}
                </>
              );
            })()}
          </div>

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
                      onClick={(e) => e.stopPropagation()}>
                      <span className="pdf-field-label">{f.label}</span>
                      <span className="pdf-resize" onMouseDown={(e) => startDrag(e, f, "resize")} />
                      {sel && (
                        <div className="pdf-field-menu" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                          <button className={f.role === "client" ? "on" : ""} onClick={() => setFieldRole(f.id, "client")}>Client</button>
                          <button className={f.role === "agent" ? "on" : ""} onClick={() => setFieldRole(f.id, "agent")}>Agent</button>
                          {f.type === "text" && (
                            <select className="pdf-mapto" value={f.mapTo || ""} onChange={(e) => setFieldMap(f.id, e.target.value)} onMouseDown={(e) => e.stopPropagation()}>
                              <option value="">Autofill: none</option>
                              {["Client", "Case", "Intake questions", "Other"].map((grp) => {
                                const opts = catalog.filter((c) => c.group === grp);
                                if (opts.length === 0) return null;
                                return <optgroup key={grp} label={grp}>{opts.map((c) => <option key={c.token} value={c.token}>{c.label}</option>)}</optgroup>;
                              })}
                            </select>
                          )}
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
