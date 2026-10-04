"use client";

import { useCallback, useEffect, useState } from "react";
import FinishFileSteps from "./FinishFileSteps";

type Agreement = {
  id: string;
  pax: number | null;
  status: string;
  client_signed_url?: string | null;
  signed_url?: string | null;
  agent_reviewed_at?: string | null;
  replacement_requested_at?: string | null;
  can_void?: boolean;
};

// The agent's next action belongs beside the spoken signed-retainer line,
// regardless of which intake layout is selected. File remains the archive.
export default function SignedInlineReview({ v }: { v: any }) {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leadId = String(v.leadId || "");
  const claimId = String(v.claimId || "");
  const load = useCallback(async () => {
    if (!leadId || !claimId) return;
    try {
      const r = await fetch(`/api/calls/file?lead_id=${encodeURIComponent(leadId)}&claim_id=${encodeURIComponent(claimId)}`);
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || "The signed copy did not load.");
      const agreements: Agreement[] = data.agreements || [];
      // The newest primary envelope is authoritative. A voided or pending
      // correction must never bring an older envelope back as current.
      const newest = agreements.find((a) => a.pax == null) || null;
      setAgreement(newest);
      setOpened((current) => current === newest?.id ? current : null);
      setError("");
    } catch (e: any) { setError(e.message || "The signed copy did not load."); }
    finally { setLoading(false); }
  }, [leadId, claimId]);

  useEffect(() => { void load(); }, [load, v.agreementStatus, v.agreementClosed]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("cr:esign-reconciled", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("cr:esign-reconciled", refresh); };
  }, [load]);

  const review = async () => {
    if (!agreement || agreement.status !== "signed" || opened !== agreement.id || busy) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/calls/esign/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: claimId, agreement_id: agreement.id }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || "The signed-copy review did not save.");
      await load();
      window.dispatchEvent(new CustomEvent("cr:agreement-reviewed", { detail: { leadId, claimId } }));
    } catch (e: any) { setError(e.message || "The signed-copy review did not save."); }
    finally { setBusy(false); }
  };
  const previewUrl = agreement?.status === "signed" ? agreement.client_signed_url : agreement?.status === "completed" ? agreement.signed_url : null;
  const reviewable = agreement?.status === "signed" && !agreement.replacement_requested_at;
  const officeComplete = agreement?.status === "completed";
  const reviewed = !!agreement?.agent_reviewed_at;
  const step = officeComplete ? (!v.dispo?.saved ? 3 : 4) : !reviewed ? 1 : 2;
  const next = step === 1 ? "Next: review the signed retainer" : step === 2 ? "Next: finish the agreement below" : step === 3 ? "Next: save the call and review" : "Next: review and send to the firm";
  const help = step === 1 ? "Open the PDF and approve the client's signature." : step === 2 ? "Collect DOB and SSN, or record SSN refusal. Complete the office step below." : step === 3 ? "Close the call, then record its outcome." : "Check your work and send the two PDFs from the final step.";
  return <section className="signed-inline" aria-label="Review signed retainer">
    <div className="signed-inline-focus"><span>Signature received · keep going</span><strong>{next}</strong><p>{help}</p><p>The finish line is <b>Sent to firm</b>.</p></div>
    {!loading && agreement && ["signed", "completed"].includes(agreement.status) && <FinishFileSteps current={step <= 2 ? "agreement" : step === 3 ? "call" : "review"} />}
    {loading ? <p role="status">Loading signed copy…</p> : !agreement ? <p role="status">No signed agreement is on this file. Refresh before continuing.</p> : <>
      {previewUrl && step <= 2 ? <a className="signed-inline-preview" href={previewUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(agreement.id)}>{agreement.status === "signed" ? "Open client-signed retainer ↗" : "Open completed signed retainer ↗"}</a> : !previewUrl ? <p role="status">{["voided", "cancelled"].includes(agreement.status) ? "The latest agreement was voided. Correct it before continuing." : ["sent", "opened"].includes(agreement.status) ? "The latest agreement is awaiting the client's signature." : "The signed PDF is still being retrieved. Refresh before you approve or finish this file."}</p> : null}
      {reviewable && !agreement.agent_reviewed_at && <button type="button" className="signed-inline-approve" disabled={!previewUrl || opened !== agreement.id || busy} onClick={review}>{busy ? "Saving review…" : "Approve signed copy"}</button>}
      {step === 2 && <p className="signed-inline-done" role="status">Signature approved.</p>}
      {step === 3 && <button type="button" className="signed-inline-next finish-file-pulse" onClick={v.openDispo}>Save call & review intake →</button>}
      {step === 4 && <button type="button" className="signed-inline-next finish-file-pulse" onClick={v.openDispo}>Continue to firm delivery →</button>}
      {agreement.replacement_requested_at && <p className="signed-inline-error" role="status">Correction requested. Firm delivery is held for supervisor review.</p>}
    </>}
    {!!error && <p className="signed-inline-error" role="alert">{error}</p>}
    {(!previewUrl || !!error) && <button type="button" className="signed-inline-refresh" onClick={() => { setLoading(true); void load(); }}>Refresh signed copy</button>}
  </section>;
}
