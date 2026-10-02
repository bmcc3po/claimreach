"use client";

import { useEffect, useState } from "react";
import { INBOUND_DOCUMENT_TYPES, NETFLY_DOCUMENT_KINDS } from "@/lib/netfly-documents";

type DocumentRow = { id: string; file_name: string; doc_type: string; created_at: string; url: string | null };

export default function NetflyDocuments({ fileKey, canEdit }: { fileKey: string; canEdit: boolean }) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [lastRequest, setLastRequest] = useState<{ send_status: string; occurred_at: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    try {
      const response = await fetch(`/api/netfly/documents?file=${encodeURIComponent(fileKey)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load photos.");
      setDocs(result.docs || []); setPhone(result.phone || ""); setMessage(result.request_text || ""); setLastRequest(result.last_request || null);
      setError("");
    } catch (cause: any) { setError(cause?.message || "Could not load photos."); }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [fileKey]);

  async function label(id: string, kind: string) {
    setBusy(id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/netfly/documents", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: fileKey, document_id: id, kind }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Label did not save.");
      await refresh();
      setNotice("Picture labeled on this file.");
    } catch (cause: any) { setError(cause?.message || "Label did not save."); }
    finally { setBusy(""); }
  }

  async function requestPhotos() {
    if (!consent || !phone || !message) return;
    if (!window.confirm(`Send this photo request to ${phone}?\n\n${message}`)) return;
    setBusy("send"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/netfly/documents", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "request_photos", file: fileKey, client_agreed_to_text: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Text did not send.");
      setNotice("JustCall accepted the photo request. Replies will appear below after the webhook files them.");
      setConsent(false);
      await refresh();
    } catch (cause: any) { setError(cause?.message || "Text did not send."); }
    finally { setBusy(""); }
  }

  const unclassified = docs.filter((doc) => INBOUND_DOCUMENT_TYPES.has(doc.doc_type));
  return <div className="nf-collect" aria-label="Case-manager document collection">
    <div className="nf-collect-head"><div><strong>Gather the pictures</strong><p>Ask for each item. A reply with an attachment loads onto this file automatically when this is the only file with the client's number.</p></div><button type="button" className="nf-secondary" onClick={() => void refresh()}>Refresh pictures</button></div>
    <div className="nf-collect-grid">{NETFLY_DOCUMENT_KINDS.map((kind) => {
      const found = docs.filter((doc) => doc.doc_type === kind.key);
      return <div className={`nf-collect-item${found.length ? " is-received" : ""}`} key={kind.key}>
        <strong>{kind.label}</strong><span>{found.length ? `${found.length} received` : "Still needed / not available yet"}</span>
        {found.map((doc) => <a key={doc.id} href={doc.url || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!doc.url}>{doc.file_name}</a>)}
      </div>;
    })}</div>
    {unclassified.length > 0 && <div className="nf-collect-inbox"><strong>{unclassified.length} new client picture{unclassified.length === 1 ? "" : "s"} to identify</strong><p>These were loaded onto this file. Open each and label it before marking the checklist complete; we do not guess what an image contains.</p>
      {unclassified.map((doc) => <div className="nf-collect-upload" key={doc.id}><a href={doc.url || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!doc.url}>{doc.file_name}</a><select aria-label={`Identify ${doc.file_name}`} defaultValue="" disabled={!canEdit || !!busy} onChange={(event) => { if (event.target.value) void label(doc.id, event.target.value); }}><option value="">Choose what this is</option>{NETFLY_DOCUMENT_KINDS.map((kind) => <option key={kind.key} value={kind.key}>{kind.label}</option>)}</select></div>)}
    </div>}
    {canEdit && <div className="nf-collect-request"><strong>Want the client to send pictures by text?</strong><p>Read the request to the client. Confirm they agree to receive it at {phone || "a verified mobile number"}. Automatic outreach remains off for NETFLY.</p>{lastRequest && lastRequest.send_status !== "failed" && <p className="nf-saved" role="status">Photo request {lastRequest.send_status === "sent" ? "accepted by JustCall" : "pending reconciliation"} on {new Date(lastRequest.occurred_at).toLocaleString()}. Replies load below when received.</p>}<blockquote>{message}</blockquote><label><input type="checkbox" checked={consent} disabled={!!lastRequest && lastRequest.send_status !== "failed"} onChange={(event) => setConsent(event.target.checked)} /> The client agreed to receive this one photo request by text at {phone || "their verified number"}.</label><button type="button" className="nf-primary" disabled={!consent || !phone || !!busy || (!!lastRequest && lastRequest.send_status !== "failed")} onClick={() => void requestPhotos()}>{busy === "send" ? "Sending…" : "Send photo request"}</button></div>}
    {notice && <p className="nf-saved" role="status">{notice}</p>}
    {error && <p className="nf-alert" role="alert">{error}</p>}
  </div>;
}
