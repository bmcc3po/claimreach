"use client";
import { useEffect, useState } from "react";

type Agreement = {
  id: string;
  status: string;
  pax: number | null;
  voided: string | null;
  client_signed_url: string | null;
  agent_reviewed_at: string | null;
  replacement_requested_at: string | null;
};

/** The next action after a client signs, in the call itself rather than File. */
export default function InlineSignedReview({ v }: { v: any }) {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signed = !!v.signed;
  const leadId = String(v.leadId || "");
  const claimId = String(v.claimId || "");

  async function load() {
    if (!leadId || !claimId) return;
    try {
      const query = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
      const response = await fetch(`/api/calls/file?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "Could not load the signed agreement.");
      const current = (data.agreements || []).find((row: Agreement) => row.pax == null && !row.voided && row.status === "signed") || null;
      setAgreement(current);
      setError(current ? "" : "The signed copy is not available yet. Refresh its status before reviewing.");
    } catch (cause: any) { setError(cause?.message || "Could not load the signed agreement."); }
  }

  useEffect(() => { if (signed) void load(); }, [signed, leadId, claimId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOpenedId(null); setConfirmed(false); }, [agreement?.id]);

  async function recordReview() {
    if (!agreement || openedId !== agreement.id || !confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/calls/esign/review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, claim_id: claimId, agreement_id: agreement.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "The review did not save.");
      await load();
    } catch (cause: any) { setError(cause?.message || "The review did not save."); }
    finally { setBusy(false); }
  }

  if (!signed) return null;
  const reviewed = !!agreement?.agent_reviewed_at;
  const url = agreement?.client_signed_url;
  return <section className="inline-signed-review" aria-label="Review client-signed agreement">
    <div className="inline-signed-review-head"><span className="inline-signed-review-number">2</span><div><strong>Client signed — review the agreement now</strong><p>Check the client name, accident date, agreement and signature. Then record your review before the office step.</p></div></div>
    {agreement?.replacement_requested_at && <p className="inline-signed-review-error">This original is under supervisor review. Review the corrected agreement when it is signed.</p>}
    {url && <>
      <div className="inline-signed-review-actions"><button type="button" onClick={() => { setOpenedId(agreement!.id); setConfirmed(false); }}>Open signed PDF here</button><a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setOpenedId(agreement!.id)}>Open in new tab</a></div>
      {openedId === agreement?.id && <div className="inline-signed-review-document"><iframe title="Client-signed agreement" src={url} referrerPolicy="no-referrer" /><p>If the PDF cannot display here, use “Open in new tab” above.</p></div>}
      {!reviewed && openedId === agreement?.id && !agreement?.replacement_requested_at && <><label className="inline-signed-review-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I inspected this signed copy and checked the name, date, agreement and signature.</label><button type="button" className="inline-signed-review-save" disabled={!confirmed || busy} onClick={() => void recordReview()}>{busy ? "Saving review…" : "Record signed-PDF review"}</button></>}
    </>}
    {reviewed && <p className="inline-signed-review-done">Signed PDF reviewed. Continue with DOB/SSN if offered, then complete the office signature.</p>}
    {error && <p className="inline-signed-review-error" role="alert">{error}</p>}
    <button type="button" className="inline-signed-review-refresh" onClick={() => void load()}>Refresh signed copy</button>
  </section>;
}
