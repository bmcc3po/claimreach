"use client";

/** The next action stays beside the agreement while the client finishes signing. */
export default function SignatureWaiting({ v }: { v: any }) {
  if (!["sent", "opened"].includes(v.agreementStatus)) return null;
  return <section className="signature-waiting" aria-label="Check client signature">
    <div><strong>Client says they signed?</strong><p>Confirm it here before moving on.</p></div>
    <button type="button" disabled={!!v.signatureCheckBusy} onClick={v.checkSignature}>
      {v.signatureCheckBusy ? "Checking signature…" : "Check signed status now"}
    </button>
    {!!v.signatureCheckMessage && <p role="status" className="signature-waiting-result">{v.signatureCheckMessage}</p>}
  </section>;
}
