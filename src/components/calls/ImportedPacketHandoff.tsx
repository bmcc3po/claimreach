"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./imported-packet-handoff.css";

type SourceFile = { id: string; name: string; kind: string; url: string | null };
type State = { documents: SourceFile[]; status: string; source_signed_at: string | null;
  delivery: { to: string | null; cc: string | null; owner_email: string | null }; confirmed_firm_sent_at: string | null; dispatch: { state?: string } | null };

export default function ImportedPacketHandoff({ leadId, claimId }: { leadId: string; claimId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<string[]>([]);
  const [checks, setChecks] = useState([false, false, false, false]);
  const [extra, setExtra] = useState("");
  const query = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
  const intakeUrl = `/api/export/intake-pdf?${query}&preview=1`;

  async function load() {
    const [sourceResponse, deliveryResponse] = await Promise.all([
      fetch(`/api/imported-packet?${query}`, { cache: "no-store" }),
      fetch(`/api/firm-delivery?${query}`, { cache: "no-store" }),
    ]);
    const source = await sourceResponse.json().catch(() => ({}));
    const delivery = await deliveryResponse.json().catch(() => ({}));
    if (!sourceResponse.ok || !deliveryResponse.ok) throw new Error(source.error || delivery.error || "Could not load packet status.");
    setState({ ...source, delivery: delivery.delivery, confirmed_firm_sent_at: delivery.confirmed_firm_sent_at, dispatch: delivery.dispatch });
    setLoading(false);
  }
  useEffect(() => { setState(null); setLoading(true); setError(""); setOpened([]); setChecks([false, false, false, false]);
    void load().catch((cause) => { setError(cause?.message || "Could not load imported packet."); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, claimId]);

  if (loading) return <section className="imported-handoff"><h2>Imported signed packet</h2><p>Checking the original PDFs…</p></section>;
  if (!state) return <section className="imported-handoff"><h2>Imported signed packet needs review</h2><p role="alert">{error}</p></section>;
  const sentAt = state.confirmed_firm_sent_at;
  const owner = state.delivery.owner_email || "";
  const firm = state.delivery.to || "";
  const cc = String(state.delivery.cc || "").split(/[,;]/).map((item) => item.trim()).filter(Boolean);
  const extras = extra.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  const pending = ["sending", "uncertain"].includes(state.dispatch?.state || "");
  const ready = !!firm && !!owner && firm.toLowerCase() !== owner.toLowerCase() && !pending;
  const returnEnd = sentAt ? new Date(Date.parse(sentAt) + 7 * 86400000) : null;
  const daysLeft = returnEnd ? Math.max(0, Math.ceil((returnEnd.getTime() - Date.now()) / 86400000)) : null;

  async function send() {
    if (!state || !ready || busy || sentAt) return;
    if (!opened.includes("intake") || state.documents.some((file) => !opened.includes(file.id)) || !checks.every(Boolean)) {
      setError("Open the intake and every original PDF, then confirm all four review items."); return;
    }
    if (extras.length > 3 || extras.some((value) => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value))) { setError("Enter up to three valid additional addresses."); return; }
    if (!window.confirm(`Is this imported intake firm ready?\n\nSend the intake PDF and every inspected original PDF to ${firm}, with Brett copied at ${owner}?`)) return;
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
    } finally { setBusy(false); }
  }

  return <section className="imported-handoff" aria-label="Imported signed packet handoff">
    <h2>{sentAt ? "SENT TO FIRM" : "NEXT: REVIEW ORIGINALS AND SEND TO FIRM"}</h2>
    {sentAt ? <div role="status"><strong>Firm delivery confirmed {new Date(sentAt).toLocaleString()}.</strong><p>{daysLeft ? `Return window: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Ends ${returnEnd?.toLocaleString()}.` : "Seven-day return window cleared. Ready for billing review."}</p></div> : <>
      <p>LawRuler reported this signed. Inspect the actual packet below. The imported signing date is {state.source_signed_at ? new Date(state.source_signed_at).toLocaleDateString() : "not supplied"}; review does not invent one.</p>
      <div className="imported-handoff-docs"><a href={intakeUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened((old) => [...new Set([...old, "intake"])])}>1. Open intake PDF {opened.includes("intake") ? "✓" : "↗"}</a>
        {state.documents.map((file, index) => <a key={file.id} href={file.url || "#"} target="_blank" rel="noopener noreferrer" aria-disabled={!file.url} onClick={(event) => { if (!file.url) { event.preventDefault(); return; } setOpened((old) => [...new Set([...old, file.id])]); }}>{index + 2}. Open {file.kind === "retainer" ? "signed retainer" : "original PDF"}: {file.name} {opened.includes(file.id) ? "✓" : "↗"}</a>)}
      </div>
      {["I reviewed the intake answers and contact details.", "I inspected the client signatures and names on the original PDFs.", "I verified that the packet includes the required HIPAA/HITECH authorizations.", "I checked the case criteria and there is no unresolved correction."].map((label, index) => <label className="imported-handoff-check" key={label}><input type="checkbox" checked={checks[index]} onChange={() => setChecks((old) => old.map((value, i) => i === index ? !value : value))} />{label}</label>)}
      <div className="imported-handoff-recipient"><strong>To firm:</strong> {firm || "Not configured"}<br /><strong>Copy to Brett:</strong> {owner || "Not configured"}</div>
      <label className="imported-handoff-extra">Additional addresses (optional)<input value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="name@example.com" /></label>
      {!ready && <p role="alert">{pending ? "A previous send has an uncertain outcome. An owner must reconcile it before another attempt." : "The firm and owner recipient addresses must both be configured."}</p>}
      <button type="button" className="imported-handoff-send" disabled={!ready || busy} onClick={() => void send()}>{busy ? "Checking and sending…" : "FILE IS READY FOR FIRM — SEND COMPLETE PACKET"}</button>
      {error && <p className="imported-handoff-error" role="alert">{error}</p>}
    </>}
  </section>;
}
