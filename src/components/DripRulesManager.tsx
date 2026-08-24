"use client";
import { useEffect, useState } from "react";
import {
  DRIP_CAMPAIGN_NONE, M6_DRIP_CAMPAIGN,
  dripAssignLabel, dripCampaignLabel, dripChannelLabel,
} from "@/lib/drip-rules";

const CHANNELS = [
  { v: "sms", label: "Text" },
  { v: "email", label: "Email" },
  { v: "call_reminder", label: "Call reminder" },
];
const ASSIGN = [
  { v: "agent", label: "Agent" },
  { v: "case_manager", label: "Case manager" },
  { v: "both", label: "Both" },
];

export default function DripRulesManager({
  lockedCampaign, canEdit = true, variant = "staff",
}: {
  lockedCampaign?: string;
  canEdit?: boolean;
  variant?: "staff" | "m6";
}) {
  const [rules, setRules] = useState<any[]>([]);
  const [campaignKeys, setCampaignKeys] = useState<string[]>([]);
  const [filter, setFilter] = useState(lockedCampaign ?? "");
  const [edit, setEdit] = useState<any | null>(null);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(nextFilter = filter) {
    setLoadErr("");
    try {
      const q = nextFilter ? `?campaign=${encodeURIComponent(nextFilter)}` : "";
      const r = await fetch(`/api/drip${q}`);
      const d = await r.json();
      if (!r.ok) { setLoadErr(d.error || "Could not load sequences."); return; }
      setRules(d.rules ?? []);
      setCampaignKeys(d.campaign_keys ?? []);
    } catch {
      setLoadErr("Could not load sequences. Check your connection.");
    }
  }
  useEffect(() => { load(); }, [filter]);

  async function save() {
    if (!edit?.name?.trim()) { setMsg("Give the sequence a name."); return; }
    setBusy(true); setMsg("");
    const campaign = lockedCampaign || edit.campaign || (filter && filter !== DRIP_CAMPAIGN_NONE ? filter : null);
    const r = await fetch("/api/drip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save_rule", ...edit, campaign }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (d.ok) { setEdit(null); setMsg(""); load(); }
    else setMsg(d.error || "Save failed");
  }
  async function toggle(rule: any) {
    setMsg("");
    const r = await fetch("/api/drip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "toggle_rule", id: rule.id, active: !rule.active }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { setMsg(d.error || "Could not update that sequence."); return; }
    load();
  }
  async function del() {
    if (!pendingDelete) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/drip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "delete_rule", id: pendingDelete.id }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !d.ok) { setMsg(d.error || "Could not delete that sequence."); return; }
    setPendingDelete(null);
    load();
  }

  const scoped = !!(lockedCampaign || (filter && filter !== DRIP_CAMPAIGN_NONE));
  const wrapClass = variant === "m6" ? "" : "card";
  const wrapPad = variant === "m6" ? undefined : { padding: 18 };

  return (
    <div className={wrapClass} style={wrapPad}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>{lockedCampaign === M6_DRIP_CAMPAIGN ? "Motel 6 sequences" : "Sequences"}</h3>
          <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
            These messages go out on a schedule. Pause one to stop it. You can turn it back on later.
          </p>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {!lockedCampaign && (
            <label className="drip-campaign-ear" title="Show one campaign at a time">
              <span>Campaign</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All</option>
                <option value={DRIP_CAMPAIGN_NONE}>Unscoped (TMT / prison / other)</option>
                {(campaignKeys.length ? campaignKeys : [M6_DRIP_CAMPAIGN]).map((k) => (
                  <option key={k} value={k}>{dripCampaignLabel(k)}</option>
                ))}
              </select>
            </label>
          )}
          {canEdit && (
            <button
              className="btn"
              type="button"
              onClick={() => setEdit({
                name: "", channel: "sms", every_days: 10, assign_to: "both",
                template: "", subject: "", active: true,
                campaign: lockedCampaign || (filter && filter !== DRIP_CAMPAIGN_NONE ? filter : null),
              })}
            >
              + New sequence
            </button>
          )}
        </div>
      </div>
      {msg && !edit && <p className="sign-err" style={{ marginTop: 8 }}>{msg}</p>}
      {loadErr && <p className="sign-err" style={{ marginTop: 8 }}>{loadErr}</p>}

      <table className="docket" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Sequence</th>
            {scoped && <th>Stage</th>}
            <th>How</th>
            <th>Every</th>
            <th>Who</th>
            {!lockedCampaign && <th>Campaign</th>}
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              {scoped && <td className="muted">{r.stage || "—"}</td>}
              <td><span className="badge stage">{dripChannelLabel(r.channel)}</span></td>
              <td>{r.delay_days ?? r.every_days} days</td>
              <td className="muted">{dripAssignLabel(r.assign_to)}</td>
              {!lockedCampaign && <td className="muted">{dripCampaignLabel(r.campaign)}</td>}
              <td>{r.active ? <span className="badge count">on</span> : <span className="badge">paused</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {canEdit && (
                  <>
                    <button type="button" className="btn ghost sm" onClick={() => toggle(r)}>{r.active ? "Pause" : "Resume"}</button>
                    <button type="button" className="btn ghost sm" onClick={() => setEdit({ ...r })}>Edit</button>
                    <button type="button" className="btn ghost sm danger" onClick={() => setPendingDelete(r)}>Delete</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr>
              <td colSpan={lockedCampaign ? 6 : 7} className="muted">
                {filter === M6_DRIP_CAMPAIGN || lockedCampaign === M6_DRIP_CAMPAIGN
                  ? "No Motel 6 sequences yet."
                  : "No sequences in this view. Add one, or pick another campaign."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, padding: "20px 22px" }}>
            <h3 style={{ marginTop: 0 }}>{edit.id ? "Edit sequence" : "New sequence"}</h3>
            <div className="grid2">
              <label>Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Check-in text" /></label>
              <label>How
                <select value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value })}>
                  {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
              </label>
              <label>Every (days)<input type="number" min={1} value={edit.every_days} onChange={(e) => setEdit({ ...edit, every_days: e.target.value })} placeholder="10" /></label>
              <label>Who
                <select value={edit.assign_to} onChange={(e) => setEdit({ ...edit, assign_to: e.target.value })}>
                  {ASSIGN.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
                </select>
              </label>
            </div>
            {edit.channel === "email" && (
              <label style={{ display: "block", marginTop: 10 }}>Subject
                <input value={edit.subject ?? ""} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} placeholder="Still with you" />
              </label>
            )}
            {edit.channel !== "call_reminder" && (
              <label style={{ display: "block", marginTop: 10 }}>Message
                <textarea
                  value={edit.template ?? ""}
                  onChange={(e) => setEdit({ ...edit, template: e.target.value })}
                  rows={4}
                  placeholder="Hi {{contact.first_name}}, just checking in."
                  style={{ width: "100%" }}
                />
              </label>
            )}
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              You can use {"{{contact.first_name}}"} and {"{{case.lead_no}}"}. Do not put dollar amounts in the text.
            </p>
            <label className="chk" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> On
            </label>
            {msg && <p className="sign-err" style={{ fontSize: 13 }}>{msg}</p>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save sequence"}</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-back" onClick={() => setPendingDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, padding: "20px 22px" }}>
            <h3 style={{ marginTop: 0 }}>Delete this sequence?</h3>
            <p className="muted">{pendingDelete.name} will be removed. Files already on it lose that step.</p>
            {msg && <p className="sign-err">{msg}</p>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button type="button" className="btn ghost" onClick={() => setPendingDelete(null)}>Keep it</button>
              <button type="button" className="btn danger" disabled={busy} onClick={del}>{busy ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .drip-campaign-ear {
          display: flex; flex-direction: column; gap: 2px; font-size: 11px;
          font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-soft);
        }
        .drip-campaign-ear select { font: inherit; font-size: 13px; font-weight: 600;
          text-transform: none; letter-spacing: 0; padding: 6px 8px; border-radius: 8px;
          border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
      `}</style>
    </div>
  );
}
