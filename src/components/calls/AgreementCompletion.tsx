"use client";

import type { ReactNode } from "react";

/** The same office-completion action and destination in every intake view. */
export default function AgreementCompletion({ v, children, prefix }: { v: any; children: ReactNode; prefix: "ch" | "sf" | "fi" }) {
  return <section id={`${prefix}-q-agreement`} className="agreement-completion ch-wide" aria-label="Finish the agreement">
    <h3>Finish the agreement</h3>
    {v.signed && !v.fileAgreementDone && <p className="agreement-completion-help">The client has signed. Review their signed copy above, check DOB and SSN below, then complete the office step.</p>}
    <div className="agreement-completion-fields">{children}</div>
    {v.agreementOpen && <div className="agreement-completion-actions">
      <button type="button" className="cc-btn" disabled={!!v.agreementLocked} onClick={v.completeAgreement}>{v.completeLabel}</button>
      <button type="button" className="cc-btn cc-soft" onClick={v.leaveForQa}>Finish later</button>
    </div>}
    {v.agreementClosed && <p role="status">{v.agreementNote}</p>}
    {v.agreementParked && <button type="button" className="cc-btn cc-soft" onClick={v.reopenAgreement}>Reopen and finish it now</button>}
    {v.hasFileError && <p className="agreement-completion-error" role="alert">{v.fileError}</p>}
  </section>;
}
