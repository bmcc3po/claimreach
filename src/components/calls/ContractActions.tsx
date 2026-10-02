"use client";

import { useRef, useState } from "react";
import AgreementChoice from "./AgreementChoice";
import AgreementActions from "./AgreementActions";
import { AgreementRecipient, IntakeChoices, choicesFromClasses } from "./IntakeQuestion";

/** These controls live beside the contract in every intake presentation. */
export default function ContractActions({ v }: { v: any }) {
  const [alternate, setAlternate] = useState(false);
  const [phone, setPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const unsigned = ["sent", "opened"].includes(v.agreementStatus);
  const validPhone = /^(?:1)?\d{10}$/.test(phone.replace(/\D/g, ""));
  async function resend() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setMessage(""); setError("");
    try {
      const result = await v.resendLink(alternate ? { phone, recipient_confirmed: confirmed } : undefined);
      if (!result?.ok) throw new Error("The resend was not confirmed. Check the agreement status before trying again.");
      setMessage(`Signing link sent to ${result.phone}.${result.warning ? ` ${result.warning}` : ""}`);
    } catch (cause: any) { setError(cause.message || "The signing link could not be sent."); }
    finally { sending.current = false; setBusy(false); }
  }
  return <div className="contract-actions ch-wide">
    {!!v.sendHoldNotice && <div className="cc-stop" role="status">
      <strong>Check the previous send</strong><p>{v.sendHoldNotice}</p>
      {v.checkSignatureNow && <button type="button" className="cc-chip" disabled={!!v.signatureChecking} onClick={v.checkSignatureNow}>{v.signatureChecking ? "Checking…" : "Check agreement status again"}</button>}
      {(v.reconcileActions || []).map((action: any) => <button type="button" key={action.label} className="cc-chip" disabled={!!v.reconcileBusy} onClick={action.go}>{v.reconcileBusy ? "Checking…" : action.label}</button>)}
      {!!v.reconcileMessage && <p>{v.reconcileMessage}</p>}
    </div>}
    {unsigned && <section className="agreement-resend" aria-label="Send agreement again">
      <h3>Send agreement again</h3>
      <p>Send the same unsigned agreement to the client.</p>
      {v.agreementDeliveryPhone && <p>Originally texted to <strong>{v.agreementDeliveryPhone}</strong></p>}
      <div className="contract-action-row">
        <button type="button" className="cc-chip" aria-pressed={!alternate} disabled={busy} onClick={() => { setAlternate(false); setMessage(""); setError(""); }}>Original number</button>
        <button type="button" className="cc-chip" aria-pressed={alternate} disabled={busy} onClick={() => { setAlternate(true); setMessage(""); setError(""); }}>Send to a different number</button>
      </div>
      {alternate && <>
        <label className="contract-field">Number for this signing link<input className="cc-field" type="tel" inputMode="tel" autoComplete="off" value={phone} disabled={busy} onChange={(event) => { setPhone(event.target.value); setConfirmed(false); setMessage(""); }} /></label>
        <label className="contract-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />The client confirmed they can receive their agreement at this number.</label>
        <p className="cc-cue">This changes where this link is texted. Edit Client contact details above to change the client’s saved number.</p>
      </>}
      {!alternate && v.agreementDeliveryVia === "Email" && <p>Originally sent by email. Choose “Send to a different number” to text the client their existing link.</p>}
      <button type="button" className="cc-btn" disabled={busy || !v.canResend || (alternate ? !validPhone || !confirmed : v.agreementDeliveryVia === "Email")} onClick={() => void resend()}>{busy ? "Sending…" : alternate ? "Text agreement to this number" : "Text agreement to original number"}</button>
      {message && <p role="status" className="contract-success">{message}</p>}
      {error && <p role="alert" className="cc-red">{error}</p>}
    </section>}
    {v.canReplace && <details className="contract-correction">
      <summary>Correct or send a new agreement</summary>
      <p>The original stays in history. A correction to a client-signed agreement also goes to supervisor review before firm delivery.</p>
      <label className="contract-field">Signer’s full name<input className="cc-field" value={v.f.client.value ?? ""} onChange={v.f.client.set} /></label>
      <AgreementChoice v={v} />
      <IntakeChoices opts={choicesFromClasses(v.via)} />
      <AgreementRecipient v={v} />
      {!!v.previewHref && <a className="cc-chip" href={v.previewHref} target="_blank" rel="noopener noreferrer">Preview corrected agreement ↗</a>}
      {!!v.sendWarnText && <p className="cc-cue">{v.sendWarnText}</p>}
      <button type="button" className="cc-btn" disabled={!v.previewHref || v.contractChoice?.needReason} onClick={v.replaceAgreement}>Report error and send corrected agreement</button>
    </details>}
    {v.leadId && v.claimId && <AgreementActions key={`${v.claimId}:${v.agreementStatus}`} leadId={v.leadId} claimId={v.claimId} />}
  </div>;
}
