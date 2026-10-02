"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ExternalFirmDelivery({ leadId, claimId }: { leadId: string; claimId: string }) {
  const router = useRouter();
  const [firm, setFirm] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState("");
  const [matterSent, setMatterSent] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
  async function refresh() {
    const response = await fetch(`/api/firm-delivery?${query}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not check firm delivery.");
    setFirm(result.delivery?.to || "");
    setSent(result.confirmed_firm_sent_at || null);
    setClaimStatus(result.claim_status || "");
    setMatterSent(result.firm_sent_at || null);
  }
  useEffect(() => { setOpen(false); setError(""); setWhen(""); setNote(""); setConfirmed(false);
    void refresh().catch((cause) => setError(cause?.message || "Could not check firm delivery."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, claimId]);

  async function record() {
    if (!firm || !when || !confirmed || note.trim().length < 10 || busy) {
      setError("Enter the actual sent time and evidence from your sent email, then confirm the recipient and attachments."); return;
    }
    const sentAt = new Date(when);
    if (!Number.isFinite(sentAt.getTime())) { setError("Enter a valid send date and time."); return; }
    const pacific = sentAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short", timeZoneName: "short" });
    if (!window.confirm(`Record that you ALREADY emailed this signed packet to ${firm} on ${pacific}?\n\nClaimReach will not send an email. This starts the seven-day return clock from the time you entered.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/firm-delivery/external", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        lead_id: leadId, claim_id: claimId, to_email: firm, sent_at: sentAt.toISOString(), evidence_note: note.trim(), confirmed: true,
      }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Outside delivery was not recorded.");
      setSent(result.sent_at); setOpen(false); router.refresh();
    } catch (cause: any) { setError(cause?.message || "Could not record the outside send. Refresh before trying again.");
      try { await refresh(); } catch { /* Keep the original error. */ }
    } finally { setBusy(false); }
  }

  async function finishRecorded() {
    if (!window.confirm("Finish updating this file from the outside delivery already recorded? This sends no email.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/firm-delivery/external", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "finish-existing", lead_id: leadId, claim_id: claimId, confirmed: true }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "The file status did not finish updating.");
      await refresh(); router.refresh();
    } catch (cause: any) { setError(cause?.message || "The file status did not finish updating."); }
    finally { setBusy(false); }
  }

  const needsRepair = !!sent && (claimStatus !== "delivered" || !matterSent);

  return <section className="external-firm-delivery" style={{ margin: "12px 0", padding: "16px 20px", background: "#fff", border: "1px solid #bfd0e3", borderRadius: 12 }}>
    {sent ? <><p role="status" style={{ margin: 0, color: "#0c6043", fontWeight: 750 }}>Firm delivery recorded · {new Date(sent).toLocaleString("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "short" })}</p>{needsRepair && <p role="alert">The outside send is recorded, but the file status needs one more update. <button type="button" className="cl-btn cl-sm" disabled={busy} onClick={() => void finishRecorded()}>{busy ? "Updating…" : "Finish status update"}</button></p>}{error && <p role="alert" style={{ color: "#a42c20" }}>{error}</p>}</> : <>
      <strong style={{ display: "block", fontSize: 18 }}>Already emailed this file outside ClaimReach?</strong>
      <p style={{ margin: "5px 0 12px", color: "#52647a" }}>Record the real send time so the file leaves QA and its seven-day firm return clock starts. This does not email anyone.</p>
      <button type="button" className="cl-btn cl-ghost" onClick={() => setOpen(!open)}>{open ? "Close" : "Record outside firm send"}</button>
      {open && <div style={{ display: "grid", gap: 12, maxWidth: 550, marginTop: 15 }}>
        <div><strong>Firm recipient:</strong> {firm || "Not configured"}</div>
        <label style={{ display: "grid", gap: 5 }}>Actual email send time <small>Enter the time in this device’s time zone. We show the Pacific time before saving.</small><input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} /></label>
        <label style={{ display: "grid", gap: 5 }}>Sent-email evidence <small>For example, the email subject, message ID, or where you verified it in Sent.</small><textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={500} rows={3} /></label>
        <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I checked the sent email, the firm recipient, and the packet attachments.</label>
        <button type="button" className="cl-btn" disabled={busy || !firm} onClick={() => void record()}>{busy ? "Recording…" : "Confirm outside send and start 7-day clock"}</button>
      </div>}
      {error && <p role="alert" style={{ color: "#a42c20", marginBottom: 0 }}>{error}</p>}
    </>}
  </section>;
}
