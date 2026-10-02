"use client";

import { useEffect } from "react";
import IntakeQuestion from "./IntakeQuestion";
import { DobField, SsnField } from "./SsnDob";
import { SsnRefusal } from "./SsnRefusal";

/** A quiet, editable answer sheet between disposition and final firm QA. */
export default function PostCallReview({ v }: { v: any }) {
  const missing = v.fi.missing || [];
  const jump = (id: string) => document.getElementById(`sf-q-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  useEffect(() => { if (v.fi.target) requestAnimationFrame(() => jump(v.fi.target)); }, [v.fi.jump]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (label: string, value: any, type = "text") => <div className="post-review-row" key={label}>
    <label>{label}</label><input type={type} value={value.value ?? ""} onChange={value.set} aria-label={label} />
  </div>;
  const finalQa = <button type="button" className="post-review-next" disabled={!!v.reviewBusy} onClick={() => void v.returnToFinalQa()}>
    {v.reviewBusy ? "Saving answers…" : "Continue to final QA & send"}
  </button>;

  return <main className="post-review" aria-label="Review intake answers">
    <header className="post-review-header">
      <div><span className="post-review-eyebrow">Call disposition saved</span><h1>Review intake</h1><p>{v.callerName} · {v.leadNo}</p></div>
      {finalQa}
    </header>
    <div className="post-review-body">
      <div className="post-review-status" role="status">
        <strong>{missing.length ? `${missing.length} required answer${missing.length === 1 ? "" : "s"} missing` : "All required answers captured"}</strong>
        <span>{v.saveBad ? v.saveError : v.saveText || "Answers save as you go"}</span>
      </div>
      {!!missing.length && <details className="post-review-missing"><summary>Show missing answers</summary><div>
        {missing.map((item: any) => <button key={item.id} type="button" onClick={() => jump(item.id)}>{item.secLabel}: {item.label}</button>)}
      </div></details>}

      <div className="sf post-review-questions">
        {(v.fi.sections || []).map((section: any) => <section key={section.id} className="sf-sec" aria-label={section.label}>
          <h2 className="sf-h">{section.label}</h2>
          <div className="sf-rows">{section.questions.map((q: any) => <IntakeQuestion key={q.id} q={q} v={v} presentation="form" review />)}</div>
        </section>)}
      </div>

      <section className="post-review-file" aria-label="Client and file details">
        <h2>Client & file details</h2>
        {field("Client name", v.f.client)}
        {field("Phone", v.f.phone, "tel")}
        {field("Email", v.f.email, "email")}
        <div className="post-review-row"><label>Date of birth</label><DobField value={v.f.dob.value ?? ""} onChange={(value: string) => v.f.dob.set({ target: { value } })} /></div>
        <div className="post-review-row"><label>Social Security number</label><div><SsnField value={v.f.ssn.value ?? ""} requireFull={!!v.ssnRequireFull} storedMode={v.f.ssnMode.value ?? null} onMode={(mode: string) => v.f.ssnMode.set({ target: { value: mode } })} onChange={(value: string) => v.f.ssn.set({ target: { value } })} savedMode={v.identitySavedMode} saveStatus={v.identityStatus} saveError={v.identitySaveError} onRetry={v.identityRetry} /><SsnRefusal v={v} /></div></div>
        {field("Home address", v.f.addr)}
        {field("Driver’s license", v.f.dl)}
        {field("Emergency contact", v.f.ecName)}
        {field("Emergency phone", v.f.ecPhone, "tel")}
      </section>
      {v.reviewError && <p className="post-review-error" role="alert">{v.reviewError}</p>}
      <footer className="post-review-footer">{finalQa}</footer>
    </div>
  </main>;
}
