"use client";
import { useEffect, useRef, useState } from "react";

// In-house e-sign, built for the hardest case: an 89-year-old with arthritis and
// a 4-year-old helping. SIMPLE mode = giant buttons, three taps, no reading needed.
// ADVANCED mode = read the full document (rotate phone), manual date entry.
// One signature is applied to EVERY signature/initial/date field ("insert everywhere").

type Step = "loading" | "start" | "sign" | "confirm" | "done" | "error";
const SIG_FONTS = [
  { id: "cursive1", css: "'Dancing Script', cursive" },
  { id: "cursive2", css: "'Great Vibes', cursive" },
  { id: "cursive3", css: "'Sacramento', cursive" },
];

export default function SignPage({ id }: { id: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [doc, setDoc] = useState<any | null>(null);
  const [pdf, setPdf] = useState<any | null>(null);
  const [err, setErr] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"draw" | "type">("type"); // type is easier for elderly; default to it
  const [typedFont, setTypedFont] = useState(SIG_FONTS[0]);
  const [adopted, setAdopted] = useState<string | null>(null);
  const [lockDate, setLockDate] = useState(true); // default: lock to today's signing date
  const [manualDate, setManualDate] = useState("");
  const [certUrl, setCertUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  // count how many signature/initial/date spots exist, to show "applied everywhere"
  const fieldCount = (() => {
    const f = pdf?.fields || doc?.fields || [];
    const client = Array.isArray(f) ? f.filter((x: any) => (x.role || "client") === "client") : [];
    return { total: client.length, sig: client.filter((x: any) => x.type === "signature" || x.type === "initials").length };
  })();

  useEffect(() => {
    fetch(`/api/signable/submit?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.doc) { setErr("This document could not be found or has expired."); setStep("error"); return; }
        setDoc(d.doc); setPdf(d.pdf || null); setName(d.doc.signer_name || "");
        if (d.doc.status === "signed") { setStep("done"); return; }
        if (d.doc.status === "cancelled") { setErr("This signing link has been cancelled. Please contact us for a new one."); setStep("error"); return; }
        setStep("start");
        fetch("/api/signable/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, op: "viewed" }) }).catch(() => {});
      })
      .catch(() => { setErr("Could not load document."); setStep("error"); });
  }, [id]);

  // ---- drawing (resolution-correct for mobile) ----
  function fitCanvas() {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr); }
  }
  useEffect(() => { if (step === "sign" && mode === "draw") fitCanvas(); }, [step, mode]);
  function pos(e: any) { const c = canvasRef.current!; const r = c.getBoundingClientRect(); const t = e.touches?.[0]; return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top }; }
  function start(e: any) { fitCanvas(); drawing.current = true; const c = canvasRef.current!.getContext("2d")!; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e: any) { if (!drawing.current) return; const c = canvasRef.current!.getContext("2d")!; const p = pos(e); c.lineTo(p.x, p.y); c.strokeStyle = "#10243f"; c.lineWidth = 3; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(); hasInk.current = true; e.preventDefault(); }
  function end() { drawing.current = false; }
  function clearCanvas() { const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d")!; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); const dpr = window.devicePixelRatio || 1; ctx.scale(dpr, dpr); hasInk.current = false; }

  function makeTypedSig(): string {
    const c = document.createElement("canvas"); c.width = 600; c.height = 180;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#10243f"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `64px ${typedFont.css}`; ctx.fillText(name || "", c.width / 2, c.height / 2);
    return c.toDataURL("image/png");
  }

  function goSign() {
    if (!name.trim()) { setErr("Please type your name first."); return; }
    setErr(""); setStep("sign");
  }

  function confirmSig() {
    if (mode === "draw") { if (!hasInk.current) { setErr("Please draw your signature, or switch to Type."); return; } setAdopted(canvasRef.current!.toDataURL("image/png")); }
    else { setAdopted(makeTypedSig()); }
    setErr(""); setStep("confirm");
  }

  async function finish() {
    if (!adopted) { setStep("sign"); return; }
    setErr("");
    const r = await fetch("/api/signable/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, op: "sign", signed_name: name, signature_data: adopted, signature_type: mode, lock_date: lockDate, manual_date: lockDate ? null : manualDate }),
    });
    const d = await r.json();
    if (d.ok) { setCertUrl(d.cert_pdf_url || null); setStep("done"); } else setErr(d.error || "Could not submit your signature.");
  }

  // ---------- RENDER ----------
  if (step === "loading") return <div className="es-shell"><p className="es-muted">Loading…</p></div>;
  if (step === "error") return <div className="es-shell"><div className="es-card"><p className="es-err">{err}</p></div></div>;

  if (step === "done") return (
    <div className="es-shell">
      <div className="es-card es-center">
        <div className="es-bigcheck">✓</div>
        <h1 className="es-h1">All done!</h1>
        <p className="es-lead">Thank you, {name || "you're all set"}. Your signature has been received.</p>
        {certUrl && <a className="es-btn es-btn-ghost" href={certUrl} target="_blank" rel="noopener noreferrer">Download your copy</a>}
        <p className="es-fine">You can close this page now.</p>
      </div>
    </div>
  );

  return (
    <div className="es-shell">
      {/* tiny header + mode toggle */}
      <div className="es-top">
        <span className="es-brand">CLAIMREACH</span>
        <button className="es-modelink" onClick={() => setAdvanced((a) => !a)}>
          {advanced ? "Simple mode" : "Read the document"}
        </button>
      </div>

      {step === "start" && (
        <div className="es-card es-center">
          <h1 className="es-h1">Sign your document</h1>
          <p className="es-lead">Hi {doc?.signer_name || "there"}. This takes about a minute. Just tap the big button to begin.</p>

          <div className="es-field">
            <label className="es-label">Your name</label>
            <input className="es-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your name" autoComplete="name" />
          </div>

          {advanced && (
            <div className="es-doc-wrap">
              <p className="es-rotate">Turn your phone sideways to read more easily.</p>
              <div className="es-doc">
                {pdf?.url
                  ? <iframe src={`${pdf.url}#view=FitH`} title="Document" className="es-pdf" />
                  : doc?.body_html
                    ? <div className="es-body" dangerouslySetInnerHTML={{ __html: (doc.body_html || "").replace(/\n/g, "<br>") }} />
                    : <p className="es-muted">Your document will be presented for signature.</p>}
              </div>
            </div>
          )}

          <button className="es-btn es-btn-go" onClick={goSign}>Start →</button>
          {!advanced && <button className="es-textlink" onClick={() => setAdvanced(true)}>I want to read the document first</button>}
          {err && <p className="es-err">{err}</p>}
        </div>
      )}

      {step === "sign" && (
        <div className="es-card es-center">
          <h1 className="es-h1">Add your signature</h1>
          <p className="es-lead">{mode === "type" ? "Here is your signature. Tap the big button to use it." : "Draw your signature in the box with your finger."}</p>

          <div className="es-sigmode">
            <button className={`es-tab ${mode === "type" ? "on" : ""}`} onClick={() => setMode("type")}>Use my typed name</button>
            <button className={`es-tab ${mode === "draw" ? "on" : ""}`} onClick={() => setMode("draw")}>Draw it myself</button>
          </div>

          {mode === "type" ? (
            <>
              <div className="es-typedbox" style={{ fontFamily: typedFont.css }}>{name || "Your name"}</div>
              <div className="es-fontrow">
                {SIG_FONTS.map((f) => (
                  <button key={f.id} className={`es-fontopt ${typedFont.id === f.id ? "on" : ""}`} style={{ fontFamily: f.css }} onClick={() => setTypedFont(f)}>{name || "Sample"}</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <canvas ref={canvasRef} className="es-canvas"
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
              <button className="es-textlink" onClick={clearCanvas} type="button">Clear and redraw</button>
            </>
          )}

          {advanced && (
            <label className="es-check">
              <input type="checkbox" checked={!lockDate} onChange={(e) => setLockDate(!e.target.checked)} />
              <span>Let me enter the date myself (otherwise today's date is used)</span>
            </label>
          )}
          {advanced && !lockDate && (
            <div className="es-field"><label className="es-label">Date</label>
              <input className="es-input" type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} /></div>
          )}

          <button className="es-btn es-btn-go" onClick={confirmSig}>Use this signature →</button>
          {err && <p className="es-err">{err}</p>}
        </div>
      )}

      {step === "confirm" && (
        <div className="es-card es-center">
          <h1 className="es-h1">One last tap</h1>
          <div className="es-adopted"><img src={adopted!} alt="Your signature" /></div>
          {fieldCount.total > 1 && (
            <p className="es-insertall">✓ This signature will be placed on all {fieldCount.total} spots in your document automatically.</p>
          )}
          <p className="es-lead">By tapping below, this becomes your legal electronic signature, dated {lockDate || !manualDate ? new Date().toLocaleDateString() : new Date(manualDate).toLocaleDateString()}.</p>
          <button className="es-btn es-btn-go" onClick={finish}>Sign &amp; Submit ✓</button>
          <button className="es-textlink" onClick={() => setStep("sign")}>Go back and change it</button>
          {err && <p className="es-err">{err}</p>}
        </div>
      )}

      <p className="es-foot">Secure electronic signing. Your IP address and the time of signing are recorded.</p>
    </div>
  );
}
