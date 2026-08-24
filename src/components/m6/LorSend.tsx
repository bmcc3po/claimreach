"use client";
import { useEffect, useState } from "react";
import { ModalShell } from "./M6Modals";

type RecipientOpt = {
  key: string;
  orgName: string;
  attention: string;
  address: string;
  canMail: boolean;
  label: string;
  recommended?: boolean;
};

type LetterView = {
  subject: string; body: string; clientName: string; leadNo: string | null;
  recipient: { orgName: string; attention: string; address: string };
  from: { companyName: string; attention: string; phone: string; address: string };
  missing: string[];
};

type Preview = {
  letter: LetterView;
  letters?: Record<string, LetterView>;
  recipients?: RecipientOpt[];
  defaultRecipient?: string;
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
  const [recipient, setRecipient] = useState("g6");
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
        setRecipient(d.defaultRecipient || "g6");
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
        body: JSON.stringify({ lead_id: leadId, recipient }),
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

  const choices = preview?.recipients?.length ? preview.recipients : [];
  const shown = (preview && (preview.letters?.[recipient] || preview.letter)) || null;

  return (
    <ModalShell title="Send LOR" onClose={onClose} err={err} wide>
      {!preview && !err && <p className="m6-hint">Loading the letter…</p>}
      {preview && shown && (
        <div className="m6-lor-preview">
          <p className="m6-hint">{preview.rails.whatItDoes}</p>
          {choices.length > 1 && (
            <fieldset className="m6-lor-who">
              <legend>Where should this go?</legend>
              {choices.map((c) => (
                <label key={c.key} className={recipient === c.key ? "on" : ""}>
                  <input
                    type="radio"
                    name="lor-recipient"
                    checked={recipient === c.key}
                    disabled={!c.canMail && c.key !== "g6"}
                    onChange={() => setRecipient(c.key)}
                  />
                  <span>
                    <strong>{c.recommended ? `${c.orgName} (usual)` : c.orgName}</strong>
                    <em>{c.address || "Need a full mailing address to send here."}</em>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <p className="m6-lor-meta">
            To {shown.recipient.orgName}, {shown.recipient.attention}. {shown.recipient.address}.
          </p>
          <pre className="m6-letter">{shown.body}</pre>
          {shown.missing.length > 0 && (
            <p className="m6-hint">Still missing: {shown.missing.join(", ")}. The letter will send with what we have if the name is on the file.</p>
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
        </div>
      )}
    </ModalShell>
  );
}
