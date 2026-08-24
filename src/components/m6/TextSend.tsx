"use client";
import { useEffect, useState } from "react";
import { ModalShell } from "./M6Modals";

type Tpl = { key: string; name: string; channel: string; body: string; approvedByFirm: boolean };

export default function TextSend({
  leadId, onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [key, setKey] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");
  const [sendingNumber, setSendingNumber] = useState("+12562075828");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/m6/compose?lead_id=${encodeURIComponent(leadId)}`);
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) { setErr(d.error || "Could not load scripts."); return; }
        const sms = (d.templates ?? []).filter((t: Tpl) => t.channel === "sms");
        setTemplates(sms);
        setSendingNumber(d.sendingNumber || "+12562075828");
        const pick = sms.find((t: Tpl) => t.key === "s05_t0_evening_sms") || sms[0];
        if (pick) { setKey(pick.key); setBody(pick.body); }
      } catch {
        if (!cancelled) setErr("Could not load scripts.");
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  function pick(next: string) {
    setKey(next);
    const t = templates.find((x) => x.key === next);
    setBody(t?.body ?? "");
    setErr(""); setOk("");
  }

  async function submit(live: boolean) {
    setBusy(live ? "send" : "log"); setErr(""); setOk("");
    try {
      const r = await fetch("/api/m6/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, template_key: key || null, body, channel: "sms", live }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) {
        setErr(d.error || (d.gates?.messages || []).join(" ") || "That did not save.");
        return;
      }
      if (d.duplicate) setOk("Already on the timeline.");
      else if (d.live) setOk("Sent from +1 256 207 5828.");
      else setOk("Logged. Live send waits on keys and Josh.");
    } catch {
      setErr("That did not save. Check your connection.");
    } finally {
      setBusy("");
    }
  }

  return (
    <ModalShell title="Text" onClose={onClose} err={err}>
      <p className="m6-hint">Same number every time: {sendingNumber}. Quiet hours, opt-out, and safe-contact still apply.</p>
      <label className="m6-field">
        <span>Script</span>
        <select value={key} onChange={(e) => pick(e.target.value)}>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>{t.name}{t.approvedByFirm ? "" : " (draft)"}</option>
          ))}
        </select>
      </label>
      <label className="m6-field">
        <span>Message</span>
        <textarea className="m6-textarea" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {ok && <p className="m6-hint">{ok}</p>}
      <div className="m6-modal-acts">
        <button type="button" className="m6-btn" onClick={onClose}>Close</button>
        <button type="button" className="m6-btn" disabled={!!busy || !body.trim()} onClick={() => void submit(false)}>
          {busy === "log" ? "Saving" : "Log"}
        </button>
        <button type="button" className="m6-btn primary" disabled={!!busy || !body.trim()} onClick={() => void submit(true)}>
          {busy === "send" ? "Sending" : "Send text"}
        </button>
      </div>
    </ModalShell>
  );
}
