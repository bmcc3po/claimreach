"use client";
import { useEffect, useRef, useState } from "react";
import { ModalShell } from "./M6Modals";
import { composeResultCopy } from "@/lib/m6-compose-copy";

function prettyFrom(raw: string) {
  const d = String(raw ?? "").replace(/\D/g, "").replace(/^1/, "");
  if (d.length !== 10) return raw;
  return `+1 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

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
  const inFlight = useRef(false);
  const [sendingNumber, setSendingNumber] = useState("+12562075828");
  const [justcall, setJustcall] = useState(true);

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
        setJustcall(d.rails?.justcall !== false);
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
    if (inFlight.current || !body.trim()) return;
    inFlight.current = true;
    setBusy(live ? "send" : "log"); setErr(""); setOk("");
    try {
      const r = await fetch("/api/m6/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, template_key: key || null, body, channel: "sms", live }),
      });
      const d = await r.json().catch(() => null);
      const status = String(d?.send_status || "");
      if (!r.ok) {
        setErr(d?.error || "Could not confirm the result. Check the timeline before trying again. Your draft is still here.");
        return;
      }
      const result = composeResultCopy(d);
      if (result.err) setErr(result.err);
      else if (!d.duplicate && d.live && status === "sent") setOk(`Sent from ${prettyFrom(d.sendingNumber || sendingNumber)}.`);
      else setOk(result.ok || "");
    } catch {
      setErr("Could not confirm the result. Your draft is still here. Check the timeline before trying again.");
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }

  const fromLabel = prettyFrom(sendingNumber);

  return (
    <ModalShell title="Text" onClose={onClose} err={err} busy={!!busy}>
      <p className="m6-hint">Same number every time: {fromLabel}. Quiet hours, opt-out, and safe-contact still apply.</p>
      {!justcall && (
        <p className="m6-hint">JustCall keys are not in Cloudflare Pages. You can still log the text.</p>
      )}
      <label className="m6-field">
        <span>Script</span>
        <select disabled={!!busy} value={key} onChange={(e) => pick(e.target.value)}>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>{t.name}{t.approvedByFirm ? "" : " (draft)"}</option>
          ))}
        </select>
      </label>
      <label className="m6-field">
        <span>Message</span>
        <textarea disabled={!!busy} className="m6-textarea" rows={5} value={body} onChange={(e) => {setBody(e.target.value);setOk("");}} />
      </label>
      {ok && <p className="m6-hint">{ok}</p>}
      <div className="m6-modal-acts">
        <button type="button" className="m6-btn" disabled={!!busy} onClick={onClose}>Close</button>
        <button type="button" className="m6-btn" disabled={!!busy || !body.trim()} onClick={() => void submit(false)}>
          {busy === "log" ? "Saving" : "Log"}
        </button>
        <button
          type="button"
          className="m6-btn primary"
          disabled={!!busy || !body.trim() || !justcall}
          onClick={() => void submit(true)}
        >
          {busy === "send" ? "Sending" : "Send text"}
        </button>
      </div>
    </ModalShell>
  );
}
