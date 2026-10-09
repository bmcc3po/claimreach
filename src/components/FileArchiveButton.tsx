"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Discoverable single-file entry to the existing archive/restore API.
 * The server supplies the existing archive capability; API enforcement stays
 * authoritative. This action never exposes permanent deletion. */
export default function FileArchiveButton({ leadId, label, archivedAt, allowed }: {
  leadId: string; label: string; archivedAt?: string | null; allowed: boolean;
}) {
  const router = useRouter();
  const [archived, setArchived] = useState(!!archivedAt);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setArchived(!!archivedAt); }, [archivedAt]);
  if (!allowed) return null;

  async function save() {
    if (busy) return;
    const restore = archived;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: restore ? "restore" : "archive", ids: [leadId], ...(restore ? {} : { reason: reason.trim() || null }) }) });
      if (res.status === 401) throw new Error("Your session expired. Sign in again before changing this file.");
      if (res.status === 403) throw new Error("This account cannot archive or restore files. Ask the owner to do this.");
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || "The file did not update. Try again.");
      setArchived(!restore); setConfirming(false); setReason("");
      setMessage(restore ? "File restored to active lists." : "File archived. Its records and documents are preserved; you can restore it here.");
      router.refresh();
    } catch (e: any) { setError(e?.message || "Could not reach the server. Check the file before trying again."); }
    finally { setBusy(false); }
  }

  return <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, maxWidth: 390 }}>
    <button type="button" className="cl-btn cl-ghost cl-sm" disabled={busy} onClick={() => { setConfirming(true); setMessage(""); setError(""); }}>{archived ? "Restore file" : "Archive file"}</button>
    {confirming && <span role="dialog" aria-label={archived ? "Restore file" : "Archive file"} className="card" style={{ padding: 14 }}>
      <strong>{archived ? "Restore" : "Archive"} {label}?</strong>
      <p style={{ margin: "8px 0" }}>{archived ? "This file and all its matters will return to active lists." : "This archives the whole file and all its matters, hiding it from active lists. The file and documents are retained for at least 90 days and can be restored. This action does not permanently delete them."}</p>
      {!archived && <label>Reason (optional)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example, duplicate file" maxLength={500} /></label>}
      <span className="row" style={{ marginTop: 10 }}><button type="button" className="cl-btn cl-sm" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : archived ? "Confirm restore" : "Confirm archive"}</button><button type="button" className="cl-btn cl-ghost cl-sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></span>
    </span>}
    {message && <span role="status" className="muted">{message}</span>}
    {error && <span role="alert" className="save-msg warn">{error}</span>}
  </span>;
}
