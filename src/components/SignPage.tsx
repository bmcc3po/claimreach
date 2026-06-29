"use client";
import { useEffect, useRef, useState } from "react";

// In-house e-sign ceremony, emulating a real platform: consent disclosure ->
// review the document -> adopt signature (draw or type) -> agree and finish.
// Captures signer IP/timestamps server-side; sender IP captured at send time.

type Step = "loading" | "consent" | "review" | "adopt" | "done" | "error";

const SIG_FONTS = [
  { id: "cursive1", label: "Dancing Script", css: "'Dancing Script', cursive" },
  { id: "cursive2", label: "Great Vibes", css: "'Great Vibes', cursive" },
  { id: "cursive3", label: "Sacramento", css: "'Sacramento', cursive" },
];

export default function SignPage({ id }: { id: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [doc, setDoc] = useState<any | null>(null);
  const [err, setErr] = useState("");

  // signer identity + consent
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);

  // signature adoption
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typedFont, setTypedFont] = useState(SIG_FONTS[0]);
  const [adopted, setAdopted] = useState<string | null>(null); // dataURL of chosen signature
  const [agree, setAgree] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    fetch(`/api/signable/submit?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.doc) { setErr("This document could not be found or has expired."); setStep("error"); return; }
        setDoc(d.doc);
        setName(d.doc.signer_name || "");
        if (d.doc.status === "signed") { setStep("done"); return; }
        setStep("consent");
        // mark viewed (best-effort)
        fetch("/api/signable/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, op: "viewed" }) }).catch(() => {});
      })
      .catch(() => { setErr("Could not load document."); setStep("error"); });
  }, [id]);

  // ---- drawing ----
  function pos(e: any) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    const t = e.touches?.[0];
    return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top };
  }
  function start(e: any) { drawing.current = true; const c = canvasRef.current!.getContext("2d")!; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e: any) { if (!drawing.current) return; const c = canvasRef.current!.getContext("2d")!; const p = pos(e); c.lineTo(p.x, p.y); c.strokeStyle = "#10243f"; c.lineWidth = 2.5; c.lineCap = "round"; c.stroke(); hasInk.current = true; e.preventDefault(); }
  function end() { drawing.current = false; }
  function clearCanvas() { const c = canvasRef.current; if (!c) return; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); hasInk.current = false; }

  function buildTypedSignature(): string {
    // Render the typed name in a signature font to a canvas -> dataURL.
    const c = document.createElement("canvas"); c.width = 500; c.height = 150;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#10243f"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.font = `52px ${typedFont.css}`;
    ctx.fillText(name || "", c.width / 2, c.height / 2);
    return c.toDataURL("image/png");
  }

  function adopt() {
    if (!name.trim()) { setErr("Please enter your full legal name."); return; }
    let sig: string;
    if (mode === "draw") {
      if (!hasInk.current) { setErr("Please draw your signature."); return; }
      sig = canvasRef.current!.toDataURL("image/png");
    } else {
      sig = buildTypedSignature();
    }
    setErr(""); setAdopted(sig);
  }

  async function finish() {
    if (!adopted) { setErr("Adopt your signature first."); return; }
    if (!agree) { setErr("Please check the agreement box to finish."); return; }
    setErr("");
    const r = await fetch("/api/signable/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, op: "sign", signed_name: name, signature_data: adopted, signature_type: mode }),
    });
    const d = await r.json();
    if (d.ok) setStep("done"); else setErr(d.error || "Could not submit your signature.");
  }

  // ---- screens ----
  if (step === "loading") return <div className="sign-shell"><p className="muted">Loading…</p></div>;
  if (step === "error") return <div className="sign-shell"><div className="sign-card"><p>{err}</p></div></div>;

  if (step === "done") return (
    <div className="sign-shell">
      <div className="sign-card sign-done">
        <div className="sign-check">✓</div>
        <h2>Completed</h2>
        <p className="muted">Thank you, {name}. Your document has been signed and recorded. A copy and the completion certificate are on file.</p>
        {doc?.envelope_id && <p className="sign-env">Envelope ID: {doc.envelope_id}</p>}
      </div>
    </div>
  );

  return (
    <div className="sign-shell">
      <div className="sign-topbar">
        <span className="sign-brand">Electronic Signature</span>
        {doc?.envelope_id && <span className="sign-env">Envelope {doc.envelope_id}</span>}
      </div>

      {/* progress */}
      <div className="sign-steps">
        {["Review terms", "Review document", "Sign"].map((s, i) => {
          const idx = step === "consent" ? 0 : step === "review" ? 1 : 2;
          return <div key={s} className={`sign-stepchip ${i <= idx ? "on" : ""}`}><span>{i + 1}</span>{s}</div>;
        })}
      </div>

      {step === "consent" && (
        <div className="sign-card">
          <h2>Please review and accept</h2>
          <p className="muted">Before you can sign electronically, please read and agree to the terms below.</p>
          <div className="sign-consent">
            <h4>Electronic Record and Signature Disclosure</h4>
            <p>By selecting "I agree" below, you consent to receive and sign this document and related records electronically from the sender. You agree that your electronic signature is the legal equivalent of your handwritten signature and that it is binding.</p>
            <p>You may request a paper copy of any record at no charge by contacting the sender. You have the right to withdraw your consent to use electronic records before signing. To view and retain these records you will need a device with internet access, a current web browser, and the ability to view and save PDF files.</p>
            <p>By proceeding, you confirm that you can access these records electronically and that the name and details shown are correct.</p>
          </div>
          <label className="sign-agree">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree to use electronic records and signatures, and I consent to the disclosure above.</span>
          </label>
          {err && <p className="save-msg warn">{err}</p>}
          <button className="btn gold sign-cta" disabled={!consent} onClick={() => {
            fetch("/api/signable/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, op: "consent" }) }).catch(() => {});
            setStep("review");
          }}>Continue</button>
        </div>
      )}

      {step === "review" && (
        <div className="sign-card">
          <h2>{doc.title}</h2>
          <p className="muted">Review the full document below. When you are ready, continue to sign.</p>
          <div className="sign-doc">
            {doc.body_html
              ? <div className="sign-body" dangerouslySetInnerHTML={{ __html: (doc.body_html || "").replace(/\n/g, "<br>") }} />
              : <p className="muted">This document will be presented for your signature. Continue to add your signature where required.</p>}
          </div>
          <div className="sign-fieldhint"><span className="sign-tab">SIGN HERE</span> Your signature is required to complete this document.</div>
          <button className="btn gold sign-cta" onClick={() => setStep("adopt")}>Continue to sign</button>
        </div>
      )}

      {step === "adopt" && (
        <div className="sign-card">
          <h2>Adopt your signature</h2>
          <p className="muted">Confirm your name and choose how to sign. This signature will be applied to the document.</p>

          <div className="sign-field">
            <label>Full legal name</label>
            <input value={name} onChange={(e) => { setName(e.target.value); setAdopted(null); }} placeholder="Full name" />
          </div>

          <div className="sign-modeswitch">
            <button className={mode === "draw" ? "on" : ""} onClick={() => { setMode("draw"); setAdopted(null); }}>Draw</button>
            <button className={mode === "type" ? "on" : ""} onClick={() => { setMode("type"); setAdopted(null); }}>Type</button>
          </div>

          {mode === "draw" ? (
            <div className="sign-field">
              <canvas ref={canvasRef} width={500} height={150} className="sign-canvas"
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
              <button className="btn ghost sm" onClick={clearCanvas} type="button">Clear</button>
            </div>
          ) : (
            <div className="sign-field">
              <div className="sign-typed" style={{ fontFamily: typedFont.css }}>{name || "Your name"}</div>
              <div className="sign-fontrow">
                {SIG_FONTS.map((f) => (
                  <button key={f.id} className={`sign-fontopt ${typedFont.id === f.id ? "on" : ""}`} style={{ fontFamily: f.css }} onClick={() => { setTypedFont(f); setAdopted(null); }}>{name || "Sample"}</button>
                ))}
              </div>
            </div>
          )}

          {!adopted ? (
            <button className="btn sign-cta" onClick={adopt}>Adopt and preview</button>
          ) : (
            <>
              <div className="sign-adopted">
                <span className="muted">Adopted signature:</span>
                <img src={adopted} alt="signature" />
              </div>
              <label className="sign-agree">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>I understand this is my legally binding electronic signature, applied to this document on {new Date().toLocaleDateString()}.</span>
              </label>
              <button className="btn gold sign-cta" onClick={finish}>Agree and sign</button>
            </>
          )}
          {err && <p className="save-msg warn">{err}</p>}
        </div>
      )}

      <p className="sign-foot">Secured electronic signing. Your IP address and the time of signing are recorded for the audit trail.</p>
    </div>
  );
}
