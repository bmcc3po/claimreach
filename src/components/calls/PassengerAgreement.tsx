"use client";

/** Signing lives in Retainer, after the caller; only one passenger is active. */
export default function PassengerAgreement({ p, v, capture = true }: { p: any; v: any; capture?: boolean }) {
  if (!p || p.noRep || !v.signed) return null;
  if (p.sequenceWait) return <p className="cc-cue ch-wide">{p.title}: {p.sequenceWait}</p>;
  return <section className="passenger-agreement ch-wide" aria-label={`${p.title}'s agreement`}>
    <h3>{p.title}’s agreement</h3>
    <p>{p.note}</p>
    {!p.live && <>
      <label className="contract-field">Send by<select className="cc-field" aria-label={`Send ${p.title}'s agreement by`} value={p.via} onChange={(event) => p.setVia(event.target.value)}><option value="Text">Text</option><option value="Email">Email</option></select></label>
      {capture && !p.minor && <label className="contract-field">{p.byEmail ? "Their own email" : "Their own cell"}<input className="cc-field" type={p.byEmail ? "email" : "tel"} value={(p.byEmail ? p.email : p.cell).value ?? ""} onChange={(p.byEmail ? p.email : p.cell).set} /></label>}
      {p.shared && <label className="contract-confirm"><input type="checkbox" checked={!!p.shareOk} onChange={p.confirmShare} />The passenger confirmed they share the caller’s {p.byEmail ? "email" : "number"}.</label>}
      {!!p.blockedReason && <p className="cc-cue" role="status">{p.blockedReason}</p>}
      <button type="button" className="cc-btn" disabled={!p.ready} onClick={p.send}>{p.button}</button>
    </>}
    {p.live && <p role="status"><strong>{p.status === "sending" ? "Sending agreement…" : p.status === "signed" || p.status === "completed" ? "Client signed" : p.status === "opened" ? "Agreement opened — waiting for signature" : "Agreement sent — waiting for signature"}</strong></p>}
    {["sent", "opened"].includes(p.status) && <button type="button" className="cc-btn" disabled={!!v.signatureCheckBusy} onClick={v.checkSignature}>{v.signatureCheckBusy ? "Checking signature…" : `Check ${p.title}’s signature`}</button>}
    {!!v.hasFileError && <p className="cc-red" role="alert">{v.fileError}</p>}
    {v.passengerLinks?.[p.id] && <a className="iq-passenger-link" href={`/app/${v.passengerLinks[p.id]}`} target="_blank" rel="noopener noreferrer">Open {p.title}’s file to finish their retainer ↗</a>}
  </section>;
}
