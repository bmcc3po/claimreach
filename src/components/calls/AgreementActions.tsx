"use client";
import { useEffect, useState } from "react";

export default function AgreementActions({ leadId, claimId }: { leadId: string; claimId: string }) {
  const [agreements, setAgreements] = useState<any[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const query = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
      const response = await fetch(`/api/calls/file?${query}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error || "Agreement actions did not load.");
      setAgreements((body.agreements || []).filter((agreement: any) => agreement.can_void));
      setError("");
    } catch (cause: any) { setError(cause.message || "Agreement actions did not load."); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId, claimId]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("cr:esign-reconciled", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("cr:esign-reconciled", refresh); };
  }, [leadId, claimId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!agreements.length && !error) return null;
  const active = agreements.find((agreement) => agreement.id === target);
  const voidAgreement = async () => {
    if (!active || reason.trim().length < 3 || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/calls/esign/void", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: claimId, id: active.id, reason: reason.trim() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) throw new Error(body.error || "The agreement was not voided.");
      setTarget(null); setReason("");
      await load();
      window.dispatchEvent(new CustomEvent("cr:voided", { detail: { leadId, claimId, pax: active.pax } }));
    } catch (cause: any) { setError(cause.message || "The agreement was not voided."); }
    finally { setBusy(false); }
  };
  return <div className="inline-agreement-actions"><details className="cc-card"><summary>Void an agreement · owner/admin</summary>
    <p className="cc-cue">Use only to correct a signed or sent agreement. The original and audit history stay on file.</p>
    {agreements.map((agreement) => <div key={agreement.id} className="cc-card">
      <div className="cc-cue">{agreement.name || agreement.signer || "Agreement"} · {agreement.status}</div>
      {target === agreement.id ? <>
        <label className="cc-cue" htmlFor={`void-reason-${agreement.id}`}>Reason to void</label>
        <textarea id={`void-reason-${agreement.id}`} className="cc-area" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        <div className="cc-chips cc-list"><button type="button" className="cc-chip cc-sm" onClick={() => { setTarget(null); setReason(""); }}>Cancel</button><button type="button" className="cc-chip cc-sm" disabled={busy || reason.trim().length < 3} onClick={() => void voidAgreement()}>{busy ? "Voiding…" : "Confirm void"}</button></div>
      </> : <button type="button" className="cc-chip cc-sm" onClick={() => { setTarget(agreement.id); setReason(""); }}>Void this agreement</button>}
    </div>)}
    {error && <p className="cc-cue cc-red" role="alert">{error}</p>}
  </details></div>;
}

