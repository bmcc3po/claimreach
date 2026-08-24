"use client";
import { useEffect, useState } from "react";
import { ModalShell } from "./M6Modals";

type Preview = {
  letter: {
    subject: string; body: string; clientName: string; leadNo: string | null;
    recipient: { orgName: string; attention: string; address: string };
    from: { companyName: string; attention: string; phone: string; address: string };
    missing: string[];
  };
  alreadySent: boolean;
  canSend: boolean;
  rails: { postgrid: boolean; mode: string; whatItDoes: string };
};

export default function LorSend({
  leadId, onClose, onSent,
}: {
  leadId: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/m6/lor?lead_id=${encodeURIComponent(leadId)}`);
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || d.error) { setErr(d.error || "Could not load the letter."); return; }
        setPreview(d as Preview);
      } catch {
        if (!cancelled) setErr("Could not load the letter.");
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  async function send() {
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await fetch("/api/m6/lor/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { setErr(d.error || "The letter did not send."); return; }
      const mode = d.live ? "PostGrid mailed it." : "PostGrid test letter created. Nothing went to a live mailbox.";
      setOk(d.tracking ? `${mode} Tracking ${d.tracking}.` : mode);
      onSent?.();
    } catch {
      setErr("The letter did not send. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Send LOR" onClose={onClose} err={err}>
      {!preview && !err && <p className="m6-hint">Loading the letter…</p>}
      {preview && (
        <>
          <p className="m6-hint">{preview.rails.whatItDoes}</p>
          <p className="m6-lor-meta">
            To {preview.letter.recipient.orgName}, {preview.letter.recipient.attention}. {preview.letter.recipient.address}.
          </p>
          <pre className="m6-letter">{preview.letter.body}</pre>
          {preview.letter.missing.length > 0 && (
            <p className="m6-hint">Still missing: {preview.letter.missing.join(", ")}. The letter will send with what we have if the name is on the file.</p>
          )}
          {ok && <p className="m6-hint">{ok}</p>}
          <div className="m6-modal-acts">
            <button type="button" className="m6-btn" onClick={onClose}>{ok ? "Close" : "Cancel"}</button>
            <button
              type="button"
              className="m6-btn primary"
              disabled={busy || preview.alreadySent || !preview.canSend || !!ok}
              onClick={() => void send()}
            >
              {busy ? "Sending" : preview.alreadySent ? "Already sent" : preview.canSend ? "Send certified mail" : "Cannot send yet"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
