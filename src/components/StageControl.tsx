"use client";
import { useState } from "react";
import { STAGES, STAGE_LABELS, FIRM_WRITABLE_STAGES } from "@/lib/questionnaire";

export default function StageControl({
  leadId, current, firmMode,
}: {
  leadId: string;
  current: string;
  firmMode?: boolean;
}) {
  const [stage, setStage] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const options = firmMode
    ? STAGES.filter((s) => FIRM_WRITABLE_STAGES.includes(s) || s === current)
    : STAGES;

  async function update(next: string) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "stage", lead_id: leadId, stage: next }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(d.error); return; }
    setStage(next); setMsg("Stage updated");
  }

  return (
    <div className="row">
      <select value={stage} disabled={busy} onChange={(e) => update(e.target.value)}>
        {options.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
      </select>
      {msg && <span className="muted">{msg}</span>}
    </div>
  );
}
