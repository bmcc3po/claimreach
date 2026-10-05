"use client";
import { useState, useEffect } from "react";
import StatusBadge from "./ui/StatusBadge";
import { DEFAULT_STATUSES, DEFAULT_DQ_REASONS, manualIntakeStatusAllowed, type StatusDef, type DqReason } from "@/lib/statuses";

export default function FileStatusControl({ leadId, current, currentLabel, role, claimId, onChanged }: { leadId: string; current: string; currentLabel?: string; role?: string; claimId?: string | null; onChanged?: (status: string) => void }) {
  const [status, setStatus] = useState(current);
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<StatusDef[]>(DEFAULT_STATUSES);
  const [reasons, setReasons] = useState<DqReason[]>(DEFAULT_DQ_REASONS);
  const [picking, setPicking] = useState<StatusDef | null>(null); // disqualify status awaiting a reason
  // Any other status awaiting a confirm. The badge looks like a label but is a
  // button, so it gets clicked to READ the status, which opened a full menu
  // where one more click committed instantly. That is how a signed file
  // silently became "Signed: WIP" with nobody meaning to change anything.
  const [confirming, setConfirming] = useState<StatusDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const canEdit = role !== "firm";

  // Switching to another claim (or a server refresh) must show THAT claim's
  // status, not the one this control mounted with — the next change targets
  // the newly selected claim (Astra round 5: claim A's badge over claim B).
  useEffect(() => { setStatus(current); setMsg(""); }, [claimId, current]);

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
    try {
      const r = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "status", lead_id: leadId, claim_id: claimId ?? null, status: statusKey, dq_reason_key: dqReasonKey ?? null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { setMsg(d.error || "Could not update status"); return; }
      setStatus(statusKey); setOpen(false); setPicking(null); setConfirming(null);
      onChanged?.(statusKey);
    } catch {
      setMsg("Could not reach ClaimReach. The status was not changed; try again.");
    } finally {
      setBusy(false);
    }
  }

  function choose(s: StatusDef) {
    if (s.key === status) { setOpen(false); return; }          // already there
    if (s.qualify === "disqualify") { setPicking(s); return; }  // require a reason
    setConfirming(s);                                           // everything else confirms
  }

  return (
    <div className="file-status-control">
      <span className="file-status-label">Current status</span>
      <StatusBadge status={status} label={status === current ? currentLabel : undefined} live={statuses} />
      {canEdit && <button type="button" className="file-status-change" onClick={() => { setMsg(""); setOpen(true); }}>Change status</button>}

      {open && canEdit && !picking && !confirming && (
        <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="modal status-dialog" role="dialog" aria-modal="true" aria-label="Change status">
          <div className="status-dialog-head"><strong>Change status</strong><button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>Close</button></div>
          <p className="muted status-dialog-note">Choose the next call status. Signed, QA, and delivery statuses update through their own workflows.</p>
          <div className="status-menu-list">
            {statuses.filter(manualIntakeStatusAllowed).map((s) => (
              <button type="button" key={s.key} className={`status-opt ${s.key === status ? "on" : ""}`} disabled={busy} onClick={() => choose(s)}>
                <span className={`sb-dot ${s.tone}`} />
                <span>{s.label}</span>
                {s.qualify === "disqualify" && <span className="status-opt-tag">reason</span>}
              </button>
            ))}
          </div>
          {msg && <div className="status-menu-msg">{msg}</div>}
          </div>
        </div>
      )}

      {confirming && (
        <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget && !busy) setConfirming(null); }}>
          <div className="modal" style={{ maxWidth: 400, padding: "18px 20px" }}>
            <h3 style={{ marginTop: 0 }}>Change status to {confirming.label}?</h3>
            <p className="muted" style={{ marginTop: 0 }}>This is recorded on the file and on the activity log.</p>
            {msg && <div className="status-menu-msg">{msg}</div>}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14, gap: 8 }}>
              <button className="btn ghost" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
              <button className="btn" disabled={busy}
                onClick={() => { void commit(confirming.key); }}>
                {busy ? "Saving" : `Set ${confirming.label}`}
              </button>
            </div>
          </div>
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
