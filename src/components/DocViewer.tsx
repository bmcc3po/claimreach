"use client";
import { useEffect, useRef, useState } from "react";

declare global { interface Window { pdfjsLib: any; } }

// Renders EVERY page of the PDF as a scrollable stack (reliable on mobile, unlike
// an iframe that often shows page 1 only), and overlays the client's autofill
// values on their fields so they can confirm the data is right before signing.
export default function DocViewer({ url, fields, values, spotsOnly = false }: {
  url: string; fields: any[]; values: Record<string, string>; spotsOnly?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [spotIdx, setSpotIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.pdfjsLib) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            s.onload = () => res(); s.onerror = () => rej(new Error("pdf load failed"));
            document.body.appendChild(s);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const pdf = await window.pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        const host = hostRef.current!; host.innerHTML = "";
        const hostWidth = host.clientWidth || 340;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = hostWidth / base.width;
          const vp = page.getViewport({ scale });
          const wrap = document.createElement("div");
          wrap.style.cssText = `position:relative;margin:0 auto 10px;width:${vp.width}px;height:${vp.height}px;box-shadow:0 1px 6px rgba(0,0,0,.12);background:#fff`;
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height; canvas.style.display = "block";
          wrap.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
          // Overlay the client's autofill values on this page's mapped text fields.
          for (const f of fields || []) {
            if (f.page !== n) continue;

            const isSig = f.type === "signature" || f.type === "sign" || f.type === "initial";
            if (isSig) {
              const box = document.createElement("div");
              box.className = "dv-spot";
              box.setAttribute("data-spot", "1");
              box.style.left = `${(f.x ?? 0) * scale}px`;
              box.style.top = `${(f.y ?? 0) * scale}px`;
              box.style.width = `${(f.w ?? 120) * scale}px`;
              box.style.height = `${(f.h ?? 28) * scale}px`;
              box.innerHTML = '<span>Your signature goes here</span>';
              wrap.appendChild(box);
              continue;
            }

            if (spotsOnly) continue;
            if (f.type !== "text" || !f.mapTo) continue;
            const val = values[f.mapTo];
            if (!val) continue;
            const box = document.createElement("div");
            box.textContent = val;
            box.style.cssText = `position:absolute;left:${f.xPct}%;top:${f.yPct}%;width:${f.wPct}%;height:${f.hPct}%;display:flex;align-items:center;font-size:12px;color:#1d4ed8;font-weight:600;background:rgba(219,234,254,.6);border-radius:3px;padding:0 3px;box-sizing:border-box;overflow:hidden`;
            wrap.appendChild(box);
          }
          host.appendChild(wrap);
        }
        setReady(true);
      } catch (e: any) { setErr("Could not display the document. You can still sign; your data is shown above."); }
    })();
    return () => { cancelled = true; };
  }, [url, spotsOnly]);

  // Walk the caller through each place their name lands, one tap at a time.
  function jump(dir: 1 | -1) {
    const spots = Array.from(hostRef.current?.querySelectorAll("[data-spot]") ?? []);
    if (!spots.length) return;
    const next = Math.max(0, Math.min(spots.length - 1, spotIdx + dir));
    setSpotIdx(next);
    (spots[next] as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
    spots.forEach((el, i) => (el as HTMLElement).classList.toggle("on", i === next));
  }

  return (
    <div>
      {!ready && !err && <p className="es-muted" style={{ fontSize: 13 }}>Loading your document…</p>}
      {err && <p className="es-muted" style={{ fontSize: 13 }}>{err}</p>}
      {spotsOnly && ready && (
        <div className="dv-nav">
          <button onClick={() => jump(-1)}>← Previous spot</button>
          <button onClick={() => jump(1)}>Next spot →</button>
        </div>
      )}
      <div ref={hostRef} />
      <style>{`
        .dv-spot { position:absolute; border:2px dashed #d97706; background:rgba(251,191,36,.16);
          border-radius:4px; display:flex; align-items:center; justify-content:center; pointer-events:none; }
        .dv-spot span { font-size:10px; font-weight:800; color:#92400e; text-transform:uppercase;
          letter-spacing:.04em; white-space:nowrap; }
        .dv-spot.on { border-color:#2563eb; background:rgba(37,99,235,.18); box-shadow:0 0 0 4px rgba(37,99,235,.15); }
        .dv-spot.on span { color:#1d4ed8; }
        .dv-nav { display:flex; gap:8px; margin:0 0 10px; position:sticky; top:0; z-index:5; }
        .dv-nav button { flex:1; padding:12px; font:inherit; font-size:15px; font-weight:700;
          border:1.5px solid var(--line, #d7dee7); border-radius:10px; background:#fff; cursor:pointer; }
      `}</style>
    </div>
  );
}
