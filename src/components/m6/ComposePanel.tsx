"use client";
import { useEffect, useMemo, useState } from "react";

type Tpl = {
  key: string; stage: string; name: string; kind: string; channel: string;
  subject: string | null; body: string; method: string; approvedByFirm: boolean;
};

const STAGES: Record<string, string> = {
  "01": "Day 0",
  "02": "Interview",
  "03": "Thank you",
  "04": "Onboarding",
  "05": "Heartbeat",
  "06": "Ladder",
};

export default function ComposePanel({
  leadId, isStaff = false,
}: {
  leadId: string;
  isStaff?: boolean;
}) {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [key, setKey] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [rails, setRails] = useState({ justcall: false, resend: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/m6/compose?lead_id=${encodeURIComponent(leadId)}`);
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) { setErr(d.error || "Could not load scripts."); return; }
        setTemplates(d.templates ?? []);
        setRails(d.rails ?? { justcall: false, resend: false });
      } catch {
        if (!cancelled) setErr("Could not load scripts.");
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const selected = useMemo(() => templates.find((t) => t.key === key) ?? null, [templates, key]);

  function pick(next: string) {
    setKey(next);
    setErr(""); setOk("");
    const t = templates.find((x) => x.key === next);
    setBody(t?.body ?? "");
    setSubject(t?.subject ?? "");
  }

  async function submit(live: boolean) {
    setBusy(live ? "send" : "log"); setErr(""); setOk("");
    try {
      const r = await fetch("/api/m6/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          template_key: key || null,
          body, subject,
          channel: selected?.channel || "sms",
          live,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) {
        setErr(d.error || (d.gates?.messages || []).join(" ") || "That did not save.");
        return;
      }
      if (d.duplicate) setOk("Already on the timeline. Not sent twice.");
      else if (d.live) setOk("Sent and logged.");
      else setOk(d.error || "Logged to the timeline. Live send is waiting on keys and Josh.");
    } catch {
      setErr("That did not save. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="m6-card m6-compose">
      <h2>Compose</h2>
      <p className="m6-hint">
        Pick a run-sheet script, then log it. Live send stays off until JustCall / Resend
        are in Pages and Josh approves the words.
        {!isStaff && " Drafts are visible; they will not send until approved."}
      </p>
      <label className="m6-field">
        <span>Script</span>
        <select value={key} onChange={(e) => pick(e.target.value)}>
          <option value="">Choose a script</option>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {STAGES[t.stage] || t.stage} · {t.name}{t.approvedByFirm ? "" : " (draft)"}
            </option>
          ))}
        </select>
      </label>
      {selected?.subject != null && (
        <label className="m6-field">
          <span>Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
      )}
      <label className="m6-field">
        <span>Message</span>
        <textarea className="m6-textarea" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {selected?.method && <p className="m6-hint">{selected.method}</p>}
      {err && <p className="m6-error">{err}</p>}
      {ok && <p className="m6-hint">{ok}</p>}
      <div className="m6-health-acts">
        <button type="button" className="m6-btn primary" disabled={!!busy || !body.trim()} onClick={() => void submit(false)}>
          {busy === "log" ? "Saving" : "Log to timeline"}
        </button>
        <button
          type="button"
          className="m6-btn"
          disabled={!!busy || !body.trim() || !selected?.approvedByFirm || (!rails.justcall && !rails.resend)}
          onClick={() => void submit(true)}
        >
          {busy === "send" ? "Sending" : "Send (when live)"}
        </button>
      </div>
    </section>
  );
}
