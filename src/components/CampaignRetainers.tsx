"use client";
import { useEffect, useState } from "react";

// The set of retainers this campaign is allowed to send. The agent picks between
// these on the call and can reach nothing else, which is the point: sending the
// wrong firm's paper is a legal problem, not a UX one.

type Row = { id: string; label: string; kind: string; template_id: string; is_default: boolean };

export default function CampaignRetainers({
  campaignId, templates,
}: {
  campaignId: string;
  templates: { id: string; name: string; kind?: "text" | "pdf" }[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const r = await fetch(`/api/campaign-retainers?campaign_id=${campaignId}`);
      const d = await r.json();
      setRows(d.retainers ?? []);
    } catch { /* the editor still works without the list */ }
  }
  useEffect(() => { if (campaignId) void load(); }, [campaignId]);

  async function op(body: any) {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/campaign-retainers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const t = await r.text(); const d = t ? JSON.parse(t) : {};
      if (!r.ok) throw new Error(d.error || "failed");
      await load();
    } catch (e: any) { setErr(e?.message || "failed"); }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ margin: "0 0 4px" }}>Retainers this campaign can send</h4>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Only these appear in the agent's picker. Add more than one when the same campaign
        papers differently, like a per-state partner split. One retainer means no picker at all.
      </p>

      {err && <div className="muted" style={{ color: "#b91c1c", fontSize: 12, marginBottom: 8 }}>{err}</div>}

      {rows.length === 0 && (
        <div className="muted" style={{ fontSize: 12.5, padding: "10px 12px", background: "var(--st-warn-bg)",
          border: "1px solid var(--st-warn-bd)", borderRadius: 8, marginBottom: 10 }}>
          No retainer tagged yet. Agents can run the full intake, but nothing can be sent to sign.
        </div>
      )}

      {rows.map((r) => (
        <div key={r.id} className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
          <b style={{ fontSize: 13.5 }}>{r.label}</b>
          <span className="muted" style={{ fontSize: 12 }}>
            {templates.find((t) => t.id === r.template_id)?.name ?? r.template_id} · {r.kind}
          </span>
          {r.is_default
            ? <span className="badge" style={{ fontSize: 10 }}>Default</span>
            : <button className="btn ghost sm" disabled={busy} onClick={() => op({ op: "set_default", id: r.id, campaign_id: campaignId })}>Make default</button>}
          <div className="spacer" />
          <button className="btn ghost sm danger" disabled={busy} onClick={() => op({ op: "remove", id: r.id })}>Remove</button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="What the agent sees, e.g. Tennessee" style={{ width: 220 }} />
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Pick the document…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.kind === "pdf" ? " (PDF)" : ""}</option>)}
        </select>
        <button className="btn sm" disabled={busy || !label.trim() || !templateId}
          onClick={() => {
            const kind = templates.find((t) => t.id === templateId)?.kind ?? "text";
            void op({ op: "add", campaign_id: campaignId, label: label.trim(), template_id: templateId, kind })
              .then(() => { setLabel(""); setTemplateId(""); });
          }}>
          Tag this retainer
        </button>
      </div>
    </div>
  );
}
