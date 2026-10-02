"use client";

import { useEffect, useState } from "react";
import OwnerFirmDownload from "./OwnerFirmDownload";

type DeliveryState = {
  claim_id: string;
  firm_sent_at: string | null;
  confirmed_firm_sent_at: string | null;
  prior_owner_only: boolean;
  qa_approved: boolean;
  dispatch?: { state?: string } | null;
  delivery: { firm: string | null; to: string | null; cc: string | null; owner_email: string | null };
};

const email = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const returnEnd = (sentAt: string) => new Date(Date.parse(sentAt) + 7 * 86400000);

/** The only post-call firm handoff in Desk. Status always comes from the server. */
export default function FinalHandoff({ leadId, claimId, missing, onNext, canOverrideDownload = false }: { leadId: string; claimId: string; missing: { label: string; go: () => void }[]; onNext?: () => void; canOverrideDownload?: boolean }) {
  const [state, setState] = useState<DeliveryState | null>(null);
  const [checks, setChecks] = useState([false, false, false]);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [packetUrl, setPacketUrl] = useState<string | null>(null);
  const [openedIntake, setOpenedIntake] = useState(false);
  const [openedPacket, setOpenedPacket] = useState(false);
  const [preview, setPreview] = useState<"intake" | "packet" | null>(null);
  const load = async () => {
    const q = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
    const [r, fileResponse] = await Promise.all([
      fetch(`/api/firm-delivery?${q}`, { cache: "no-store" }),
      fetch(`/api/calls/file?${q}`, { cache: "no-store" }),
    ]);
    const [body, file] = await Promise.all([r.json().catch(() => ({})), fileResponse.json().catch(() => ({}))]);
    if (!r.ok || body.error || body.claim_id !== claimId) throw new Error(body.error || "Could not confirm this matter's delivery state.");
    if ((!fileResponse.ok || file.error) && !body.confirmed_firm_sent_at) throw new Error(file.error || "Could not load the signed packet for review.");
    const agreement = (file.agreements || []).find((row: any) => row.pax == null && !row.voided);
    setPacketUrl(agreement?.status === "completed" ? agreement.signed_url || null : null);
    setState(body);
    window.dispatchEvent(new CustomEvent("cr:firm-handoff", { detail: { leadId, claimId } }));
    setLoading(false);
    return body as DeliveryState;
  };
  useEffect(() => { let live = true; void load().catch((cause) => { if (live) { setError(cause?.message || "Delivery state unavailable."); setLoading(false); } }); return () => { live = false; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId, claimId]);

  const cc = String(state?.delivery?.cc || "").split(/[,;]/).map((item) => item.trim()).filter(Boolean);
  const extras = extra.split(/[,;\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const owner = state?.delivery?.owner_email?.toLowerCase() || "";
  const firm = state?.delivery?.to?.toLowerCase() || "";
  const recipientsReady = !!owner && !!firm && owner !== firm;
  const pending = ["sending", "uncertain"].includes(state?.dispatch?.state || "");
  const sentAt = state?.confirmed_firm_sent_at;
  const daysLeft = sentAt ? Math.max(0, Math.ceil((returnEnd(sentAt).getTime() - Date.now()) / 86400000)) : null;
  const intakeUrl = `/api/export/intake-pdf?lead_id=${encodeURIComponent(leadId)}&claim_id=${encodeURIComponent(claimId)}`;
  const intakePreviewUrl = `${intakeUrl}&preview=1`;
  const openPreview = (kind: "intake" | "packet") => {
    setPreview(kind);
    if (kind === "intake") setOpenedIntake(true);
    else setOpenedPacket(true);
    setError("");
  };

  async function send() {
    if (!state || sentAt || pending || !recipientsReady || busy) return;
    if (missing.length) { setError("Complete the required intake answers before marking this file ready."); return; }
    if (!openedIntake || !openedPacket || !packetUrl) { setError("Review the intake PDF and the signed packet using the two buttons above."); return; }
    if (!checks.every(Boolean)) { setError("Check all three review items before marking this file ready."); return; }
    if (extras.length > 3 || extras.some((address) => !email.test(address))) { setError("Enter up to three valid additional email addresses."); return; }
    const people = [firm, owner, ...cc, ...extras].filter(Boolean);
    if (!window.confirm(`Is this intake firm ready?\n\nSend the intake PDF and completed signed retainer/HIPAA/HITECH packet to:\n${people.join("\n")}\n\nThis starts the firm's 7-day return window only after delivery is confirmed.`)) return;
    setBusy(true); setError("");
    try {
      if (!state.qa_approved) {
        const qa = await fetch("/api/qa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          op: "submit", agent_ready: true, lead_id: leadId, claim_id: claimId, decision: "approve",
          g_qa_pass: "green", g_esign: "green", g_criteria: "green",
          confirm_intake: true, confirm_signed_packet: true, confirm_criteria: true,
          qa_note: "Agent reviewed their own completed intake, signed packet and qualification before final delivery.",
        }) });
        const body = await qa.json().catch(() => ({}));
        if (!qa.ok || !body.ok) throw new Error(body.error || "The file did not pass QA. Nothing was emailed.");
      }
      const response = await fetch("/api/firm-delivery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        lead_id: leadId, claim_id: claimId, include_owner: true, expected_to: state.delivery.to, expected_cc: cc, additional_recipients: extras,
      }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok || body.skipped) throw new Error(body.error || body.skipped || "Firm delivery was not confirmed. Nothing should be marked sent.");
      await load();
    } catch (cause: any) {
      setError(cause?.message || "Delivery was not confirmed. Check this file before retrying.");
      try { await load(); } catch { /* preserve the delivery failure */ }
    } finally { setBusy(false); }
  }

  return <section className={`final-handoff${sentAt ? " final-handoff-sent" : ""}`} aria-label="Final firm handoff">
    <h2>{sentAt ? "Sent to firm" : "Final step: file ready for firm"}</h2>
    {loading && <p>Checking this file’s delivery record…</p>}
    {sentAt ? <div role="status"><strong>Delivered {new Date(sentAt).toLocaleString()}.</strong><p>{daysLeft ? `Return window: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Ends ${returnEnd(sentAt).toLocaleString()}.` : "Seven-day return window cleared. Ready for billing review."}</p><p>Delivered to {state?.delivery?.to}; Brett received a copy.</p>{onNext && <button type="button" className="final-handoff-send" onClick={onNext}>Next call</button>}</div> : state && <>
      <p>The call is dispositioned. Review your own file, then send its two required PDFs together.</p>
      {missing.length > 0 && <div className="final-handoff-error" role="alert"><strong>Intake incomplete: {missing.length} required answer{missing.length === 1 ? "" : "s"} missing.</strong><p>Finish these before the file can go to the firm.</p><ul>{missing.map((item, index) => <li key={`${item.label}-${index}`}><button type="button" onClick={item.go}>{item.label} ↗</button></li>)}</ul></div>}
      <div className="final-handoff-docs" aria-label="Review the two PDFs before sending"><button type="button" onClick={() => openPreview("intake")}>1. Review intake PDF <span>{openedIntake ? "Opened ✓" : "Open PDF"}</span></button><button type="button" disabled={!packetUrl} onClick={() => openPreview("packet")}>2. Review signed retainer + HIPAA/HITECH <span>{!packetUrl ? "Packet pending" : openedPacket ? "Opened ✓" : "Open PDF"}</span></button></div>
      {[
        "I checked the intake answers and contact details.",
        "I opened and approved the client-signed agreement and completed the office step.",
        "I checked the case criteria and there is no unresolved correction.",
      ].map((label, index) => <label className="final-handoff-check" key={label}><input type="checkbox" checked={checks[index]} onChange={() => setChecks((old) => old.map((value, i) => i === index ? !value : value))} />{label}</label>)}
      <div className="final-handoff-address"><b>To firm:</b> {state.delivery.to || "Not configured"}<br /><b>Copy to Brett:</b> {owner || "Not configured"}</div>
      {state.prior_owner_only && <p className="final-handoff-error" role="status">An earlier email reached Brett only. The firm has not received the packet; the seven-day clock has not started.</p>}
      <label className="final-handoff-extra">Additional email addresses (optional)<input type="text" value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="name@example.com, second@example.com" /></label>
      {!recipientsReady && <p className="final-handoff-error" role="alert">Firm delivery is held: the configured firm address is {firm === owner ? "Brett’s address" : "missing"}. Set the separate Turnbull delivery address first.</p>}
      {pending && <p className="final-handoff-error" role="alert">The last delivery outcome needs owner review. Do not retry it.</p>}
      <button type="button" className="final-handoff-send" disabled={busy || pending || !recipientsReady || missing.length > 0} onClick={() => void send()}>{busy ? "Confirming and sending…" : "FILE IS READY FOR FIRM — SEND PACKET"}</button>
    </>}
    {error && <p className="final-handoff-error" role="alert">{error}</p>}
    {canOverrideDownload && <OwnerFirmDownload leadId={leadId} claimId={claimId} />}
    {preview && <div className="final-handoff-preview-backdrop" role="presentation" onClick={() => setPreview(null)}><div className="final-handoff-preview" role="dialog" aria-modal="true" aria-label={preview === "intake" ? "Intake PDF" : "Signed retainer and HIPAA/HITECH packet"} onClick={(event) => event.stopPropagation()}><div className="final-handoff-preview-head"><strong>{preview === "intake" ? "Intake PDF" : "Signed retainer + HIPAA/HITECH"}</strong><div><a href={preview === "intake" ? intakePreviewUrl : packetUrl || "#"} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a><button type="button" onClick={() => setPreview(null)}>Back to file review</button></div></div><iframe title={preview === "intake" ? "Intake PDF preview" : "Signed packet preview"} src={preview === "intake" ? intakePreviewUrl : packetUrl || undefined} /></div></div>}
  </section>;
}
