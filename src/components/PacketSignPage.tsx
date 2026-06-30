"use client";
import { useState, useEffect, useRef } from "react";

// The 5-tap client ceremony for a whole packet (retainer + HIPAA + HITECH):
// 1) tap link (arrive)  2) Get Started  3) draw signature  4) Insert Everywhere
// 5) I Agree & Submit. One signature applies across every doc in the packet.
export default function PacketSignPage({ group }: { group: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [signerName, setSignerName] = useState("");
  const [step, setStep] = useState<"start" | "review" | "sign" | "done">("start");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [inserted, setInserted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await (await fetch(`/api/signable/packet?group=${group}`)).json();
        if (d.error) { setErr("This signing link is invalid or expired."); return; }
        setDocs(d.docs || []); setSignerName(d.signer_name || "");
      } catch { setErr("Could not load your documents."); }
    })();
  }, [group]);

  async function markViewed() {
    try { await fetch("/api/signable/packet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "viewed", group }) }); } catch {}
  }

  // --- signature canvas ---
  function pos(e: any) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    const t = e.touches?.[0]; const x = (t ? t.clientX : e.clientX) - r.left; const y = (t ? t.clientY : e.clientY) - r.top;
    return { x: x * (c.width / r.width), y: y * (c.height / r.height) };
  }
  function down(e: any) { drawing.current = true; const c = canvasRef.current!.getContext("2d")!; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); }
  function move(e: any) { if (!drawing.current) return; e.preventDefault(); const c = canvasRef.current!.getContext("2d")!; const p = pos(e); c.lineTo(p.x, p.y); c.strokeStyle = "#0f2540"; c.lineWidth = 2.5; c.lineCap = "round"; c.stroke(); hasInk.current = true; }
  function up() { drawing.current = false; }
  function clearSig() { const c = canvasRef.current; if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height); hasInk.current = false; setInserted(false); }

  async function submit() {
    if (!hasInk.current) { setErr("Please draw your signature first."); return; }
    if (!inserted) { setErr("Tap \"Insert Everywhere\" to apply your signature to all documents."); return; }
    setBusy(true); setErr("");
    const sig = canvasRef.current!.toDataURL("image/png");
    try {
      const r = await fetch("/api/signable/packet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "sign", group, signature_data: sig, signed_name: signerName, signature_type: "drawn" }) });
      const d = await r.json();
      if (d.ok) setStep("done"); else setErr(d.error || "Could not submit. Please try again.");
    } catch { setErr("Could not submit. Please try again."); }
    finally { setBusy(false); }
  }

  if (err && docs.length === 0) return <div className="sign-shell"><div className="sign-card"><p className="muted">{err}</p></div></div>;

  return (
    <div className="sign-shell">
      <div className="sign-card">
        {step === "start" && (
          <>
            <h1 style={{ marginTop: 0 }}>You have {docs.length} document{docs.length === 1 ? "" : "s"} to sign</h1>
            <p className="muted">This will only take a moment. You will review your documents, then add your signature once and it applies to all of them.</p>
            <ul className="packet-list">{docs.map((d) => <li key={d.id}>{d.title}</li>)}</ul>
            <button className="btn gold lg" onClick={() => { setStep("review"); markViewed(); }}>Get Started</button>
          </>
        )}

        {step === "review" && (
          <>
            <h2 style={{ marginTop: 0 }}>Review your documents</h2>
            {docs.map((d) => (
              <div key={d.id} className="packet-doc">
                <div className="packet-doc-h">{d.title}</div>
                {d.pdf?.url
                  ? <iframe src={d.pdf.url} title={d.title} className="sign-pdf" />
                  : <div className="sign-body" dangerouslySetInnerHTML={{ __html: (d.body_html || "").replace(/\n/g, "<br>") }} />}
              </div>
            ))}
            <button className="btn gold lg" onClick={() => setStep("sign")}>Continue to sign</button>
          </>
        )}

        {step === "sign" && (
          <>
            <h2 style={{ marginTop: 0 }}>Add your signature</h2>
            <p className="muted">Draw your signature below. Then tap Insert Everywhere to apply it to all {docs.length} documents.</p>
            <div className="sig-pad">
              <canvas ref={canvasRef} width={600} height={200}
                onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
                onTouchStart={down} onTouchMove={move} onTouchEnd={up} />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn ghost sm" onClick={clearSig}>Clear</button>
              <button className="btn sm" onClick={() => { if (!hasInk.current) { setErr("Draw your signature first."); return; } setInserted(true); setErr(""); }}>{inserted ? "✓ Inserted everywhere" : "Insert Everywhere"}</button>
            </div>
            {err && <p className="sign-err">{err}</p>}
            <label className="chk" style={{ marginTop: 14, fontSize: 14 }}>
              <input type="checkbox" id="agree" /> I have read and agree to all {docs.length} documents, and adopt the signature above as my legal electronic signature.
            </label>
            <button className="btn gold lg" disabled={busy} onClick={() => { const a = document.getElementById("agree") as HTMLInputElement; if (!a?.checked) { setErr("Please check the box to agree."); return; } submit(); }}>{busy ? "Submitting…" : "I Agree & Submit"}</button>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48 }}>✓</div>
            <h2>All done!</h2>
            <p className="muted">Your {docs.length} document{docs.length === 1 ? " has" : "s have"} been signed and submitted. You can close this page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
