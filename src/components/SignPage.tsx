"use client";
import { useEffect, useRef, useState } from "react";

export default function SignPage({ id }: { id: string }) {
  const [doc, setDoc] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    fetch(`/api/signable/submit?id=${id}`).then((r) => r.json()).then((d) => {
      setDoc(d.doc); setName(d.doc?.signer_name || "");
      if (d.doc?.status === "signed") setDone(true);
    }).catch(() => setErr("Could not load document."));
  }, [id]);

  function pos(e: any) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    const t = e.touches?.[0];
    return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top };
  }
  function start(e: any) { drawing.current = true; const c = canvasRef.current!.getContext("2d")!; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e: any) { if (!drawing.current) return; const c = canvasRef.current!.getContext("2d")!; const p = pos(e); c.lineTo(p.x, p.y); c.strokeStyle = "#10243f"; c.lineWidth = 2.5; c.lineCap = "round"; c.stroke(); hasInk.current = true; e.preventDefault(); }
  function end() { drawing.current = false; }
  function clear() { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); hasInk.current = false; }

  async function submit() {
    if (!name.trim()) { setErr("Please type your name."); return; }
    if (!hasInk.current) { setErr("Please draw your signature."); return; }
    setErr("");
    const sig = canvasRef.current!.toDataURL("image/png");
    const r = await fetch("/api/signable/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, signed_name: name, signature_data: sig }) });
    const d = await r.json();
    if (d.ok) setDone(true); else setErr(d.error || "Could not submit.");
  }

  if (err && !doc) return <div className="sign-shell"><p>{err}</p></div>;
  if (!doc) return <div className="sign-shell"><p className="muted">Loading…</p></div>;
  if (done) return <div className="sign-shell"><div className="sign-card"><h2>✓ Signed</h2><p className="muted">Thank you, {name}. Your document has been signed and recorded.</p></div></div>;

  return (
    <div className="sign-shell">
      <div className="sign-card">
        <h2>{doc.title}</h2>
        <div className="sign-body" dangerouslySetInnerHTML={{ __html: (doc.body_html || "").replace(/\n/g, "<br>") }} />
        <div className="sign-field">
          <label>Type your full legal name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="sign-field">
          <label>Draw your signature</label>
          <canvas ref={canvasRef} width={500} height={150} className="sign-canvas"
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
          <button className="btn ghost sm" onClick={clear} type="button">Clear</button>
        </div>
        {err && <p className="save-msg warn">{err}</p>}
        <button className="btn gold" style={{ width: "100%", marginTop: 10 }} onClick={submit}>Sign document</button>
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>By signing, you agree this electronic signature is the legal equivalent of your handwritten signature.</p>
      </div>
    </div>
  );
}
