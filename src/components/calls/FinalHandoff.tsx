"use client";

import { useEffect, useRef, useState } from "react";
import OwnerFirmDownload from "./OwnerFirmDownload";
import { officeDateTime } from "@/lib/office-clock";
import FinishFileSteps from "./FinishFileSteps";

type DeliveryState = {
  claim_id: string;
  firm_sent_at: string | null;
  confirmed_firm_sent_at: string | null;
  owner_confirmed_delivery?: boolean;
  prior_owner_only: boolean;
  qa_approved: boolean;
  dispatch?: { state?: string } | null;
  delivery: { firm: string | null; to: string | null; cc: string | null; owner_email: string | null };
};

const email = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const returnEnd = (sentAt: string) => new Date(Date.parse(sentAt) + 7 * 86400000);

/** The only post-call firm handoff in Desk. Status always comes from the server. */
export default function FinalHandoff({ leadId, claimId, missing, onNext, onAgreement, canOverrideDownload = false }: { leadId: string; claimId: string; missing: { label: string; go: () => void }[]; onNext?: () => void; onAgreement?: () => void; canOverrideDownload?: boolean }) {
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
  const [celebrate, setCelebrate] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(false), 6500);
    return () => clearTimeout(timer);
  }, [celebrate]);
  const load = async () => {
    const q = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
    const [r, fileResponse] = await Promise.all([
      fetch(`/api/firm-delivery?${q}`, { cache: "no-store" }),
      fetch(`/api/calls/file?${q}`, { cache: "no-store" }),
    ]);
    const [body, file] = await Promise.all([r.json().catch(() => ({})), fileResponse.json().catch(() => ({}))]);
    if (!r.ok || body.error || body.claim_id !== claimId) throw new Error(body.error || "Could not confirm this matter's delivery state.");
    if ((!fileResponse.ok || file.error) && !body.confirmed_firm_sent_at && !body.owner_confirmed_delivery) throw new Error(file.error || "Could not load the signed packet for review.");
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
  const people = [...new Set([firm, owner, ...cc, ...extras].filter(Boolean))];
  const recipientKey = JSON.stringify([leadId, claimId, firm, owner, cc, extras]);
  const recipientsReady = !!owner && !!firm && owner !== firm;
  const pending = ["sending", "uncertain"].includes(state?.dispatch?.state || "");
  const sentAt = state?.confirmed_firm_sent_at;
  const ownerSent = !!state?.owner_confirmed_delivery;
  const daysLeft = sentAt ? Math.max(0, Math.ceil((returnEnd(sentAt).getTime() - Date.now()) / 86400000)) : null;
  const intakeUrl = `/api/export/intake-pdf?lead_id=${encodeURIComponent(leadId)}&claim_id=${encodeURIComponent(claimId)}`;
  const intakePreviewUrl = `${intakeUrl}&preview=1`;
  const nextReview = missing.length ? "answers" : !openedIntake ? "intake" : !packetUrl ? "packet-pending" : !openedPacket ? "packet" : !checks.every(Boolean) ? "checks" : "send";
  const guideActive = !loading && !pending && !busy && !error;
  const cue = (step: string) => guideActive && nextReview === step ? " finish-file-pulse" : "";
  const openPreview = (kind: "intake" | "packet") => {
    setPreview(kind);
    if (kind === "intake") setOpenedIntake(true);
    else setOpenedPacket(true);
    setError("");
  };

  function ready() {
    if (!state || sentAt || ownerSent || pending || !recipientsReady || busy || sending.current) return false;
    if (missing.length) { setError("Complete the required intake answers before marking this file ready."); return false; }
    if (!openedIntake || !openedPacket || !packetUrl) { setError("Review the intake PDF and the signed packet using the two buttons above."); return false; }
    if (!checks.every(Boolean)) { setError("Check all three review items before marking this file ready."); return false; }
    if (extras.length > 3 || extras.some((address) => !email.test(address))) { setError("Enter up to three valid additional email addresses."); return false; }
    return true;
  }

  function reviewSend() {
    if (!ready()) return;
    setError("");
    setConfirmation(recipientKey);
  }

  async function send() {
    if (!ready() || !state) return;
    if (!confirmation || confirmation !== recipientKey) { setConfirmation(null); setError("The recipients changed. Review them again before sending."); return; }
    sending.current = true;
    setBusy(true); setError("");
    try {
      if (!state.qa_approved) {
        const qa = await fetch("/api/calls/qa/ready", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
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
      const confirmed = await load();
      if (confirmed.confirmed_firm_sent_at) setCelebrate(true);
    } catch (cause: any) {
      setError(cause?.message || "Delivery was not confirmed. Check this file before retrying.");
      try { await load(); } catch { /* preserve the delivery failure */ }
    } finally { sending.current = false; setBusy(false); setConfirmation(null); }
  }

  return <section className={`final-handoff${sentAt ? " final-handoff-sent" : ""}`} aria-label="Final firm handoff">
    {celebrate && sentAt && <div className="firm-send-celebration" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map((n) => <span key={n} style={{ left: `${8 + n * 14}%`, animationDelay: `${n * 0.18}s` }}>🎈</span>)}</div>}
    <h2>{sentAt || ownerSent ? "Sent to firm" : "Last step: send this file"}</h2>
    {!loading && state && <FinishFileSteps current={sentAt || ownerSent ? "sent" : "send"} />}
    {loading && <p>Checking this file’s delivery record…</p>}
    {sentAt ? <div role="status"><strong>{celebrate ? "File sent! You’re all done." : `Delivered ${officeDateTime(sentAt)}.`}</strong><p>{daysLeft ? `Return window: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Ends ${officeDateTime(returnEnd(sentAt).toISOString())}.` : "Seven-day return window cleared. Review window cleared."}</p><p>Delivered to {state?.delivery?.to}; Brett received a copy.</p>{onNext && <button type="button" className="final-handoff-send" onClick={onNext}>Back to my calls</button>}</div> : ownerSent ? <div role="status"><strong>The owner confirmed this file was already sent to the firm.</strong><p>The original delivery date was not recorded. The return window cannot be calculated. Do not send it again.</p>{onNext && <button type="button" className="final-handoff-send" onClick={onNext}>Back to my calls</button>}</div> : state && <>
      <p className="finish-file-instruction" role="status">{nextReview === "answers" ? "Next: finish the missing answers below." : nextReview === "intake" ? "Next: open and check the intake PDF." : nextReview === "packet-pending" ? "Next: finish the agreement to make the signed packet available." : nextReview === "packet" ? "Next: open and check the signed packet." : nextReview === "checks" ? "Next: check the three review items below." : "Ready for your final send. Check the recipients below."} Look for <b>Sent to firm</b> to confirm you’re done.</p>
      {missing.length > 0 && <div className="final-handoff-error" role="alert"><strong>Intake incomplete: {missing.length} required answer{missing.length === 1 ? "" : "s"} missing.</strong><p>Finish these before the file can go to the firm.</p><ul>{missing.map((item, index) => <li key={`${item.label}-${index}`}><button type="button" onClick={item.go}>{item.label} ↗</button></li>)}</ul></div>}
      <div className="final-handoff-docs" aria-label="Review the two PDFs before sending"><button type="button" className={cue("intake")} onClick={() => openPreview("intake")}>1. Review intake PDF <span>{openedIntake ? "Opened ✓" : "Open PDF"}</span></button><button type="button" className={cue("packet")} disabled={!packetUrl} onClick={() => openPreview("packet")}>2. Review signed retainer + HIPAA/HITECH <span>{!packetUrl ? "Packet pending" : openedPacket ? "Opened ✓" : "Open PDF"}</span></button></div>
      {!packetUrl && onAgreement && <button type="button" className={`signed-inline-next${cue("packet-pending")}`} onClick={onAgreement}>Open agreement — finish or check status →</button>}
      {[
        "I checked the intake answers and contact details.",
        "I opened and approved the client-signed agreement and completed the office step.",
        "I checked the case criteria and there is no unresolved correction.",
      ].map((label, index) => <label className={`final-handoff-check${index === checks.indexOf(false) ? cue("checks") : ""}`} key={label}><input type="checkbox" checked={checks[index]} disabled={busy} onChange={() => { setConfirmation(null); setChecks((old) => old.map((value, i) => i === index ? !value : value)); }} />{label}</label>)}
      <div className="final-handoff-address"><b>To firm:</b> {state.delivery.to || "Not configured"}<br /><b>Copy to Brett:</b> {owner || "Not configured"}</div>
      {state.prior_owner_only && <p className="final-handoff-error" role="status">An earlier email reached Brett only. The firm has not received the packet; the seven-day clock has not started.</p>}
      <label className="final-handoff-extra">Additional email addresses (optional)<input type="text" value={extra} disabled={busy} onChange={(event) => { setConfirmation(null); setExtra(event.target.value); }} placeholder="name@example.com, second@example.com" /></label>
      {!recipientsReady && <p className="final-handoff-error" role="alert">Firm delivery is held: the configured firm address is {firm === owner ? "Brett’s address" : "missing"}. Set the separate Turnbull delivery address first.</p>}
      {pending && <p className="final-handoff-error" role="alert">The last delivery outcome needs owner review. Do not retry it.</p>}
      {confirmation ? <section className="final-handoff-confirm" aria-label="Confirm firm delivery">
        <h3>Send this file?</h3>
        <p>The intake PDF and completed signed retainer/HIPAA/HITECH packet will go to:</p>
        <ul>{people.map(address => <li key={address}>{address}</li>)}</ul>
        <p>The firm’s seven-day return window starts only after delivery is confirmed.</p>
        <div><button type="button" autoFocus disabled={busy} onClick={() => setConfirmation(null)}>Go back</button><button type="button" className="final-handoff-send" disabled={busy || pending || !recipientsReady || missing.length > 0} onClick={() => void send()}>{busy ? "Confirming and sending…" : "Confirm & send"}</button></div>
      </section> : <button type="button" className={`final-handoff-send${recipientsReady ? cue("send") : ""}`} disabled={busy || pending || !recipientsReady || missing.length > 0} onClick={reviewSend}>Send file to firm →</button>}
    </>}
    {error && <p className="final-handoff-error" role="alert">{error}</p>}
    {canOverrideDownload && <OwnerFirmDownload leadId={leadId} claimId={claimId} />}
    {preview && <div className="final-handoff-preview-backdrop" role="presentation" onClick={() => setPreview(null)}><div className="final-handoff-preview" role="dialog" aria-modal="true" aria-label={preview === "intake" ? "Intake PDF" : "Signed retainer and HIPAA/HITECH packet"} onClick={(event) => event.stopPropagation()}><div className="final-handoff-preview-head"><strong>{preview === "intake" ? "Intake PDF" : "Signed retainer + HIPAA/HITECH"}</strong><div><a href={preview === "intake" ? intakePreviewUrl : packetUrl || "#"} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a><button type="button" onClick={() => setPreview(null)}>Back to file review</button></div></div><iframe title={preview === "intake" ? "Intake PDF preview" : "Signed packet preview"} src={preview === "intake" ? intakePreviewUrl : packetUrl || undefined} /></div></div>}
  </section>;
}
