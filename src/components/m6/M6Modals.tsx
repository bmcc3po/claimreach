"use client";
import { useState, type ReactNode } from "react";
import { OUTCOMES, PURPOSES } from "@/lib/m6";

export type TouchPoint = {
  id: string; kind: string; value: string; label: string | null;
};

export function ModalShell({
  title, onClose, err, children, wide,
}: {
  title: string; onClose: () => void; err: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <div className="m6-modal-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className={wide ? "m6-modal m6-modal-wide" : "m6-modal"}>
        <div className="m6-modal-head">
          <h2>{title}</h2>
          <button type="button" className="m6-linkbtn" onClick={onClose}>Close</button>
        </div>
        {err && <p className="m6-error">{err}</p>}
        {children}
      </div>
    </div>
  );
}

export function LogTouch({
  onClose, onSave, points, busy, err,
}: {
  onClose: () => void;
  onSave: (b: any) => void;
  points: TouchPoint[];
  busy: boolean;
  err: string;
}) {
  const [purpose, setPurpose] = useState("heartbeat");
  const [channel, setChannel] = useState("call");
  const [pointId, setPointId] = useState("");
  const [note, setNote] = useState("");

  return (
    <ModalShell title="Log a touch" onClose={onClose} err={err}>
      <label className="m6-field">
        <span>Why</span>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>

      <label className="m6-field">
        <span>How</span>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="call">Call</option>
          <option value="sms">Text</option>
        </select>
      </label>

      {points.length > 0 && (
        <label className="m6-field">
          <span>Which contact point</span>
          <select value={pointId} onChange={(e) => setPointId(e.target.value)}>
            <option value="">Not sure</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>{p.value} · {p.label || p.kind}</option>
            ))}
          </select>
        </label>
      )}

      <label className="m6-field">
        <span>Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call after 6" />
      </label>

      <p className="m6-hint">How did it end? This is what moves the clock.</p>
      <div className="m6-outcomes">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`m6-outcome ${o.value}`}
            disabled={busy}
            onClick={() => onSave({
              outcome: o.value, purpose, channel,
              contact_point_id: pointId || null,
              body: note || null,
            })}
          >
            <strong>{o.label}</strong>
            <span>{o.hint}</span>
          </button>
        ))}
      </div>
    </ModalShell>
  );
}
