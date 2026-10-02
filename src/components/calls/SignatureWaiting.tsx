"use client";

/** The next action stays beside the agreement while the client finishes signing. */
export default function SignatureWaiting({ v }: { v: any }) {
  if (!["sent", "opened"].includes(v.agreementStatus)) return null;
  return <section className="signature-waiting" aria-label="Check client signature">
    <strong>Client says they finished signing?</strong>
    <p>Check the signing service here. Do not treat the retainer as signed until this screen confirms it.</p>
    <button type="button" disabled={!!v.signatureCheckBusy} onClick={v.checkSignature}>
      {v.signatureCheckBusy ? "Checking signature…" : "Check signed status now"}
    </button>
    {!!v.signatureCheckMessage && <p role="status" className="signature-waiting-result">{v.signatureCheckMessage}</p>}
    <small>After confirmation: review the signed PDF, finish the office step, disposition the call, QA the file, then send the packet.</small>
  </section>;
}
