"use client";
import { useState, useEffect } from "react";
import StatusBadge from "./ui/StatusBadge";
import { DEFAULT_STATUSES, DEFAULT_DQ_REASONS, type StatusDef, type DqReason } from "@/lib/statuses";

// Clickable status badge on the file. Opens a picker of live statuses; choosing
// a disqualify status forces a non-dismissable DQ-reason selection before it commits.
export default function FileStatusControl({ leadId, current, role }: { leadId: string; current: string; role?: string }) {
  const [status, setStatus] = useState(current);
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<StatusDef[]>(DEFAULT_STATUSES);
  const [reasons, setReasons] = useState<DqReason[]>(DEFAULT_DQ_REASONS);
  const [picking, setPicking] = useState<StatusDef | null>(null); // disqualify status awaiting a reason
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const canEdit = role !== "firm";

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const s = await (await fetch("/api/statuses")).json();
        if (s.statuses?.length) setStatuses(s.statuses);
        const d = await (await fetch("/api/dq-reasons")).json();
        if (d.reasons?.length) setReasons(d.reasons.filter((r: DqReason) => r.active !== false));
      } catch {}
    })();
  }, [open]);

  async function commit(statusKey: string, dqReasonKey?: string) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "status", lead_id: leadId, status: statusKey, dq_reason_key: dqReasonKey ?? null }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Could not update status"); return; }
    setStatus(statusKey); setOpen(false); setPicking(null);
  }

  function choose(s: StatusDef) {
    if (s.qualify === "disqualify") { setPicking(s); return; } // require a reason
    commit(s.key);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => canEdit && setOpen((v) => !v)}
        style={{ background: "none", border: "none", padding: 0, cursor: canEdit ? "pointer" : "default" }}
        title={canEdit ? "Change status" : undefined}
      >
        <StatusBadge status={status} live={statuses} />
        {canEdit && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>▾</span>}
      </button>

      {open && canEdit && !picking && (
        <div className="status-menu" onMouseLeave={() => setOpen(false)}>
          <div className="status-menu-h">Set status</div>
          <div className="status-menu-list">
            {statuses.map((s) => (
              <button key={s.key} className={`status-opt ${s.key === status ? "on" : ""}`} onClick={() => choose(s)}>
                <span className={`sb-dot ${s.tone}`} />
                <span>{s.label}</span>
                {s.qualify === "disqualify" && <span className="status-opt-tag">reason</span>}
              </button>
            ))}
          </div>
          {msg && <div className="status-menu-msg">{msg}</div>}
        </div>
      )}

      {picking && (
        <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) { /* non-dismissable: stay */ } }}>
          <div className="modal" style={{ maxWidth: 420, padding: "18px 20px" }}>
            <h3 style={{ marginTop: 0 }}>Disqualification reason</h3>
            <p className="muted" style={{ marginTop: 0 }}>Choose a reason for "{picking.label}". This is required.</p>
            <div className="status-reasons">
              {reasons.map((r) => (
                <button key={r.key} className="status-reason" disabled={busy} onClick={() => commit(picking.key, r.key)}>
                  {r.label}<span className="status-reason-cat">{r.category}</span>
                </button>
              ))}
            </div>
            {msg && <div className="status-menu-msg">{msg}</div>}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn ghost" disabled={busy} onClick={() => { setPicking(null); }}>Cancel status change</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
