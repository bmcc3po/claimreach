"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "./imported-packet-handoff.css";

type SourceFile = { id: string; name: string; kind: string; url: string | null };
type State = { documents: SourceFile[]; status: string; source_signed_at: string | null;
  delivery: { to: string | null; cc: string | null; owner_email: string | null }; confirmed_firm_sent_at: string | null; owner_confirmed_delivery?: boolean; dispatch: { state?: string } | null };

export default function ImportedPacketHandoff({ leadId, claimId }: { leadId: string; claimId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<string[]>([]);
  const [checks, setChecks] = useState([false, false, false, false]);
  const [extra, setExtra] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const sending = useRef(false);
  const query = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
  const intakeUrl = `/api/export/intake-pdf?${query}&preview=1`;

  async function load() {
    const [sourceResponse, deliveryResponse] = await Promise.all([
      fetch(`/api/imported-packet?${query}`, { cache: "no-store" }),
      fetch(`/api/firm-delivery?${query}`, { cache: "no-store" }),
    ]);
    const source = await sourceResponse.json().catch(() => ({}));
    const delivery = await deliveryResponse.json().catch(() => ({}));
    if (!sourceResponse.ok || !deliveryResponse.ok || delivery.claim_id !== claimId) throw new Error(source.error || delivery.error || "Could not confirm this matter's packet status.");
    setState({ ...source, delivery: delivery.delivery, confirmed_firm_sent_at: delivery.confirmed_firm_sent_at, owner_confirmed_delivery: delivery.owner_confirmed_delivery, dispatch: delivery.dispatch });
    setLoading(false);
  }
  useEffect(() => { setState(null); setLoading(true); setError(""); setOpened([]); setChecks([false, false, false, false]);
    void load().catch((cause) => { setError(cause?.message || "Could not load imported packet."); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, claimId]);

  if (loading) return <section className="imported-handoff"><h2>Imported signed packet</h2><p>Checking the original PDFs…</p></section>;
  if (!state) return <section className="imported-handoff"><h2>Imported signed packet needs review</h2><p role="alert">{error}</p></section>;
  const sentAt = state.confirmed_firm_sent_at;
  if (state.owner_confirmed_delivery && !sentAt) return <section className="imported-handoff"><h2>SENT TO FIRM</h2><p>The owner approved the imported signed file and confirmed it was sent to the firm.</p><p>The original delivery date was not recorded. The return window cannot be calculated. Do not send it again.</p></section>;
  const owner = state.delivery.owner_email || "";
  const firm = state.delivery.to || "";
  const cc = String(state.delivery.cc || "").split(/[,;]/).map((item) => item.trim()).filter(Boolean);
  const extras = extra.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  const pending = ["sending", "uncertain"].includes(state.dispatch?.state || "");
  const ready = !!firm && !!owner && firm.toLowerCase() !== owner.toLowerCase() && !pending;
  const recipientKey = JSON.stringify([leadId, claimId, firm, owner, cc, extras]);
  const people = [...new Set([firm, owner, ...cc, ...extras].filter(Boolean))];
  const returnEnd = sentAt ? new Date(Date.parse(sentAt) + 7 * 86400000) : null;
  const daysLeft = returnEnd ? Math.max(0, Math.ceil((returnEnd.getTime() - Date.now()) / 86400000)) : null;

  function canSend() {
    if (!state || !ready || busy || sending.current || sentAt) return false;
    if (!opened.includes("intake") || state.documents.some((file) => !opened.includes(file.id)) || !checks.every(Boolean)) {
      setError("Open the intake and every original PDF, then confirm all four review items."); return false;
    }
    if (extras.length > 3 || extras.some((value) => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value))) { setError("Enter up to three valid additional addresses."); return false; }
    return true;
  }

  function reviewSend() {
    if (!canSend()) return;
    setError(""); setConfirmation(recipientKey);
  }

  async function send() {
    if (!canSend()) return;
    if (!confirmation || confirmation !== recipientKey) { setConfirmation(null); setError("The recipients changed. Review them again before sending."); return; }
    sending.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/imported-packet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        lead_id: leadId, claim_id: claimId, confirmed_intake: true, confirmed_signature: true, confirmed_hipaa_hitech: true,
        confirmed_criteria: true, confirmed_send: true, expected_to: firm, expected_cc: cc, additional_recipients: extras,
      }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || result.skipped) throw new Error(result.error || result.skipped || "Firm delivery was not confirmed.");
      await load(); router.refresh();
    } catch (cause: any) { setError(cause?.message || "Firm delivery failed. Check the file before retrying.");
      try { await load(); } catch { /* Preserve the send error. */ }
    } finally { sending.current = false; setBusy(false); setConfirmation(null); }
  }

  return <section className="imported-handoff" aria-label="Imported signed packet handoff">
    <h2>{sentAt ? "Sent to firm" : "Review the file, then send"}</h2>
    {sentAt ? <div role="status"><strong>Firm delivery confirmed {new Date(sentAt).toLocaleString()}.</strong><p>{daysLeft ? `Return window: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Ends ${returnEnd?.toLocaleString()}.` : "Seven-day firm return window ended."}</p></div> : <>
      <p>LawRuler reported this signed. Inspect the actual packet below. The imported signing date is {state.source_signed_at ? new Date(state.source_signed_at).toLocaleDateString() : "not supplied"}; review does not invent one.</p>
      <div className="imported-handoff-docs"><a href={intakeUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened((old) => [...new Set([...old, "intake"])])}>1. Open intake PDF {opened.includes("intake") ? "✓" : "↗"}</a>
        {state.documents.map((file, index) => <a key={file.id} href={file.url || "#"} target="_blank" rel="noopener noreferrer" aria-disabled={!file.url} onClick={(event) => { if (!file.url) { event.preventDefault(); return; } setOpened((old) => [...new Set([...old, file.id])]); }}>{index + 2}. Open {file.kind === "retainer" ? "signed retainer" : "original PDF"}: {file.name} {opened.includes(file.id) ? "✓" : "↗"}</a>)}
      </div>
      {["I reviewed the intake answers and contact details.", "I inspected the client signatures and names on the original PDFs.", "I verified that the packet includes the required HIPAA/HITECH authorizations.", "I checked the case criteria and there is no unresolved correction."].map((label, index) => <label className="imported-handoff-check" key={label}><input type="checkbox" disabled={busy} checked={checks[index]} onChange={() => { setConfirmation(null); setChecks((old) => old.map((value, i) => i === index ? !value : value)); }} />{label}</label>)}
      <div className="imported-handoff-recipient"><strong>To firm:</strong> {firm || "Not configured"}<br /><strong>Copy to Brett:</strong> {owner || "Not configured"}</div>
      <label className="imported-handoff-extra">Additional addresses (optional)<input disabled={busy} value={extra} onChange={(event) => { setConfirmation(null); setExtra(event.target.value); }} placeholder="name@example.com" /></label>
      {!ready && <p role="alert">{pending ? "A previous send has an uncertain outcome. An owner must reconcile it before another attempt." : "The firm and owner recipient addresses must both be configured."}</p>}
      {confirmation === recipientKey ? <div className="imported-handoff-confirm" role="group" aria-label="Confirm imported packet delivery">
        <strong>Ready to send this file?</strong>
        <p>The intake and reviewed original PDFs will go to:</p>
        <ul>{people.map(person => <li key={person}>{person}</li>)}</ul>
        <button type="button" className="imported-handoff-send" disabled={!ready || busy} onClick={() => void send()}>{busy ? "Checking and sending…" : "Confirm & send"}</button>
        <button type="button" className="imported-handoff-back" disabled={busy} onClick={() => setConfirmation(null)}>Go back</button>
      </div> : <button type="button" className="imported-handoff-send" disabled={!ready || busy} onClick={reviewSend}>Send file to firm →</button>}
      {error && <p className="imported-handoff-error" role="alert">{error}</p>}
    </>}
  </section>;
}
