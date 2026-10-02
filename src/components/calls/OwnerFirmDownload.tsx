"use client";

import { useState } from "react";
import "./owner-firm-download.css";

type Agreement = {
  id: string; status: string; pax: number | null; voided: string | null;
  signed_url: string | null; client_signed_url: string | null;
  cert_url: string | null; doc_count?: number | null;
};

export default function OwnerFirmDownload({ leadId, claimId, compact = false }: { leadId: string; claimId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [importedDocs, setImportedDocs] = useState<{ id: string; name: string; type: string }[]>([]);
  const [intakeAvailable, setIntakeAvailable] = useState(false);
  const [intakeIssue, setIntakeIssue] = useState("");
  const [status, setStatus] = useState("");
  const [deliveryWarnings, setDeliveryWarnings] = useState<string[]>([]);
  const [override, setOverride] = useState(false);
  const intakeUrl = `/api/export/intake-pdf?lead_id=${encodeURIComponent(leadId)}&claim_id=${encodeURIComponent(claimId)}`;

  async function inspect() {
    setOpen(true); setLoading(true); setError(""); setOverride(false);
    try {
      const query = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
      const [fileResponse, intakeResponse, deliveryResponse] = await Promise.all([
        fetch(`/api/calls/file?${query}`, { cache: "no-store" }),
        fetch(`${intakeUrl}&preview=1`, { cache: "no-store" }),
        fetch(`/api/firm-delivery?${query}`, { cache: "no-store" }),
      ]);
      const file = await fileResponse.json().catch(() => ({}));
      if (!fileResponse.ok || file.error) throw new Error(file.error || "Could not inspect this file.");
      const current = (file.agreements || []).find((row: Agreement) => row.pax == null && !row.voided) || null;
      setAgreement(current);
      setImportedDocs((file.docs || []).filter((doc: any) => doc.scope === "This matter" && /\.pdf$/i.test(doc.name || "")).map((doc: any) => ({ id: doc.id, name: doc.name, type: doc.type })));
      setStatus(file.status?.label || "Status unavailable");
      const delivery = await deliveryResponse.json().catch(() => ({}));
      const warnings: string[] = [];
      if (!deliveryResponse.ok || delivery.error) warnings.push("Firm delivery status could not be confirmed. Check the file before claiming it was sent.");
      else {
        if (!delivery.qa_approved) warnings.push("File QA has not been approved.");
        if (!delivery.delivery?.to) warnings.push("The firm recipient email is not configured.");
        if (["sending", "uncertain"].includes(delivery.dispatch?.state || "")) warnings.push("A prior email attempt is unresolved. Check it before sending anything manually.");
        if (delivery.confirmed_firm_sent_at) warnings.push(`ClaimReach records a firm delivery at ${new Date(delivery.confirmed_firm_sent_at).toLocaleString()}. Avoid a duplicate send.`);
      }
      if (file.imported?.sourceSignedReported && file.imported?.signatureValidation === "not_performed") warnings.push("The LawRuler-reported signature has not been independently verified.");
      if (file.qa_return) warnings.push("QA returned this file for corrections.");
      setDeliveryWarnings(warnings);
      setIntakeAvailable(intakeResponse.ok);
      if (intakeResponse.ok) setIntakeIssue("");
      else {
        const issue = await intakeResponse.json().catch(() => ({}));
        setIntakeIssue(issue.error || "Intake PDF is unavailable.");
      }
    } catch (cause: any) { setError(cause?.message || "Could not inspect this file."); }
    finally { setLoading(false); }
  }

  const completed = agreement?.status === "completed" && !!agreement.signed_url;
  const clientPreview = !completed && !!agreement?.client_signed_url;
  const docs: { label: string; href: string }[] = [];
  if (intakeAvailable) docs.push({ label: "Download intake PDF", href: intakeUrl });
  if (completed && agreement?.signed_url) {
    docs.push({ label: "Download signed retainer + HIPAA/HITECH PDF", href: `${agreement.signed_url}?download=1` });
    for (let index = 2; index <= Math.min(agreement.doc_count || 1, 10); index++) docs.push({ label: `Download additional signed packet ${index}`, href: `/api/calls/esign/doc/${agreement.id}/signed-${index}?download=1` });
  } else if (clientPreview && agreement?.client_signed_url) {
    docs.push({ label: "Download preliminary client-signed copy (office step pending)", href: `${agreement.client_signed_url}?download=1` });
  }
  if (agreement?.cert_url) docs.push({ label: "Download signing certificate", href: `${agreement.cert_url}?download=1` });
  for (const imported of importedDocs) docs.push({ label: `Download uploaded ${imported.type || "document"}: ${imported.name}`, href: `/api/calls/file/doc/${encodeURIComponent(imported.id)}` });

  return <section className={`owner-firm-download${compact ? " owner-firm-download-compact" : ""}`} aria-label="Manual firm packet download">
    <button type="button" className="owner-firm-download-open" onClick={() => open ? setOpen(false) : void inspect()}>{open ? "Hide manual downloads" : "Download firm PDFs"}</button>
    {open && <div className="owner-firm-download-panel">
      <h3>Manual firm download</h3>
      <p>Current status: <strong>{status || "Checking…"}</strong>. Review these warnings before downloading.</p>
      {loading ? <p>Checking available PDFs…</p> : error ? <p role="alert">{error}</p> : <>
        <ul className="owner-firm-download-warnings">
          {deliveryWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          {!intakeAvailable && <li>Intake PDF missing: {intakeIssue}</li>}
          {!agreement && <li>No ClaimReach e-sign agreement is attached to this matter. Any uploaded PDFs below are source originals; verify signatures before sending.</li>}
          {agreement && !completed && <li>The completed retainer/HIPAA/HITECH packet is unavailable. {clientPreview ? "Only the preliminary client-signed copy is available; the office signer step remains pending." : `Agreement status: ${agreement.status}.`}</li>}
          {completed && !agreement?.cert_url && <li>The signing certificate is unavailable.</li>}
          <li>This manual download does not send anything, change status, or start the seven-day firm return clock.</li>
        </ul>
        <label className="owner-firm-download-confirm"><input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} /> I understand the warnings and want the available files now.</label>
        <div className="owner-firm-download-links">{docs.map((doc) => <a key={doc.href} className={!override ? "disabled" : ""} href={override ? doc.href : undefined} download aria-disabled={!override}>{doc.label} ↓</a>)}</div>
        {!docs.length && <p role="alert">No PDF is available to download yet. Check the agreement and intake records on this file.</p>}
      </>}
    </div>}
  </section>;
}
