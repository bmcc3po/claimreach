"use client";
import { useState } from "react";

export function VitalsCard({ lead }: { lead: any }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<Record<string, any>>({
    phone: lead.phone ?? "", email: lead.email ?? "", address: lead.address ?? "",
    best_time: lead.best_time ?? "", language: lead.language ?? "English", est_value: lead.est_value ?? "",
  });
  const [saving, setSaving] = useState(false);

  function set(k: string, v: any) { setF((s) => ({ ...s, [k]: v })); }
  async function save() {
    setSaving(true);
    await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", lead_id: lead.id, lead: f }),
    }).catch(() => {});
    setSaving(false); setEdit(false);
  }

  if (edit) {
    return (
      <div className="side-card">
        <h3>Vitals <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></h3>
        {[["phone","Phone"],["email","Email"],["address","Address"],["best_time","Best time"],["language","Language"],["est_value","Est. value"]].map(([k,l]) => (
          <div className="field" key={k} style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12 }}>{l}</label>
            <input value={f[k]} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="side-card">
      <h3>Vitals <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setEdit(true)}>✎ Edit</button></h3>
      <div className="vrow"><span className="vk">Phone</span><span className="vv">{lead.phone ?? "—"}</span></div>
      <div className="vrow"><span className="vk">Email</span><span className="vv">{lead.email ?? "—"}</span></div>
      <div className="vrow"><span className="vk">Address</span><span className="vv">{lead.address ?? "—"}</span></div>
      <div className="vrow"><span className="vk">Best time</span><span className="vv">{lead.best_time ?? "—"}</span></div>
      <div className="vrow"><span className="vk">Language</span><span className="vv">{lead.language ?? "English"}</span></div>
      <div className="vrow"><span className="vk">Est. value</span><span className="vv">{lead.est_value ? `$${Number(lead.est_value).toLocaleString()}` : "—"}</span></div>
      {lead.comms_monitored && (
        <div className="badge flag" style={{ marginTop: 10 }}>monitored contact</div>
      )}
    </div>
  );
}

// Grievous coaching panel — stub now, wired to MAVERICK/Grievous later.
export function GrievousPanel() {
  return (
    <div className="gpanel">
      <h3>⚡ Grievous <span style={{ flex: 1 }} /><span style={{ fontSize: 11, opacity: 0.7 }}>coming</span></h3>
      <div style={{ fontSize: 12.5, color: "#c9d6e6", marginBottom: 10 }}>
        Live QA coaching watches answers against campaign criteria.
      </div>
      <div className="gtier"><span className="gon">on</span> Tier 1 · inline guardrails</div>
      <div className="gtier"><span className="gon">on</span> Tier 2 · qualify review</div>
      <div className="gtier"><span style={{ opacity: 0.6 }}>after call</span> Tier 3 · transcript vs form</div>
      <div className="gtier"><span style={{ opacity: 0.6 }}>soon</span> Tier 4 · live coaching</div>
      <a href="https://www.youtube.com/watch?v=JsntlJZ9h1U" target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-block", marginTop: 12, color: "#fff", fontSize: 12.5, fontWeight: 700,
          background: "rgba(255,255,255,.12)", padding: "8px 12px", borderRadius: 8, textDecoration: "none" }}>
        ▶ Open Grievous (placeholder)
      </a>
    </div>
  );
}

// Conversation — JustCall SMS/Call/Email. Reuses the working comms endpoint.
export function ConversationPanel({
  leadId, phone, monitored, safeChannels, activity,
}: {
  leadId: string;
  phone: string | null;
  monitored: boolean;
  safeChannels: string[];
  activity: any[];
}) {
  const [tab, setTab] = useState<"sms" | "email" | "calls">("sms");
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<any[]>(activity ?? []);
  const [busy, setBusy] = useState(false);

  const canText = !monitored || safeChannels.includes("Text");
  const canCall = !monitored || safeChannels.includes("Call");

  async function send(action: "text" | "call") {
    if (!phone) return;
    setBusy(true);
    try {
      const r = await fetch("/api/justcall", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, lead_id: leadId, to: phone, body: msg }),
      });
      let d: any = {};
      try { d = await r.json(); } catch { d = { error: "service unavailable" }; }
      if (r.ok) {
        setLog((l) => [...l, { kind: action === "text" ? "text_out" : "call", body: action === "text" ? msg : "Call initiated", created_at: new Date().toISOString() }]);
        if (action === "text") setMsg("");
      } else {
        setLog((l) => [...l, { kind: "system", body: `Couldn't ${action === "text" ? "send text" : "Reach"}: ${typeof d.error === "string" ? d.error : "service error"}`, created_at: new Date().toISOString() }]);
      }
    } catch (e: any) {
      setLog((l) => [...l, { kind: "system", body: "Connection error", created_at: new Date().toISOString() }]);
    }
    setBusy(false);
  }

  // Hide malformed/legacy error bodies (e.g. stored HTML parse errors).
  function clean(entries: any[]) {
    return entries.filter((a) => {
      const b = String(a.body ?? "");
      return !b.includes("Unexpected token") && !b.includes("<!DOCTYPE") && !b.includes("not valid JSON");
    });
  }

  return (
    <div className="conv">
      <div className="convhdr">
        <button className={tab === "sms" ? "active" : ""} onClick={() => setTab("sms")}>SMS</button>
        <button className={tab === "email" ? "active" : ""} onClick={() => setTab("email")}>Email</button>
        <button className={tab === "calls" ? "active" : ""} onClick={() => setTab("calls")}>Calls</button>
      </div>

      {monitored && (
        <div className="paneflag" style={{ margin: 12 }}>
          Monitored contact — safe channels only: {safeChannels.join(", ") || "none"}.
        </div>
      )}

      <div className="convbody">
        {clean(log).filter((a) => tab === "sms" ? (a.kind?.startsWith("text") || a.kind === "system") : tab === "calls" ? a.kind === "call" : false)
          .map((a, i) => (
            <div key={i} className={`bubble ${a.kind === "text_out" ? "outb" : "inb"}`}>
              {a.body}
              <div className="bmeta">{new Date(a.created_at).toLocaleString()}</div>
            </div>
          ))}
        {log.length === 0 && <div className="muted">No messages yet.</div>}
      </div>

      {tab === "sms" && (
        <div className="convsend">
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Text…" />
          <button className="btn" disabled={busy || !canText || !msg} onClick={() => send("text")}>Send</button>
        </div>
      )}
      {tab === "calls" && (
        <div className="convsend">
          <button className="btn" disabled={busy || !canCall} onClick={() => send("call")}>📞 Reach</button>
        </div>
      )}
      {tab === "email" && (
        <div className="convsend"><span className="muted">Email logging coming.</span></div>
      )}
    </div>
  );
}
